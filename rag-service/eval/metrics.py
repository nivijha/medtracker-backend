"""Retrieval + answer-quality metrics for the RAG evaluation harness (Phase 4).

Retrieval metrics (Recall@K, Precision@K, MRR, NDCG@K) are deterministic and need
no model. Answer-quality metrics (faithfulness / answer-relevance) are *heuristic*
lexical proxies here; the production plan is an LLM-as-judge (ADR-023), which can
be plugged into `run.py` later without changing these primitives.
"""
from __future__ import annotations

from typing import Iterable


def _as_set(ids: Iterable[str]) -> set[str]:
    return {str(i) for i in ids}


def recall_at_k(retrieved: Iterable[str], relevant: Iterable[str], k: int) -> float:
    rel = _as_set(relevant)
    if not rel:
        return 0.0
    top = list(retrieved)[:k]
    hits = sum(1 for i in top if i in rel)
    return hits / len(rel)


def precision_at_k(retrieved: Iterable[str], relevant: Iterable[str], k: int) -> float:
    rel = _as_set(relevant)
    if k <= 0:
        return 0.0
    top = list(retrieved)[:k]
    if not top:
        return 0.0
    hits = sum(1 for i in top if i in rel)
    return hits / len(top)


def mrr(retrieved: Iterable[str], relevant: Iterable[str]) -> float:
    rel = _as_set(relevant)
    if not rel:
        return 0.0
    for rank, i in enumerate(retrieved, start=1):
        if i in rel:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(retrieved: Iterable[str], relevant: Iterable[str], k: int) -> float:
    rel = _as_set(relevant)
    if not rel:
        return 0.0
    top = list(retrieved)[:k]
    dcg = 0.0
    for rank, i in enumerate(top, start=1):
        if i in rel:
            dcg += 1.0 / (rank if rank == 1 else __import__("math").log2(rank + 1))
    # Ideal DCG: relevant items ranked first.
    idcg = sum(1.0 / (__import__("math").log2(r + 1)) for r in range(1, min(len(rel), k) + 1))
    return dcg / idcg if idcg > 0 else 0.0


import re

def _tokenize(text: str) -> set[str]:
    # Strip punctuation; keep alphanumeric tokens longer than 2 chars.
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2}


def faithfulness_proxy(answer: str, contexts: Iterable[str], threshold: float = 0.1) -> float:
    """Fraction of answer sentences supported by at least one retrieved context.

    Heuristic: a sentence is 'supported' if token overlap with any context chunk
    exceeds `threshold`. Replace with an LLM judge for production use.
    """
    sentences = [s for s in answer.split(".") if s.strip()]
    if not sentences:
        return 0.0
    ctx_tokens = [_tokenize(c) for c in contexts]
    if not any(ctx_tokens):
        return 0.0
    supported = 0
    for s in sentences:
        st = _tokenize(s)
        if not st:
            continue
        for ct in ctx_tokens:
            overlap = len(st & ct) / len(st)
            if overlap >= threshold:
                supported += 1
                break
    return supported / len(sentences)
