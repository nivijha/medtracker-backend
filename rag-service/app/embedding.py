"""Embedding abstraction.

Three implementations:
- SentenceTransformerEmbedder: local MiniLM (real). sentence-transformers is
  imported lazily so unit tests / lightweight imports don't pay the cost.
- HfInferenceEmbedder: production embedder using Hugging Face Inference API.
  No local ML deps; uses HTTP to get 384-dim embeddings.
- FakeEmbedder: deterministic, fixed-dimension vectors for tests (no model).
"""
from __future__ import annotations

import hashlib
import logging
import math
import random
import time
from typing import Protocol

logger = logging.getLogger("rag")


class EmbeddingProvider(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    dim = 384  # all-MiniLM-L6-v2

    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model = None

    def _ensure(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure()
        vectors = model.encode(texts, normalize_embeddings=True)
        return [list(map(float, v)) for v in vectors]


_RETRYABLE_STATUS = frozenset({429, 502, 503, 504})


def _parse_retry_after_ms(value: str | None) -> int | None:
    if not value:
        return None
    s = value.strip()
    try:
        secs = int(s)
        if 0 <= secs <= 120:
            return secs * 1000
    except ValueError:
        pass
    try:
        import email.utils as _eu

        ts = _eu.parsedate_to_datetime(s)
        if ts is not None:
            import datetime as _dt

            now = _dt.datetime.now(tz=_dt.timezone.utc)
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=_dt.timezone.utc)
            delta = (ts - now).total_seconds() * 1000
            if 0 < delta <= 120_000:
                return int(delta)
    except Exception:
        pass
    return None


class HfInferenceEmbedder:
    """Production embedder using Hugging Face Inference API.

    Calls `https://router.huggingface.co/hf-inference/models/{model_name}`
    (or legacy api-inference.huggingface.co) with Authorization: Bearer
    <api_key>. Returns normalized 384-dim vectors compatible with pgvector.
    """

    dim = 384

    def __init__(self, model_name: str, api_key: str, api_url: str = "https://api-inference.huggingface.co") -> None:
        self._model_name = model_name
        self._api_key = api_key
        self._api_url = api_url.rstrip("/")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        from .config import settings

        max_attempts = max(1, int(getattr(settings, "embedding_max_retries", 3)))
        base_delay_ms = int(getattr(settings, "embedding_retry_delay_ms", 2000))
        max_delay_ms = int(getattr(settings, "embedding_retry_max_delay_ms", 4000))
        connect_s = float(getattr(settings, "embedding_connect_timeout", 10.0))
        read_s = float(getattr(settings, "embedding_read_timeout", 60.0))
        write_s = float(getattr(settings, "embedding_write_timeout", 30.0))
        pool_s = float(getattr(settings, "embedding_pool_timeout", 10.0))

        import httpx

        url = f"{self._api_url}/models/{self._model_name}/pipeline/feature-extraction"
        headers = {"Authorization": f"Bearer {self._api_key}"}
        payload = {"inputs": texts, "options": {"wait_for_model": True}}
        timeout = httpx.Timeout(connect=connect_s, read=read_s, write=write_s, pool=pool_s)
        t0 = time.time()

        last_exc: Exception | None = None
        for attempt in range(1, max_attempts + 1):
            is_last = attempt == max_attempts
            logger.info("embedding_started attempt=%d max_attempts=%d texts=%d", attempt, max_attempts, len(texts))
            attempt_t0 = time.time()
            try:
                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(url, headers=headers, json=payload)

                    if resp.status_code in (400, 401, 403):
                        raise RuntimeError(f"Hugging Face embedding API failed ({resp.status_code}): {resp.text}")
                    if resp.status_code in _RETRYABLE_STATUS:
                        retry_after = _parse_retry_after_ms(resp.headers.get("retry-after"))
                        if retry_after is not None:
                            delay_ms = min(max(retry_after, base_delay_ms), max_delay_ms)
                        else:
                            delay_ms = min(base_delay_ms * (2 ** (attempt - 1)) + random.randint(0, 400), max_delay_ms)
                        if is_last:
                            raise RuntimeError(f"Hugging Face embedding API failed ({resp.status_code}): {resp.text}")
                        elapsed_ms = int((time.time() - t0) * 1000)
                        logger.warning(
                            "embedding_retry attempt=%d max_attempts=%d status=%d error=%s delay_ms=%d elapsed_ms=%d",
                            attempt, max_attempts, resp.status_code, resp.text[:200], delay_ms, elapsed_ms,
                        )
                        time.sleep(delay_ms / 1000.0)
                        continue
                    if resp.status_code >= 400:
                        raise RuntimeError(f"Hugging Face embedding API failed ({resp.status_code}): {resp.text}")

                    data = resp.json()

                vectors: list[list[float]] = []
                for item in data:
                    if item and isinstance(item[0], list):
                        dim_len = len(item[0])
                        mean = [0.0] * dim_len
                        for tok in item:
                            for i, v in enumerate(tok):
                                mean[i] += v
                        vectors.append([v / len(item) for v in mean])
                    else:
                        vectors.append(list(item))

                bad = {len(v) for v in vectors}
                if bad != {self.dim}:
                    raise ValueError(
                        f"HF embedding model '{self._model_name}' returned dimensions "
                        f"{sorted(bad)}, expected {self.dim}. The pgvector schema is "
                        f"Vector({self.dim}); change EMBEDDING_MODEL to a "
                        f"{self.dim}-dim model or migrate the schema first."
                    )

                out = []
                for vec in vectors:
                    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
                    out.append([float(v) / norm for v in vec])

                latency_ms = int((time.time() - attempt_t0) * 1000)
                logger.info("embedding_completed attempt=%d latency_ms=%d texts=%d", attempt, latency_ms, len(texts))
                return out

            except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout, httpx.ConnectError, httpx.ReadError) as e:
                last_exc = e
                if is_last:
                    break
                delay_ms = min(base_delay_ms * (2 ** (attempt - 1)) + random.randint(0, 400), max_delay_ms)
                elapsed_ms = int((time.time() - t0) * 1000)
                logger.warning(
                    "embedding_retry attempt=%d max_attempts=%d status=timeout error=%s delay_ms=%d elapsed_ms=%d",
                    attempt, max_attempts, type(e).__name__ + ": " + str(e)[:200], delay_ms, elapsed_ms,
                )
                time.sleep(delay_ms / 1000.0)
                continue
            except httpx.NetworkError as e:
                last_exc = e
                if is_last:
                    break
                delay_ms = min(base_delay_ms * (2 ** (attempt - 1)) + random.randint(0, 400), max_delay_ms)
                elapsed_ms = int((time.time() - t0) * 1000)
                logger.warning(
                    "embedding_retry attempt=%d max_attempts=%d status=network_error error=%s delay_ms=%d elapsed_ms=%d",
                    attempt, max_attempts, str(e)[:200], delay_ms, elapsed_ms,
                )
                time.sleep(delay_ms / 1000.0)
                continue
            except RuntimeError as e:
                last_exc = e
                msg = str(e)
                if "429" in msg or "502" in msg or "503" in msg or "504" in msg:
                    if not is_last:
                        delay_ms = min(base_delay_ms * (2 ** (attempt - 1)) + random.randint(0, 400), max_delay_ms)
                        elapsed_ms = int((time.time() - t0) * 1000)
                        logger.warning(
                            "embedding_retry attempt=%d max_attempts=%d status=transient error=%s delay_ms=%d elapsed_ms=%d",
                            attempt, max_attempts, msg[:200], delay_ms, elapsed_ms,
                        )
                        time.sleep(delay_ms / 1000.0)
                        continue
                raise
            except ValueError:
                raise

        elapsed_ms = int((time.time() - t0) * 1000)
        logger.error("embedding_failed attempts=%d elapsed_ms=%d error=%s", max_attempts, elapsed_ms, str(last_exc)[:500] if last_exc else "unknown")
        if last_exc is not None:
            raise last_exc
        raise RuntimeError("Hugging Face embedding failed after retries")


class FakeEmbedder:
    """Deterministic embedder for tests. NOT a real semantic model.

    Produces stable, normalized, fixed-dimension vectors so cosine similarity
    and retrieval logic can be tested without downloading a model or using a GPU.
    """

    dim = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            vec = [0.0] * self.dim
            h = hashlib.sha256(t.encode("utf-8")).digest()
            for i in range(self.dim):
                byte = h[i % len(h)]
                vec[i] = ((byte / 255.0) - 0.5) * 2.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


def get_default_embedder(model_name: str | None = None) -> EmbeddingProvider:
    from .config import settings

    provider = getattr(settings, "embedding_provider", "local")
    if provider == "api":
        api_key = getattr(settings, "embedding_api_key", "")
        api_url = getattr(settings, "embedding_api_url", "https://api-inference.huggingface.co")
        if not api_key:
            raise RuntimeError("embedding_api_key is required when embedding_provider=api")
        return HfInferenceEmbedder(
            model_name=model_name or settings.embedding_model,
            api_key=api_key,
            api_url=api_url,
        )
    return SentenceTransformerEmbedder(model_name or settings.embedding_model)
