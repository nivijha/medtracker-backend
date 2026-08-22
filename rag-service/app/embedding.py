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
import math
from typing import Protocol


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


class HfInferenceEmbedder:
    """Production embedder using Hugging Face Inference API.

    Calls `https://api-inference.huggingface.co/models/{model_name}` with
    Authorization: Bearer <api_key>. Returns normalized 384-dim vectors
    compatible with the existing pgvector schema.
    """
    dim = 384

    def __init__(self, model_name: str, api_key: str, api_url: str = "https://api-inference.huggingface.co") -> None:
        self._model_name = model_name
        self._api_key = api_key
        self._api_url = api_url.rstrip("/")

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        import httpx

        url = f"{self._api_url}/models/{self._model_name}"
        headers = {"Authorization": f"Bearer {self._api_key}"}
        payload = {"inputs": texts, "options": {"wait_for_model": True}}

        with httpx.Client(timeout=30.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()

        # HF feature-extraction returns list[list[float]] for pooled models.
        # Some models return token-level embeddings list[list[list[float]]];
        # mean-pool those so we always end up with one vector per input text.
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

        # Dimension guard: never let a wrong-dim vector reach pgvector.
        bad = {len(v) for v in vectors}
        if bad != {self.dim}:
            raise ValueError(
                f"HF embedding model '{self._model_name}' returned dimensions "
                f"{sorted(bad)}, expected {self.dim}. The pgvector schema is "
                f"Vector({self.dim}); change EMBEDDING_MODEL to a "
                f"{self.dim}-dim model or migrate the schema first."
            )

        # Normalize to unit length for cosine similarity
        out = []
        for vec in vectors:
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([float(v) / norm for v in vec])
        return out


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
            # Seed multiple dimensions from the text hash so similar-ish inputs
            # still differ; good enough to exercise fusion/ranking code paths.
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
    # Local development / tests
    return SentenceTransformerEmbedder(model_name or settings.embedding_model)
