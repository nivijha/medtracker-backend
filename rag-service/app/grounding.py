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
    score = best.get("rerank_score")
    if score is None:
        score = best.get("score")
    if score is None:
        return 0.0
    # RRF fused scores are small positive numbers; map via a soft ramp so the
    # threshold is meaningful. Re-rank scores (CrossEncoder) are larger/logistic.
    if "rerank_score" in best:
        # CrossEncoder scores are roughly in [-inf, inf]; sigmoid-ish clamp.
        import math

        return round(1.0 / (1.0 + math.exp(-max(-10.0, min(10.0, float(score))))), 4)
    # RRF: treat >= 1/(k+1) as strong.
    return round(min(1.0, max(0.0, float(score) * (settings.rrf_k + 1))), 4)


def should_abstain(evidence_score: float) -> bool:
    return evidence_score < settings.evidence_threshold
