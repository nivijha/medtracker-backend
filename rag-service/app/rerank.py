from __future__ import annotations

import json
import logging
import string
from typing import Protocol

logger = logging.getLogger("rag")


class Reranker(Protocol):
    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]: ...


_STOPWORDS = frozenset(
    {
        "a", "an", "the", "and", "or", "but", "so", "because",
        "if", "then", "than", "that", "this", "these", "those",
        "there", "here", "of", "to", "in", "on", "at", "by", "for",
        "with", "from", "into", "onto", "about", "over", "under",
        "during", "before", "after", "above", "below", "up", "down",
        "out", "off", "am", "is", "are", "was", "were", "be", "been",
        "being", "do", "does", "did", "doing", "have", "has", "had",
        "having", "will", "would", "shall", "should", "can", "could",
        "may", "might", "must", "i", "me", "my", "we", "us", "our",
        "you", "your", "he", "him", "his", "she", "her", "it", "its",
        "they", "them", "their", "who", "whom", "whose", "which",
        "what", "when", "where", "why", "how",
    }
)


class CrossEncoderReranker:
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model = None

    def _ensure(self):
        if self._model is None:
            from sentence_transformers import CrossEncoder

            self._model = CrossEncoder(self._model_name)
        return self._model

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        if not candidates:
            return []
        pairs = [(query, c["chunk_text"]) for c in candidates]
        scores = self._ensure().predict(pairs)
        scored = []
        for c, s in zip(candidates, scores):
            cc = dict(c)
            cc["rerank_score"] = float(s)
            scored.append(cc)
        ranked = sorted(scored, key=lambda c: c.get("rerank_score", 0.0), reverse=True)
        return ranked[:top_k]


class LexicalReranker:
    @staticmethod
    def _tokenize(text: str) -> list[str]:
        toks = []
        for raw in text.lower().split():
            tok = raw.strip(string.punctuation)
            if len(tok) > 2 and tok not in _STOPWORDS:
                toks.append(tok)
        return toks

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        toks = self._tokenize(query)
        scored = []
        for c in candidates:
            text = (c.get("chunk_text") or "").lower()
            matched = {t for t in toks if t in text} if toks else set()
            s = float(len(matched))
            cc = dict(c)
            cc["lexical_score"] = s
            cc["rerank_score"] = s
            scored.append(cc)
        ranked = sorted(scored, key=lambda c: c["rerank_score"], reverse=True)
        return ranked[:top_k]


class OpenRouterReranker:
    def __init__(self, api_key: str, model: str, api_url: str = "https://openrouter.ai/api/v1") -> None:
        self._api_key = api_key
        self._model = model
        self._api_url = api_url.rstrip("/")
        self._fallback = LexicalReranker()

    def _fallback_rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        return self._fallback.rerank(query, candidates, top_k)

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        if not candidates:
            return []
        if not self._api_key:
            logger.warning(json.dumps({"event": "openrouter_rerank_no_key", "fallback": "lexical"}))
            return self._fallback_rerank(query, candidates, top_k)

        numbered = "\n\n".join(f"[{i}] {c.get('chunk_text', '')[:2000]}" for i, c in enumerate(candidates, 1))
        prompt = (
            "Score each chunk's relevance to the query on a 0.0-1.0 scale.\n"
            f"Query: {query}\n\n"
            f"Chunks:\n{numbered}\n\n"
            'Return ONLY JSON object mapping 1-based index to score, e.g. {"1": 0.9, "2": 0.1}.'
        )

        try:
            import httpx

            url = f"{self._api_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
            }
            body = {
                "model": self._model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0,
                "response_format": {"type": "json_object"},
            }
            with httpx.Client(timeout=20.0) as client:
                resp = client.post(url, headers=headers, json=body)
                if resp.status_code >= 400:
                    raise RuntimeError(f"OpenRouter rerank failed ({resp.status_code}): {resp.text[:500]}")
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                scores_map = json.loads(content) if isinstance(content, str) else content
        except Exception as e:
            logger.warning(json.dumps({"event": "openrouter_rerank_failed", "error": str(e)[:500], "fallback": "lexical"}))
            return self._fallback_rerank(query, candidates, top_k)

        try:
            parsed: dict[int, float] = {}
            for k, v in scores_map.items():
                try:
                    idx = int(str(k).strip())
                    parsed[idx] = max(0.0, min(1.0, float(v)))
                except (ValueError, TypeError):
                    continue
        except Exception:
            logger.warning(json.dumps({"event": "openrouter_rerank_parse_failed", "fallback": "lexical"}))
            return self._fallback_rerank(query, candidates, top_k)

        scored = []
        for i, c in enumerate(candidates, 1):
            cc = dict(c)
            raw = parsed.get(i)
            if raw is not None:
                cc["rerank_score"] = float(raw)
                cc["rerank_source"] = "openrouter"
            elif "similarity" in c:
                cc["rerank_score"] = max(0.0, min(1.0, float(c["similarity"])))
                cc["rerank_source"] = "openrouter"
            else:
                cc["rerank_score"] = 0.0
                cc["rerank_source"] = "openrouter"
            if "lexical_score" not in cc:
                cc["lexical_score"] = 0.0
            scored.append(cc)

        ranked = sorted(scored, key=lambda c: c.get("rerank_score", 0.0), reverse=True)
        return ranked[:top_k]


def get_default_reranker(model_name: str | None = None) -> Reranker:
    from .config import settings

    provider = getattr(settings, "embedding_provider", "local")
    if provider == "api":
        if getattr(settings, "openrouter_api_key", ""):
            return OpenRouterReranker(
                api_key=settings.openrouter_api_key,
                model=getattr(settings, "openrouter_model", "openai/gpt-4o-mini"),
                api_url=getattr(settings, "openrouter_api_url", "https://openrouter.ai/api/v1"),
            )
        return LexicalReranker()
    return CrossEncoderReranker(model_name or settings.reranker_model)
