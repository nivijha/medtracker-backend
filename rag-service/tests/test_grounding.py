import app.config as config_module
from fastapi.testclient import TestClient

from app.cache import InMemoryCache
from app.embedding import FakeEmbedder
from app.grounding import compute_evidence_score, should_abstain
from app.config import settings
from app.retrieval import InMemoryRetrievalStore, get_default_store


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


def test_lexical_reranker_evidence_scoring():
    """Regression (production): LexicalReranker counts must NOT go through sigmoid.

    Production runs EMBEDDING_PROVIDER=api -> LexicalReranker, whose rerank_score
    is a token-overlap count. count=2 (e.g. query tokens 'patient'/'taking' found
    in the chunk) must map to 0.50 and ground the answer, never abstain.
    """
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"

        candidates = [
            {
                "rerank_score": 2.0,
                "chunk_text": "patient taking metformin",
            }
        ]

        score = compute_evidence_score(candidates)

        assert score == 0.5
        assert not should_abstain(score)

        candidates = [
            {
                "rerank_score": 0.0,
                "chunk_text": "completely unrelated text",
            }
        ]

        score = compute_evidence_score(candidates)

        assert score == 0.0
        assert should_abstain(score)

    finally:
        settings.embedding_provider = original_provider


def test_lexical_score_boundaries():
    """Boundary mapping: 0->0.0, 1->0.25, 2->0.50, 3->0.75, 4->1.0, 5->1.0."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        for count, expected in [
            (0, 0.0),
            (1, 0.25),
            (2, 0.50),
            (3, 0.75),
            (4, 1.0),
            (5, 1.0),
        ]:
            score = compute_evidence_score([{"rerank_score": float(count)}])
            assert score == expected, f"count={count}: got {score}, expected {expected}"
    finally:
        settings.embedding_provider = original_provider


def test_strong_retrieval_survives_zero_lexical_overlap():
    """Regression (production): semantic retrieval evidence must NOT be erased
    by zero lexical overlap. Strong similarity grounds even with lexical 0."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"

        candidates = [
            {
                "similarity": 0.82,
                "lexical_score": 0.0,
                "rerank_score": 0.0,
                "score": 0.032787,
            }
        ]
        score = compute_evidence_score(candidates)
        assert score == 0.82
        assert not should_abstain(score)

        # Same guarantee when only the fused RRF score is available:
        # normalized by theoretical max n/(rrf_k+1) = 2/61 -> *30.5.
        candidates = [{"score": 2 / 61, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score == 1.0
        assert not should_abstain(score)

    finally:
        settings.embedding_provider = original_provider


def test_medication_query_grounds_via_lexical_signal():
    """TEST 3: 'What medication is the patient taking?' vs metformin chunk."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        candidates = [
            {
                "similarity": -0.0105,
                "lexical_score": 2.0,
                "rerank_score": 2.0,
                "score": 0.032787,
            }
        ]
        score = compute_evidence_score(candidates)
        assert score == 0.5
        assert score > settings.evidence_threshold
        assert not should_abstain(score)
    finally:
        settings.embedding_provider = original_provider


def test_semantically_equivalent_query_stays_eligible():
    """TEST 4: 'medicine prescribed' shares no meaningful tokens with 'taking
    metformin' except 'patient', yet the candidate must remain eligible via
    max(lexical, retrieval)."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        candidates = [
            {
                "similarity": 0.1474,
                "lexical_score": 1.0,
                "rerank_score": 1.0,
                "score": 1 / 61,
            }
        ]
        score = compute_evidence_score(candidates)
        # max(1/4, 0.1474) -> lexical carries it above threshold.
        assert score == 0.25
        assert not should_abstain(score)

        # Purely semantic variant: zero lexical overlap, retrieval alone.
        # Real MiniLM paraphrase pairs land well above 0.15; FakeEmbedder
        # cosines are hash noise and cannot model this, hence the explicit
        # strong-similarity fixture.
        candidates[0]["lexical_score"] = 0.0
        candidates[0]["rerank_score"] = 0.0
        candidates[0]["similarity"] = 0.55
        score = compute_evidence_score(candidates)
        assert score == 0.55
        assert not should_abstain(score)
    finally:
        settings.embedding_provider = original_provider


def test_unrelated_query_abstains():
    """TEST 5: weak/absent retrieval signal AND zero lexical overlap must
    abstain - retrieved != grounded."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"

        # Weak absolute similarity, no overlap.
        candidates = [{"similarity": 0.05, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score < settings.evidence_threshold
        assert should_abstain(score)

        # RRF fallback is intentionally coarse: it encodes relative rank only,
        # so even the deepest retrievable rank (top_k*3=30 -> 1/90) maps above
        # the threshold (1/90 * 61/2 ~= 0.3389). Abstention capability comes
        # from the absolute similarity signal, which both stores always attach.
        candidates = [{"score": 1 / 90, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score == round(min(1.0, (1 / 90) * 61 / 2), 4)
    finally:
        settings.embedding_provider = original_provider


def test_crossencoder_sigmoid_path_unchanged():
    """Local mode (provider != api) keeps sigmoid on CrossEncoder logits."""
    import math

    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "local"
        score = compute_evidence_score([{"rerank_score": 2.0}])
        expected = round(1.0 / (1.0 + math.exp(-2.0)), 4)
        assert score == expected
    finally:
        settings.embedding_provider = original_provider


class _FailingGenerationClient:
    def generate(self, system_prompt: str, user_prompt: str) -> str:
        raise RuntimeError("simulated generation outage")


def test_generation_failure_preserves_grounding_and_evidence():
    """Generation outage must NOT flip grounded=False nor drop sources/candidates."""
    original_provider = settings.embedding_provider
    original_secret = settings.rag_service_secret

    try:
        settings.embedding_provider = "api"
        settings.rag_service_secret = "test-secret"

        store = InMemoryRetrievalStore()
        from app.api import ingestion, query
        from app.main import app
        from app.rerank import LexicalReranker
        from app.retrieval import get_default_store

        app.dependency_overrides[ingestion.get_embedder] = lambda: FakeEmbedder()
        app.dependency_overrides[query.get_embedder] = lambda: FakeEmbedder()
        app.dependency_overrides[get_default_store] = lambda: store
        app.dependency_overrides[query.get_reranker] = lambda: LexicalReranker()
        app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()
        app.dependency_overrides[query.get_generation] = lambda: _FailingGenerationClient()

        client = TestClient(app)
        headers = {"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"}

        idx = client.post(
            "/rag/documents/index",
            json={
                "userId": "user-A",
                "documentId": "doc-9",
                "type": "medication",
                "sourceFilename": "test.pdf",
                "text": "The patient is currently taking metformin 500 mg once daily.",
            },
            headers=headers,
        )
        assert idx.status_code == 200
        assert idx.json()["indexed"] is True

        r = client.post(
            "/rag/query",
            json={"userId": "user-A", "query": "What medication is the patient taking?"},
            headers=headers,
        )
        assert r.status_code == 200
        body = r.json()

        # Grounding decision comes from retrieval evidence only.
        assert body["grounded"] is True
        assert body["evidenceScore"] >= settings.evidence_threshold

        # Evidence survives the generation failure.
        assert len(body["candidates"]) > 0
        assert body["candidates"][0]["documentId"] == "doc-9"
        assert len(body["sources"]) > 0
        assert body["candidates"][0]["text"].startswith(
            "The patient is currently taking metformin"
        )

        # Answer degrades gracefully instead of claiming insufficient evidence.
        assert body["answer"] == "Answer could not be generated at this time."
        assert body["answer"] != "Insufficient evidence was found in the available records."

    finally:
        settings.embedding_provider = original_provider
        settings.rag_service_secret = original_secret


class _OkGenerationClient:
    def generate(self, system_prompt: str, user_prompt: str) -> str:
        return "mock answer"


_METFORMIN_DOC = {
    "userId": "user-A",
    "documentId": "doc-9",
    "type": "medication",
    "sourceFilename": "test.pdf",
    "text": "The patient is currently taking metformin 500 mg once daily.",
}


def _index_metformin_and_query(client, headers, question):
    idx = client.post("/rag/documents/index", json=dict(_METFORMIN_DOC), headers=headers)
    assert idx.status_code == 200
    assert idx.json()["indexed"] is True
    return client.post(
        "/rag/query",
        json={"userId": "user-A", "query": question},
        headers=headers,
    )


def _api_mode_test_client():
    """Full pipeline with production-shaped components (LexicalReranker)."""
    from fastapi.testclient import TestClient as _TC

    from app.api import ingestion, query
    from app.main import app
    from app.rerank import LexicalReranker
    from app.retrieval import get_default_store as _gds

    store = InMemoryRetrievalStore()
    app.dependency_overrides[ingestion.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[query.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[_gds] = lambda: store
    app.dependency_overrides[query.get_reranker] = lambda: LexicalReranker()
    app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()
    app.dependency_overrides[query.get_generation] = lambda: _OkGenerationClient()
    return _TC(app)


def test_semantic_equivalent_query_grounds_end_to_end():
    """CASE B end-to-end: 'medicine prescribed' vs metformin chunk must ground."""
    original_provider = settings.embedding_provider
    original_secret = settings.rag_service_secret

    try:
        settings.embedding_provider = "api"
        settings.rag_service_secret = "test-secret"

        client = _api_mode_test_client()
        headers = {"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"}

        r = _index_metformin_and_query(
            client, headers, "What medicine has been prescribed to this patient?"
        )
        assert r.status_code == 200
        body = r.json()

        # Lexical 'patient' overlap carries evidence; retrieval signal preserved.
        assert body["grounded"] is True
        assert body["evidenceScore"] > 0.15
        assert len(body["candidates"]) > 0
        assert len(body["sources"]) > 0
        assert body["candidates"][0]["text"].startswith("The patient is currently taking")
        assert body["answer"] == "mock answer"
    finally:
        settings.embedding_provider = original_provider
        settings.rag_service_secret = original_secret


def test_unrelated_query_abstains_end_to_end():
    """CASE C end-to-end: insurance query vs metformin chunk must abstain.
    Retrieved != grounded: zero lexical overlap and no semantic signal."""
    original_provider = settings.embedding_provider
    original_secret = settings.rag_service_secret

    try:
        settings.embedding_provider = "api"
        settings.rag_service_secret = "test-secret"

        client = _api_mode_test_client()
        headers = {"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"}

        r = _index_metformin_and_query(
            client, headers, "What is the patient's insurance provider?"
        )
        assert r.status_code == 200
        body = r.json()

        assert body["grounded"] is False
        assert body["evidenceScore"] < settings.evidence_threshold
        assert body["answer"] == "Insufficient evidence was found in the available records."
        assert body["sources"] == []
    finally:
        settings.embedding_provider = original_provider
        settings.rag_service_secret = original_secret
