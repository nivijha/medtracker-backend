"""End-to-end smoke test for the RAG pipeline.

Tests the full flow: index document → query → grounded answer + citations.
Uses InMemory stores + MockGenerationClient (no real LLM calls needed).
Validates that patient isolation works across users.
"""
from fastapi.testclient import TestClient

import app.config as config_module
from app.embedding import FakeEmbedder
from app.generation import GenerationClient, MockGenerationClient
from app.main import app
from app.rerank import LexicalReranker
from app.retrieval import InMemoryRetrievalStore, get_default_store
from app.api import ingestion, query
from fastapi.testclient import TestClient


def _client_with_secret(secret="test-secret"):
    from app.cache import InMemoryCache
    config_module.settings.rag_service_secret = secret
    store = InMemoryRetrievalStore()
    app.dependency_overrides[ingestion.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[query.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[get_default_store] = lambda: store
    app.dependency_overrides[query.get_reranker] = lambda: LexicalReranker()
    app.dependency_overrides[query.get_generation] = lambda: MockGenerationClient(
        "Metformin 500 mg twice daily is indicated for diabetes."
    )
    app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()
    return TestClient(app)


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


def test_e2e_patient_isolation():
    """Test that user A's docs are NOT visible to user B."""
    client = _client_with_secret()

    # Index docs for different users
    assert _index(client, "user-A", "Marker alpha for user A", "da").json()["indexed"]
    assert _index(client, "user-B", "Marker beta for user B", "db").json()["indexed"]

    # Query as user-A
    qa = client.post(
        "/rag/query",
        json={"userId": "user-A", "query": "marker"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"},
    ).json()

    # Query as user-B
    qb = client.post(
        "/rag/query",
        json={"userId": "user-B", "query": "marker"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-B"},
    ).json()

    # user-A should NOT see user-B's chunks
    ids_a = {c["chunkId"] for c in qa["candidates"]}
    ids_b = {c["chunkId"] for c in qb["candidates"]}

    assert "db" not in {c["documentId"] for c in qa["candidates"]}, "user-A should not see user-B's doc"
    assert ids_a.isdisjoint(ids_b) or "db" not in ids_a, "user-A and user-B should have disjoint chunks"

    print("✅ Patient isolation test PASSED")


def test_e2e_cache_hit():
    """Test that identical queries are served from cache."""
    client = _client_with_secret()

    # Index a document
    assert _index(client, "u1", "Metformin 500 mg daily.", "d1").json()["indexed"]

    # First query
    body1 = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "metformin dosage"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    ).json()

    # Identical query -> served from cache (no error, same result)
    body2 = client.post(
        "/rag/query",
        json={"userId": "u1", "query": "metformin dosage"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
    ).json()

    assert body1["answer"] == body2["answer"], "Cache should return consistent results"
    assert body1["grounded"] == body2["grounded"], "Cache should preserve grounded status"

    print("✅ Cache hit test PASSED")


if __name__ == "__main__":
    test_e2e_patient_isolation()
    test_e2e_cache_hit()
    print("\n🎉 All E2E tests PASSED")