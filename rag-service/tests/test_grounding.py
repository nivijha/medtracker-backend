import app.config as config_module
import math

from fastapi.testclient import TestClient

from app.cache import InMemoryCache
from app.embedding import FakeEmbedder
from app.grounding import compute_evidence_score, explain_evidence, should_abstain
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
    """Contract after the answer-evidence fix: a single distinct matched token
    is corpus-boilerplate risk ("patient") and earns NOTHING; credit starts at
    2 distinct tokens: 0->0.0, 1->0.0, 2->0.50, 3->0.75, 4->1.0, 5->1.0."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        for count, expected in [
            (0, 0.0),
            (1, 0.0),
            (2, 0.50),
            (3, 0.75),
            (4, 1.0),
            (5, 1.0),
        ]:
            score = compute_evidence_score([{"rerank_score": float(count)}])
            assert score == expected, f"count={count}: got {score}, expected {expected}"
    finally:
        settings.embedding_provider = original_provider


def test_similarity_floor_calibration():
    """Raw MiniLM cosine must NOT pass through as evidence probability.

    Production measured an unrelated same-domain pair at cosine 0.3127
    ("insurance provider" vs metformin chunk). With SIM_FLOOR=0.40 that maps to
    zero evidence; paraphrase-band similarities map proportionally; >=SIM_CEIL
    saturates."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        for sim, expected in [
            (0.3127, 0.0),   # production bug case
            (0.40, 0.0),     # exactly at floor
            (0.45, 0.125),   # just above floor
            (0.60, 0.5),     # mid paraphrase band
            (0.80, 1.0),     # ceiling
            (0.95, 1.0),     # saturated
        ]:
            score = compute_evidence_score([{"similarity": sim}])
            assert score == expected, f"sim={sim}: got {score}, expected {expected}"
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
        # Floor-calibrated: (0.82 - 0.40) / (0.80 - 0.40) -> clamped to 1.0.
        assert score == 1.0
        assert not should_abstain(score)

        # A rank-based RRF score is NOT evidence: without an absolute
        # similarity signal there is nothing left once lexical is zero.
        candidates = [{"score": 2 / 61, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score == 0.0
        assert should_abstain(score)

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
    metformin' - synonymy is carried by the embedding channel, not lexical
    matching. A paraphrase-band cosine must keep the candidate eligible."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        candidates = [
            {
                "similarity": 0.62,
                "lexical_score": 0.0,
                "rerank_score": 0.0,
                "score": 1 / 61,
            }
        ]
        score = compute_evidence_score(candidates)
        # Floor-calibrated: (0.62 - 0.40) / 0.40 = 0.55.
        assert score == 0.55
        assert not should_abstain(score)
    finally:
        settings.embedding_provider = original_provider


def test_unrelated_query_abstains():
    """TEST 5: topical relatedness without answer evidence must abstain -
    retrieved != grounded."""

    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"

        # Production-observed failure: unrelated same-domain pair at the
        # MiniLM anisotropy floor.
        candidates = [{"similarity": 0.3127, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score == 0.0
        assert should_abstain(score)

        # Rank-based RRF presence alone is not evidence either.
        candidates = [{"score": 1 / 90, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score == 0.0
        assert should_abstain(score)

        # CASE 4 fixture: blood-group query vs metformin chunk.
        candidates = [{"similarity": 0.30, "lexical_score": 0.0, "rerank_score": 0.0}]
        score = compute_evidence_score(candidates)
        assert score == 0.0
        assert should_abstain(score)

        # CASE 5 fixture: medication query vs blood-group chunk. Single
        # boilerplate token match ("patient") earns no lexical credit and the
        # cross-topic similarity stays under the floor.
        candidates = [{"similarity": 0.40, "lexical_score": 1.0, "rerank_score": 1.0}]
        score = compute_evidence_score(candidates)
        assert score == 0.0
        assert should_abstain(score)
    finally:
        settings.embedding_provider = original_provider


def test_explain_evidence_matches_final_score():
    """explain_evidence() must expose every input signal and agree with
    compute_evidence_score() (audit-trail contract used by query logging)."""
    original_provider = settings.embedding_provider

    try:
        settings.embedding_provider = "api"
        candidates = [
            {
                "similarity": 0.3127,
                "lexical_score": 0.0,
                "rerank_score": 0.0,
                "score": 1 / 61,
            }
        ]
        parts = explain_evidence(candidates)
        assert parts["lexical_matched"] == 0.0
        assert parts["lexical_evidence"] == 0.0
        assert parts["similarity"] == 0.3127
        assert parts["retrieval_evidence"] == 0.0
        assert abs(parts["rrf_score"] - 1 / 61) < 1e-9
        assert parts["evidence_score"] == compute_evidence_score(candidates) == 0.0

        empty = explain_evidence([])
        assert empty["evidence_score"] == 0.0
        assert empty["similarity"] is None
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

        assert body["generation_available"] is False
        assert body["rag_available"] is True
        assert "found relevant information" in body["answer"]
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


class _ScriptedEmbedder:
    """Deterministic embedder with hand-built unit vectors.

    FakeEmbedder's hash-based cosines are noise (~0 +/- 0.15) and cannot model
    real MiniLM semantics; these tests need EXACT control of the similarity
    channel while still running the full retrieve -> rerank -> ground pipeline.
    Vectors live in a 2D subspace of the 384-dim schema: cos(q, c) equals the
    cosine of the angle between their assigned degrees.
    """

    dim = 384

    def __init__(self, angles: dict[str, float]):
        import math

        self._vectors = {}
        for text, degrees in angles.items():
            r = math.radians(degrees)
            vec = [math.cos(r), math.sin(r)] + [0.0] * (self.dim - 2)
            self._vectors[text] = vec

    def embed(self, texts):
        return [list(self._vectors[t]) for t in texts]


def _index_metformin_and_query(client, headers, question):
    idx = client.post("/rag/documents/index", json=dict(_METFORMIN_DOC), headers=headers)
    assert idx.status_code == 200
    assert idx.json()["indexed"] is True
    return client.post(
        "/rag/query",
        json={"userId": "user-A", "query": question},
        headers=headers,
    )


def _api_mode_test_client(embedder):
    """Full pipeline with production-shaped components (LexicalReranker)."""
    from fastapi.testclient import TestClient as _TC

    from app.api import ingestion, query
    from app.main import app
    from app.rerank import LexicalReranker
    from app.retrieval import get_default_store as _gds

    store = InMemoryRetrievalStore()
    app.dependency_overrides[ingestion.get_embedder] = lambda: embedder
    app.dependency_overrides[query.get_embedder] = lambda: embedder
    app.dependency_overrides[_gds] = lambda: store
    app.dependency_overrides[query.get_reranker] = lambda: LexicalReranker()
    app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()
    app.dependency_overrides[query.get_generation] = lambda: _OkGenerationClient()
    return _TC(app)


_CHUNK_ANGLE = 0.0
# arccos(0.62): exact paraphrase-band cosine for the medicine query.
_MEDICINE_QUERY_ANGLE = math.degrees(math.acos(0.62))
_INSURANCE_QUERY_ANGLE = 90.0  # orthogonal: zero semantic signal


def test_semantic_equivalent_query_grounds_end_to_end():
    """CASE B end-to-end: 'medicine prescribed' vs metformin chunk must ground
    via the floor-calibrated embedding channel (zero lexical credit)."""
    original_provider = settings.embedding_provider
    original_secret = settings.rag_service_secret

    try:
        settings.embedding_provider = "api"
        settings.rag_service_secret = "test-secret"

        embedder = _ScriptedEmbedder(
            {
                _METFORMIN_DOC["text"]: _CHUNK_ANGLE,
                "What medicine has been prescribed to this patient?": _MEDICINE_QUERY_ANGLE,
            }
        )
        client = _api_mode_test_client(embedder)
        headers = {"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"}

        r = _index_metformin_and_query(
            client, headers, "What medicine has been prescribed to this patient?"
        )
        assert r.status_code == 200
        body = r.json()

        # cosine 0.62 -> (0.62-0.40)/0.40 = 0.55 evidence; lexical is 0.
        assert body["grounded"] is True
        assert abs(body["evidenceScore"] - 0.55) < 1e-9
        assert len(body["candidates"]) > 0
        assert len(body["sources"]) > 0
        assert body["candidates"][0]["text"].startswith("The patient is currently taking")
        assert body["answer"] == "mock answer"
    finally:
        settings.embedding_provider = original_provider
        settings.rag_service_secret = original_secret


def test_unrelated_query_abstains_end_to_end():
    """CASE C end-to-end: insurance query vs metformin chunk must abstain.
    Topical relatedness alone (shared 'patient' context) is not evidence."""
    original_provider = settings.embedding_provider
    original_secret = settings.rag_service_secret

    try:
        settings.embedding_provider = "api"
        settings.rag_service_secret = "test-secret"

        embedder = _ScriptedEmbedder(
            {
                _METFORMIN_DOC["text"]: _CHUNK_ANGLE,
                "What is the patient's insurance provider?": _INSURANCE_QUERY_ANGLE,
            }
        )
        client = _api_mode_test_client(embedder)
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
