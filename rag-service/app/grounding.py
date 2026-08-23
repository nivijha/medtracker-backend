"""Grounding: evidence score + abstention.

`evidenceScore` is an ANSWER-EVIDENCE signal, NOT a retrieval-relevance signal
and NOT a calibrated clinical-confidence estimate (ADR-016). The distinction
matters: a chunk can be topically related to the query ("both about this
patient") while containing nothing that supports answering it. If the score
falls below `EVIDENCE_THRESHOLD`, the system abstains instead of fabricating an
answer (ADR-017).
"""
from __future__ import annotations

from .config import settings

# --- Production similarity calibration (embedding_provider == "api") --------
#
# all-MiniLM-L6-v2 sentence cosines are NOT zero-centered for unrelated pairs:
# shared domain/person vocabulary gives same-corpus unrelated pairs a floor of
# roughly 0.25-0.35. Measured in production (2026-08): "What is the patient's
# insurance provider?" vs "The patient is currently taking metformin 500 mg once
# daily." -> cosine 0.3127 despite zero answer relevance.
#
# We therefore map raw cosine to evidence with an empirical floor/ceiling:
#   below SIM_FLOOR  -> 0 evidence (topical-relatedness band)
#   above SIM_CEIL   -> saturated evidence (paraphrase/answer band)
# These are calibration constants, not thresholds: EVIDENCE_THRESHOLD stays
# untouched and both constants should be re-fit from logged (similarity,
# human-label) pairs as data accumulates.
SIM_FLOOR = 0.40
SIM_CEIL = 0.80

# A single distinct matched content-token is not enough lexical evidence:
# corpus-boilerplate words ("patient" in a medical-records store) match every
# query and every chunk. Two independent matched tokens indicate substantive
# overlap. This is a structural rule, not a tuned threshold.
LEXICAL_MIN_DISTINCT = 2

# Lexical saturation point in distinct matched tokens.
LEXICAL_SATURATION = 4


def _similarity_evidence(cos: float) -> float:
    """Map raw cosine similarity to [0, 1] answer-evidence space."""
    span = SIM_CEIL - SIM_FLOOR
    return min(1.0, max(0.0, (float(cos) - SIM_FLOOR) / span))


def _evidence_components(best: dict) -> dict:
    """Expose the individual signals behind the production evidence score."""
    lex_raw = best.get("lexical_score")
    if lex_raw is None:
        # Backward compatibility: callers predating lexical_score stored the
        # overlap count directly in rerank_score.
        lex_raw = best.get("rerank_score")
    if lex_raw is not None:
        lex_val = max(0.0, float(lex_raw))
        lexical_evidence = (
            min(1.0, lex_val / LEXICAL_SATURATION)
            if lex_val >= LEXICAL_MIN_DISTINCT
            else 0.0
        )
    else:
        lexical_evidence = None

    sim = best.get("similarity")
    retrieval_evidence = _similarity_evidence(sim) if sim is not None else None

    return {
        "lexical_matched": best.get("lexical_score", best.get("rerank_score")),
        "lexical_evidence": lexical_evidence,
        "similarity": sim,
        "retrieval_evidence": retrieval_evidence,
        "rrf_score": best.get("score"),
    }


def explain_evidence(candidates: list[dict]) -> dict:
    """Diagnostic breakdown of compute_evidence_score() for structured logging.

    Purely observational: returns the same final score alongside each input
    signal so production grounding decisions are auditable per query.
    """
    if not candidates:
        return {
            "lexical_matched": None,
            "lexical_evidence": None,
            "similarity": None,
            "retrieval_evidence": None,
            "rrf_score": None,
            "evidence_score": 0.0,
        }
    parts = _evidence_components(candidates[0])
    parts["evidence_score"] = compute_evidence_score(candidates)
    return parts


def compute_evidence_score(candidates: list[dict]) -> float:
    """Answer-evidence signal from the top retrieved/reranked candidate.

    Normalized to 0..1. Production (embedding_provider == "api") combines two
    independent channels; grounds when EITHER is strong, abstains only when
    BOTH are weak:

      1. lexical evidence: DISTINCT query content-tokens found in the chunk,
         credited only from LEXICAL_MIN_DISTINCT upward and saturating at
         LEXICAL_SATURATION (min(1, n/4)). Deliberately not synonym-aware -
         semantic equivalence ("medicine" vs "taking metformin") belongs to
         the embedding channel below.

      2. retrieval evidence: floor-calibrated cosine `similarity` attached by
         the retrieval stores. Raw cosine is intentionally NOT used directly,
         and the fused RRF score is intentionally NOT converted into evidence:
         RRF (app/retrieval.py::_rrf) encodes relative rank position only - a
         lone candidate is always rank 1 - so rank-based scores cannot express
         "probability this chunk answers the question".
    """
    if not candidates:
        return 0.0

    best = candidates[0]

    provider = getattr(settings, "embedding_provider", "local")

    if provider == "api":
        parts = _evidence_components(best)
        signals = [
            s for s in (parts["lexical_evidence"], parts["retrieval_evidence"])
            if s is not None
        ]
        if not signals:
            return 0.0
        return round(max(signals), 4)

    score = best.get("rerank_score")
    if score is None:
        score = best.get("score")
    if score is None:
        return 0.0

    if "rerank_score" in best:
        # Local CrossEncoderReranker produces calibrated-ish relevance logits;
        # sigmoid maps them to [0, 1]. Unchanged behavior.
        import math

        value = max(-10.0, min(10.0, float(score)))
        return round(1.0 / (1.0 + math.exp(-value)), 4)

    # Local-mode fallback without reranker output.
    return round(
        min(1.0, max(0.0, float(score) * (settings.rrf_k + 1))),
        4,
    )


def should_abstain(evidence_score: float) -> bool:
    return evidence_score < settings.evidence_threshold
