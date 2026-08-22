"""Reranking: interface + CrossEncoder (real) + lexical fallback (tests/offline).

Reranking runs ONLY over the small hybrid candidate set (top-N), keeping latency
bounded. The CrossEncoder model is imported lazily so unit tests/offline mode
don't pay the load cost.
"""
from __future__ import annotations

from typing import Protocol


class Reranker(Protocol):
    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]: ...


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
        for c, s in zip(candidates, scores):
            c = dict(c)
            c["rerank_score"] = float(s)
        ranked = sorted(candidates, key=lambda c: c.get("rerank_score", 0.0), reverse=True)
        return ranked[:top_k]


class LexicalReranker:
    """Deterministic reranker: lexical overlap between query and chunk text.

    Used as a testable/offline fallback and as the baseline reranker.
    """

    def rerank(self, query: str, candidates: list[dict], top_k: int) -> list[dict]:
        toks = [t for t in query.lower().split() if len(t) > 2]
        scored = []
        for c in candidates:
            text = (c.get("chunk_text") or "").lower()
            s = sum(text.count(t) for t in toks) if toks else 0.0
            cc = dict(c)
            cc["rerank_score"] = float(s)
            scored.append(cc)
        ranked = sorted(scored, key=lambda c: c["rerank_score"], reverse=True)
        return ranked[:top_k]


def get_default_reranker(model_name: str | None = None) -> Reranker:
    return CrossEncoderReranker(model_name or "cross-encoder/ms-marco-MiniLM-L-6-v2")
