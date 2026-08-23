from app.rerank import CrossEncoderReranker, LexicalReranker, get_default_reranker
from app.retrieval import RetrievalStore


def _candidates():
    return [
        {"chunk_id": "a", "document_id": "d1", "chunk_text": "metformin dosage 500 mg daily", "score": 0.9},
        {"chunk_id": "b", "document_id": "d1", "chunk_text": "patient history of diabetes", "score": 0.4},
        {"chunk_id": "c", "document_id": "d2", "chunk_text": "unrelated radiology report", "score": 0.8},
    ]


def test_lexical_reranker_orders_by_overlap():
    r = LexicalReranker()
    out = r.rerank("metformin dosage", _candidates(), top_k=2)
    assert out[0]["chunk_id"] == "a"
    assert len(out) == 2
    assert "rerank_score" in out[0]


def test_lexical_reranker_no_query_terms_preserves_order():
    r = LexicalReranker()
    out = r.rerank("@#$", _candidates(), top_k=3)
    assert [c["chunk_id"] for c in out] == ["a", "b", "c"]


def test_default_reranker_is_cross_encoder():
    r = get_default_reranker()
    assert isinstance(r, CrossEncoderReranker)
    assert r._model_name == "cross-encoder/ms-marco-MiniLM-L-6-v2"


def test_cross_encoder_instantiates_without_loading_model():
    # Construction must NOT require network / model download.
    r = CrossEncoderReranker(model_name="cross-encoder/ms-marco-MiniLM-L-6-v2")
    assert r._model is None
    assert hasattr(r, "rerank")


class _FakeCrossEncoderModel:
    """Stands in for sentence_transformers.CrossEncoder in tests."""

    def __init__(self, scores):
        self._scores = list(scores)
        self.predict_calls = []

    def predict(self, pairs):
        self.predict_calls.append(list(pairs))
        return list(self._scores)


def test_cross_encoder_attaches_scores_and_ranks_without_mutating_input():
    """Regression: scored copies were previously discarded, so rerank_score
    never reached the caller and ranking silently used stale keys."""
    r = CrossEncoderReranker(model_name="test-model")
    r._model = _FakeCrossEncoderModel([0.2, 0.8])

    candidates = [
        {"chunk_id": "a", "document_id": "d1", "chunk_text": "text a", "score": 0.9},
        {"chunk_id": "b", "document_id": "d1", "chunk_text": "text b", "score": 0.4},
    ]
    out = r.rerank("some query", candidates, top_k=2)

    # Candidate b (0.8) must rank above candidate a (0.2).
    assert [c["chunk_id"] for c in out] == ["b", "a"]
    assert out[0]["rerank_score"] == 0.8
    assert out[1]["rerank_score"] == 0.2

    # Original candidate metadata remains intact on the returned copies.
    assert out[0]["score"] == 0.4
    assert out[0]["document_id"] == "d1"
    assert out[0]["chunk_text"] == "text b"

    # The caller's list must not be mutated.
    assert all("rerank_score" not in c for c in candidates)


def test_lexical_reranker_preserves_retrieval_score_and_adds_lexical_score():
    """Score contract: score = retrieval score (untouched), lexical_score =
    overlap count, rerank_score = lexical count used for ranking."""
    r = LexicalReranker()
    retrieval_score = 0.032787
    candidates = [
        {
            "chunk_id": "c1",
            "document_id": "doc-9",
            "chunk_text": "The patient is currently taking metformin 500 mg once daily.",
            "score": retrieval_score,
        }
    ]
    out = r.rerank("What medication is the patient taking?", candidates, top_k=5)

    c = out[0]
    # Original hybrid/RRF retrieval score is NOT overwritten.
    assert c["score"] == retrieval_score
    assert "lexical_score" in c
    assert "rerank_score" in c
    # 'patient' and 'taking' overlap; stopwords/punctuation excluded.
    assert c["lexical_score"] == 2.0
    assert c["rerank_score"] == 2.0
    assert c is not candidates[0]


def test_lexical_reranker_counts_distinct_matched_tokens():
    """Regression: text.count() summed every occurrence, so one token repeated
    in a chunk inflated evidence. A token found N times is ONE match."""
    r = LexicalReranker()
    candidates = [
        {
            "chunk_id": "c1",
            "chunk_text": "metformin metformin metformin patient patient",
            "score": 0.01,
        }
    ]
    out = r.rerank("What medication is the patient taking?", candidates, top_k=1)
    # Distinct matched tokens = {patient}; 'metformin' occurrences are ignored
    # (query never mentions it) and 'patient' repeats count once.
    assert out[0]["lexical_score"] == 1.0
    assert out[0]["rerank_score"] == 1.0

    out = r.rerank("metformin dosage", candidates, top_k=1)
    assert out[0]["lexical_score"] == 1.0


def test_lexical_reranker_ignores_stopwords_and_punctuation():
    """'the'/'what' must not create phantom overlap; 'taking?' counts as
    'taking'."""
    r = LexicalReranker()
    candidates = [{"chunk_id": "c1", "chunk_text": "the patient is currently taking metformin.", "score": 0.01}]
    out = r.rerank("What is the patient's insurance provider?", candidates, top_k=3)
    # Only "patient's" could match and it stays distinct from "patient".
    assert out[0]["lexical_score"] == 0.0

    out = r.rerank("What medication is the patient taking?", candidates, top_k=3)
    assert out[0]["lexical_score"] == 2.0
