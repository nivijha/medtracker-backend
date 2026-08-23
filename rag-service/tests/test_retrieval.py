from app.embedding import FakeEmbedder
from app.retrieval import InMemoryRetrievalStore, filters_to_dict


def _chunk(cid, uid, did, text, doc_type="lab", section=None, report_date=None):
    return {
        "chunk_id": cid,
        "document_id": did,
        "user_id": uid,
        "doc_type": doc_type,
        "report_date": report_date,
        "page": 1,
        "section": section,
        "source_filename": "r.pdf",
        "chunk_text": text,
    }


def test_patient_isolation_in_hybrid_search():
    store = InMemoryRetrievalStore()
    eb = FakeEmbedder()
    a_chunks = [_chunk("c-a1", "user-A", "d-a", "Patient A LDL cholesterol result")]
    b_chunks = [_chunk("c-b1", "user-B", "d-b", "Patient B LDL cholesterol result")]
    for c in a_chunks + b_chunks:
        c["embedding"] = eb.embed([c["chunk_text"]])[0]
    store.index_chunks(a_chunks)
    store.index_chunks(b_chunks)

    qvec = eb.embed(["LDL cholesterol"])[0]
    res_a = store.hybrid_search("user-A", "LDL cholesterol", qvec, top_k=5)
    res_b = store.hybrid_search("user-B", "LDL cholesterol", qvec, top_k=5)

    assert all(c["user_id"] == "user-A" for c in res_a)
    assert all(c["user_id"] == "user-B" for c in res_b)
    assert "c-b1" not in {c["chunk_id"] for c in res_a}


def test_keyword_query_returns_relevant_chunk():
    store = InMemoryRetrievalStore()
    eb = FakeEmbedder()
    c = _chunk("c1", "user-A", "d1", "Hemoglobin A1c is 6.8 percent")
    c["embedding"] = eb.embed([c["chunk_text"]])[0]
    store.index_chunks([c])
    qvec = eb.embed(["HbA1c value"])[0]
    res = store.hybrid_search("user-A", "HbA1c value", qvec, top_k=5)
    assert res and res[0]["chunk_id"] == "c1"


def test_index_is_idempotent_by_document():
    store = InMemoryRetrievalStore()
    eb = FakeEmbedder()
    c1 = _chunk("c1", "user-A", "d1", "first version text")
    c2 = _chunk("c2", "user-A", "d1", "second version text")
    for c in (c1, c2):
        c["embedding"] = eb.embed([c["chunk_text"]])[0]
    store.index_chunks([c1])
    store.index_chunks([c2])
    # Only the latest version's chunk should remain for document d1.
    qvec = eb.embed(["text"])[0]
    res = store.hybrid_search("user-A", "text", qvec, top_k=10)
    ids = {c["chunk_id"] for c in res}
    assert ids == {"c2"}


def test_metadata_filters_applied():
    store = InMemoryRetrievalStore()
    eb = FakeEmbedder()
    chunks = [
        _chunk("c1", "user-A", "d1", "lipid panel", doc_type="lab", section="LIPID", report_date=__import__("datetime").date(2024, 1, 1)),
        _chunk("c2", "user-A", "d2", "xray note", doc_type="imaging", section="CHEST", report_date=__import__("datetime").date(2023, 1, 1)),
    ]
    for c in chunks:
        c["embedding"] = eb.embed([c["chunk_text"]])[0]
    store.index_chunks(chunks)
    qvec = eb.embed(["note"])[0]
    res = store.hybrid_search("user-A", "note", qvec, top_k=10, filters={"documentTypes": ["imaging"]})
    assert {c["chunk_id"] for c in res} == {"c2"}


def test_filters_to_dict_handles_none():
    assert filters_to_dict(None) == {}


def test_hybrid_search_returns_score_and_similarity_fields():
    """Unit-level contract (no PostgreSQL required): hybrid_search must return
    the original fused retrieval score plus the absolute cosine similarity that
    grounding uses as the semantic retrieval signal."""
    store = InMemoryRetrievalStore()
    eb = FakeEmbedder()
    c1 = _chunk("c1", "user-A", "d1", "Hemoglobin A1c is 6.8 percent")
    c2 = _chunk("c2", "user-A", "d2", "Blood pressure reading recorded")
    for c in (c1, c2):
        c["embedding"] = eb.embed([c["chunk_text"]])[0]
    store.index_chunks([c1, c2])

    qvec = eb.embed(["Hemoglobin A1c value"])[0]
    res = store.hybrid_search("user-A", "Hemoglobin A1c value", qvec, top_k=5)
    assert res

    top = res[0]
    # Fused hybrid (vector + keyword -> RRF) retrieval score.
    assert isinstance(top["score"], float) and top["score"] > 0.0
    # Absolute semantic similarity, clamped to cosine range.
    assert isinstance(top["similarity"], float)
    assert -1.0 <= top["similarity"] <= 1.0
    # The best lexical+vector match must surface first with positive similarity.
    assert top["chunk_id"] == "c1"
    assert top["similarity"] > res[1]["similarity"]
