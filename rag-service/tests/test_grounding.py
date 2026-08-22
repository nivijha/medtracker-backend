from app.grounding import compute_evidence_score, should_abstain
from app.config import settings


def _reranked():
    return [
        {"chunk_id": "a", "rerank_score": 0.85},
        {"chunk_id": "b", "rerank_score": 0.60},
        {"chunk_id": "c", "rerank_score": 0.55},
    ]


def test_compute_evidence_score_uses_top_results():
    score = compute_evidence_score(_reranked())
    assert 0.0 < score <= 1.0
    assert score > 0.5


def test_compute_evidence_score_empty_is_zero():
    assert compute_evidence_score([]) == 0.0


def test_should_abstain_below_threshold():
    assert should_abstain(settings.evidence_threshold - 0.05)
    assert not should_abstain(settings.evidence_threshold + 0.1)
    assert not should_abstain(compute_evidence_score(_reranked()))
