from __future__ import annotations

from .config import settings

SIM_FLOOR = 0.40
SIM_CEIL = 0.80
LEXICAL_MIN_DISTINCT = 2
LEXICAL_SATURATION = 4


def _similarity_evidence(cos: float) -> float:
    span = SIM_CEIL - SIM_FLOOR
    return min(1.0, max(0.0, (float(cos) - SIM_FLOOR) / span))


def _evidence_components(best: dict) -> dict:
    lex_raw = best.get("lexical_score")
    if lex_raw is None:
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

    rs = best.get("rerank_score")
    rerank_evidence = None
    if best.get("rerank_source") == "openrouter" and rs is not None:
        try:
            fv = float(rs)
            if 0.0 <= fv <= 1.0:
                rerank_evidence = fv
            else:
                import math

                v = max(-10.0, min(10.0, fv))
                rerank_evidence = 1.0 / (1.0 + math.exp(-v))
        except (ValueError, TypeError):
            pass

    return {
        "lexical_matched": best.get("lexical_score", best.get("rerank_score")),
        "lexical_evidence": lexical_evidence,
        "similarity": sim,
        "retrieval_evidence": retrieval_evidence,
        "rerank_score": rs,
        "rerank_evidence": rerank_evidence,
        "rrf_score": best.get("score"),
    }


def explain_evidence(candidates: list[dict]) -> dict:
    if not candidates:
        return {
            "lexical_matched": None,
            "lexical_evidence": None,
            "similarity": None,
            "retrieval_evidence": None,
            "rerank_score": None,
            "rerank_evidence": None,
            "rrf_score": None,
            "evidence_score": 0.0,
        }
    parts = _evidence_components(candidates[0])
    parts["evidence_score"] = compute_evidence_score(candidates)
    return parts


def compute_evidence_score(candidates: list[dict]) -> float:
    if not candidates:
        return 0.0

    best = candidates[0]
    provider = getattr(settings, "embedding_provider", "local")

    if provider == "api":
        parts = _evidence_components(best)
        signals = [
            s for s in (parts["lexical_evidence"], parts["retrieval_evidence"], parts["rerank_evidence"])
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
        import math

        value = max(-10.0, min(10.0, float(score)))
        return round(1.0 / (1.0 + math.exp(-value)), 4)

    return round(
        min(1.0, max(0.0, float(score) * (settings.rrf_k + 1))),
        4,
    )


def should_abstain(evidence_score: float) -> bool:
    return evidence_score < settings.evidence_threshold
