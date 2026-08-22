import app.config as config_module
from app.cache import InMemoryCache, make_cache_key
from app.embedding import FakeEmbedder
from app.generation import GenerationClient, MockGenerationClient
from app.main import app
from app.rerank import LexicalReranker
from app.retrieval import InMemoryRetrievalStore, get_default_store
from app.api import ingestion, query
from fastapi.testclient import TestClient


class _CountingGeneration(GenerationClient):
    def __init__(self):
        self.calls = 0

    def generate(self, system_prompt, user_prompt):
        self.calls += 1
        return f"ANSWER#{self.calls}"


def _client(secret="test-secret"):
    config_module.settings.rag_service_secret = secret
    store = InMemoryRetrievalStore()
    cache = InMemoryCache()
    gen = _CountingGeneration()
    app.dependency_overrides[ingestion.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[query.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[get_default_store] = lambda: store
    app.dependency_overrides[query.get_reranker] = lambda: LexicalReranker()
    app.dependency_overrides[query.get_generation] = lambda: gen
    app.dependency_overrides[query.get_cache] = lambda: cache
    return TestClient(app), store, cache, gen


def _index(client, user, text, doc_id):
    return client.post(
        "/rag/documents/index",
        json={
            "userId": user,
            "documentId": doc_id,
            "type": "lab",
            "sourceFilename": "notes.txt",
            "text": text,
        },
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": user},
    )


def test_cache_key_format():
    k = make_cache_key("u1", "1", "Metformin dosage?")
    assert k == "rag:u1:1:" + make_cache_key("u1", "1", "Metformin dosage?").split(":")[-1]
    assert k.startswith("rag:u1:1:")
    # Same query (case/space-insensitive) -> same key.
    assert make_cache_key("u1", "1", "metformin dosage?") == k


def test_query_is_cached_and_not_regenerated():
    client, _, cache, gen = _client()
    assert _index(client, "u1", "Metformin 500 mg daily.", "d1").json()["indexed"]

    body1 = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "metformin dosage"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    ).json()
    assert body1["answer"] == "ANSWER#1"
    assert gen.calls == 1
    assert len(cache._store) == 1

    # Identical query -> served from cache, generation NOT called again.
    body2 = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "metformin dosage"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    ).json()
    assert gen.calls == 1
    assert body2["answer"] == "ANSWER#1"
    assert body2["evidenceScore"] == body1["evidenceScore"]


def test_different_users_do_not_share_cache():
    client, store, cache, gen = _client()
    client.post(
        "/rag/documents/index",
        json={"userId": "u1", "documentId": "d1", "type": "lab", "text": "Metformin 500 mg."},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    )
    client.post(
        "/rag/documents/index",
        json={"userId": "u2", "documentId": "d2", "type": "lab", "text": "Lisinopril 10 mg."},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u2"},
    )
    q1 = client.post("/rag/query", json={"userId": "u1", "query": "metformin"}, headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"}).json()
    q2 = client.post("/rag/query", json={"userId": "u2", "query": "metformin"}, headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u2"}).json()
    assert q1["answer"] == "ANSWER#1"
    assert q2["answer"] == "ANSWER#2"  # distinct generation, not served from u1's cache
    assert len(cache._store) == 2


def test_context_dependent_rewrite_propagates():
    client, _, _, gen = _client()
    assert _index(client, "u1", "Metformin 500 mg daily for diabetes.", "d1").json()["indexed"]
    r = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "What about its side effects?", "previousQuery": "What is the dosage of metformin?"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    ).json()
    assert r["rewrittenQuery"] is not None
    assert "metformin" in r["rewrittenQuery"]
