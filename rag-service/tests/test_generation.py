import app.config as config_module
from app.cache import InMemoryCache
from app.embedding import FakeEmbedder
from app.generation import GenerationClient, MockGenerationClient
from app.main import app
from app.rerank import LexicalReranker
from app.retrieval import InMemoryRetrievalStore, get_default_store
from app.api import ingestion, query
from fastapi.testclient import TestClient


def _client(secret="test-secret", generation=None, reranker=None):
    config_module.settings.rag_service_secret = secret
    store = InMemoryRetrievalStore()
    app.dependency_overrides[ingestion.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[query.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[get_default_store] = lambda: store
    app.dependency_overrides[query.get_reranker] = lambda: reranker or LexicalReranker()
    app.dependency_overrides[query.get_generation] = lambda: generation or MockGenerationClient(
        "Metformin 500 mg daily is indicated for diabetes."
    )
    app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()
    return TestClient(app), store


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


def test_query_returns_grounded_answer_with_sources():
    client, _ = _client()
    assert _index(client, "u1", "Metformin 500 mg daily for diabetes.", "d1").json()["indexed"]
    r = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "metformin dosage"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["grounded"] is True
    assert body["answer"] == "Metformin 500 mg daily is indicated for diabetes."
    assert body["evidenceScore"] > 0
    assert len(body["sources"]) > 0
    assert body["sources"][0]["documentId"] == "d1"
    assert body["candidates"][0]["sourceFilename"] == "notes.txt"


class _FailingGeneration(GenerationClient):
    def generate(self, system_prompt, user_prompt):
        raise RuntimeError("llm down")


def test_generation_failure_abstains_without_fabrication():
    client, _ = _client(generation=_FailingGeneration())
    assert _index(client, "u1", "Metformin 500 mg daily.", "d1").json()["indexed"]
    r = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "metformin"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    )
    body = r.json()
    assert body["grounded"] is False
    assert body["answer"] == "Insufficient evidence was found in the available records."
    assert body["sources"] == []
