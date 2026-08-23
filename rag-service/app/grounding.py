"""Grounding: evidence score + abstention.

`evidenceScore` is a RETRIEVAL/REFERENCE relevance signal, NOT a calibrated
probability and NOT a clinical-confidence estimate (ADR-016). If it falls below
`EVIDENCE_THRESHOLD`, the system abstains instead of fabricating an answer (ADR-017).
"""
from __future__ import annotations

from .config import settings


def compute_evidence_score(candidates: list[dict]) -> float:
    """Simple, honest evidence signal from the top retrieved/reranked candidates.

    Normalized to 0..1. This is a relevance indicator only.

    Production (embedding_provider == "api", LexicalReranker) combines two
    independent signals with max(): a candidate grounds when EITHER signal is
    strong, and abstains only when BOTH are weak.

      1. lexical evidence: token-overlap count normalized as min(1, count/4).
         Lexical overlap alone proves nothing semantic ("medicine" vs "taking
         metformin" share no tokens yet are about the same thing), so it must
         not be the only gate.

      2. retrieval evidence: the store's absolute cosine `similarity` when
         present; otherwise the fused hybrid score normalized by its theoretical
         maximum. RRF math (app/retrieval.py::_rrf):
             score = sum over rankings of 1 / (rrf_k + rank), rank from 1.
         With n rankings the maximum achievable score is n / (rrf_k + 1)
         (rank-1 in every ranking), hence normalization by (rrf_k + 1) / n.
         Note RRF encodes RELATIVE rank only - a lone candidate is always rank 1 -
         which is why absolute `similarity` takes precedence when available.
    """
    if not candidates:
        return 0.0

    best = candidates[0]

    provider = getattr(settings, "embedding_provider", "local")

    if provider == "api":
        # Production LexicalReranker path.
        lex_raw = best.get("lexical_score")
        if lex_raw is None:
            # Backward compatibility: callers predating lexical_score stored
            # the raw overlap count directly in rerank_score.
            lex_raw = best.get("rerank_score")
        lexical_evidence = (
            min(1.0, max(0.0, float(lex_raw)) / 4.0) if lex_raw is not None else None
        )

        sim = best.get("similarity")
        if sim is not None:
            # Absolute semantic similarity in [-1, 1]; clamp to [0, 1].
            retrieval_evidence: float | None = min(1.0, max(0.0, float(sim)))
        elif best.get("score") is not None:
            # Fallback: normalize fused RRF score by its theoretical maximum.
            # hybrid_search fuses exactly 2 rankings (vector + keyword).
            n_rankings = 2
            retrieval_evidence = min(
                1.0,
                max(0.0, float(best["score"])) * (settings.rrf_k + 1) / n_rankings,
            )
        else:
            retrieval_evidence = None

        signals = [s for s in (lexical_evidence, retrieval_evidence) if s is not None]
        if not signals:
            return 0.0
        return round(max(signals), 4)

    score = best.get("rerank_score")
    if score is None:
        score = best.get("score")
    if score is None:
        return 0.0

    if "rerank_score" in best:
        # Local CrossEncoderReranker produces logits.
        # Convert logits to probability using sigmoid.
        import math

        value = max(-10.0, min(10.0, float(score)))
        return round(1.0 / (1.0 + math.exp(-value)), 4)

    # RRF fused score fallback.
    return round(
        min(1.0, max(0.0, float(score) * (settings.rrf_k + 1))),
        4,
    )


def should_abstain(evidence_score: float) -> bool:
    return evidence_score < settings.evidence_threshold
