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
