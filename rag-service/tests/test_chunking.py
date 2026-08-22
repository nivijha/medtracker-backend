from app.embedding import FakeEmbedder
from app.ingestion import build_chunks, chunk_text


def test_chunk_text_splits_long_text():
    text = "Para one about lipids. " * 50 + "\n\n" + "Para two about glucose. " * 50
    chunks = chunk_text(text, chunk_size=200, overlap=20)
    assert len(chunks) > 1
    # Each chunk carries text and optional section/page metadata.
    assert all("text" in c and "section" in c for c in chunks)


def test_chunk_text_detects_section_heading():
    text = "LIPID PROFILE:\nLDL is 142 mg/dL.\n\nCBC:\nWBC count normal."
    chunks = chunk_text(text, chunk_size=400, overlap=20)
    sections = {c["section"] for c in chunks if c["section"]}
    assert "LIPID PROFILE" in sections or "CBC" in sections


def test_build_chunks_attaches_metadata_and_ids():
    chunks = build_chunks(
        document_id="doc-1",
        user_id="user-A",
        doc_type="lab",
        report_date="2024-03-01",
        source_filename="lipid.pdf",
        text="LDL 142. HDL 50.",
        chunk_size=200,
        overlap=20,
    )
    assert chunks
    for c in chunks:
        assert c["chunk_id"] and c["document_id"] == "doc-1"
        assert c["user_id"] == "user-A"
        assert c["doc_type"] == "lab"
        assert str(c["report_date"]) == "2024-03-01"
        assert c["source_filename"] == "lipid.pdf"


def test_fake_embedder_is_deterministic_and_normalized():
    e = FakeEmbedder()
    v1 = e.embed(["hello world"])[0]
    v2 = e.embed(["hello world"])[0]
    assert v1 == v2
    assert len(v1) == 384
    import math

    assert abs(math.sqrt(sum(x * x for x in v1)) - 1.0) < 1e-6
