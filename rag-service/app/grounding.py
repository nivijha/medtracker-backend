"""Grounding: evidence score + abstention.

`evidenceScore` is a RETRIEVAL/REFERENCE relevance signal, NOT a calibrated
probability and NOT a clinical-confidence estimate (ADR-016). If it falls below
`EVIDENCE_THRESHOLD`, the system abstains instead of fabricating an answer (ADR-017).
"""
from __future__ import annotations

from .config import settings


def compute_evidence_score(candidates: list[dict]) -> float:
    """Simple, honest evidence signal from the top retrieved/reranked candidates.

    Uses the best rerank score (CrossEncoder) when present, else the fused RRF
    score. Normalized to a 0..1-ish range. This is a relevance indicator only.
    """
    if not candidates:
        return 0.0

    best = candidates[0]

    provider = getattr(settings, "embedding_provider", "local")

    score = best.get("rerank_score")
    if score is None:
        score = best.get("score")
    if score is None:
        return 0.0

    if provider == "api":
        # Production LexicalReranker score.
        # Map token overlap count into [0, 1].
        # 0 -> 0.0
        # 1 -> 0.25
        # 2 -> 0.50
        # 3 -> 0.75
        # 4+ -> 1.0
        return round(min(1.0, max(0.0, float(score)) / 4.0), 4)

    if "rerank_score" in best:
        # Local CrossEncoderReranker produces logits.
        # Convert logits to probability using sigmoid.
        import math

        value = float(score)
        value = max(-10.0, min(10.0, value))
        return round(1.0 / (1.0 + math.exp(-value)), 4)

    # RRF fused score fallback.
    return round(
        min(1.0, max(0.0, float(score) * (settings.rrf_k + 1))),
        4,
    )


def should_abstain(evidence_score: float) -> bool:
    return evidence_score < settings.evidence_threshold
