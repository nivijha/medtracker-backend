"""Reranking: interface + CrossEncoder (local) + lexical fallback (production/tests/offline).

Reranking runs ONLY over the small hybrid candidate set (top-N), keeping latency
bounded. The CrossEncoder model is imported lazily so unit tests/offline mode
don't pay the load cost.
"""
from __future__ import annotations

import string
from typing import Protocol


class Reranker(Protocol):
    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]: ...


# Generic English function words + interrogatives. Dropped before lexical
# overlap so queries like "What is the patient's insurance provider?" do not
# accumulate phantom overlap from stopwords such as "the". Deliberately EXCLUDES
# negations ("no", "not", "nor", "never") because they change clinical meaning.
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
            # Build scored copies; never mutate the caller's candidate dicts.
            cc = dict(c)
            cc["rerank_score"] = float(s)
            scored.append(cc)
        ranked = sorted(scored, key=lambda c: c.get("rerank_score", 0.0), reverse=True)
        return ranked[:top_k]


class LexicalReranker:
    """Deterministic reranker: lexical overlap between query and chunk text.

    Used as a testable/offline fallback and as the production reranker when
    external embedding API is used (no local ML models).

    Score contract per candidate (see also app/retrieval.py::hybrid_search):
      - "score":         original fused hybrid (pgvector + FTS -> RRF) retrieval
                         score from the store. NEVER overwritten here.
      - "lexical_score": raw token-overlap count (this reranker's own signal).
      - "rerank_score":  the score this reranker ranks by (= lexical overlap).
    """

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        toks = []
        for raw in text.lower().split():
            # Strip surrounding punctuation ("taking?" -> "taking") but keep
            # intra-word apostrophes ("patient's" stays distinct from "patient").
            tok = raw.strip(string.punctuation)
            if len(tok) > 2 and tok not in _STOPWORDS:
                toks.append(tok)
        return toks

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        toks = self._tokenize(query)
        scored = []
        for c in candidates:
            text = (c.get("chunk_text") or "").lower()
            s = float(sum(text.count(t) for t in toks)) if toks else 0.0
            cc = dict(c)
            cc["lexical_score"] = s
            cc["rerank_score"] = s
            scored.append(cc)
        ranked = sorted(scored, key=lambda c: c["rerank_score"], reverse=True)
        return ranked[:top_k]


def get_default_reranker(model_name: str | None = None) -> Reranker:
    from .config import settings

    provider = getattr(settings, "embedding_provider", "local")
    if provider == "api":
        # Production: no local ML models, use lightweight lexical reranker
        return LexicalReranker()
    # Local development / tests
    return CrossEncoderReranker(model_name or "cross-encoder/ms-marco-MiniLM-L-6-v2")
