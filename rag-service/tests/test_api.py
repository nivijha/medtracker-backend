import app.config as config_module
from app.cache import InMemoryCache
from app.embedding import FakeEmbedder
from app.main import app
from app.rerank import LexicalReranker
from app.retrieval import InMemoryRetrievalStore, get_default_store
from app.api import ingestion, query
from fastapi.testclient import TestClient


def _client_with_secret(secret="test-secret"):
    config_module.settings.rag_service_secret = secret
    store = InMemoryRetrievalStore()
    app.dependency_overrides[ingestion.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[query.get_embedder] = lambda: FakeEmbedder()
    app.dependency_overrides[get_default_store] = lambda: store
    app.dependency_overrides[query.get_reranker] = lambda: LexicalReranker()
    app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()
    return TestClient(app)


def test_health_ok():
    client = _client_with_secret()
    r = client.get("/rag/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_index_and_query_roundtrip():
    client = _client_with_secret()
    idx = client.post(
        "/rag/documents/index",
        json={
            "userId": "user-A",
            "documentId": "doc-1",
            "type": "lab",
            "reportDate": "2024-03-01",
            "sourceFilename": "lipid.pdf",
            "text": "LDL cholesterol is 142 mg/dL. HDL is 50.",
        },
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"},
    )
    assert idx.status_code == 200
    assert idx.json()["indexed"] is True
    assert idx.json()["chunkCount"] > 0

    q = client.post(
        "/rag/query",
        json={"userId": "user-A", "query": "LDL cholesterol"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"},
    )
    assert q.status_code == 200
    body = q.json()
    assert len(body["candidates"]) > 0
    assert body["candidates"][0]["documentId"] == "doc-1"


def test_secret_required_when_configured():
    client = _client_with_secret()
    r = client.post(
        "/rag/documents/index",
        json={"userId": "u", "documentId": "d", "type": "lab", "text": "x"},
    )
    assert r.status_code == 403


def test_user_id_mismatch_rejected():
    client = _client_with_secret()
    r = client.post(
        "/rag/documents/index",
        json={"userId": "user-A", "documentId": "d", "type": "lab", "text": "x"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-B"},
    )
    assert r.status_code == 403
    assert "User ID mismatch" in r.json()["detail"]


def test_missing_user_id_header_rejected():
    client = _client_with_secret()
    r = client.post(
        "/rag/documents/index",
        json={"userId": "user-A", "documentId": "d", "type": "lab", "text": "x"},
        headers={"X-Rag-Service-Secret": "test-secret"},
    )
    assert r.status_code == 403
    assert "Missing X-User-Id header" in r.json()["detail"]


def test_api_enforces_patient_isolation():
    client = _client_with_secret()
    headers = {"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-A"}
    # Index one doc per user with distinct text.
    client.post(
        "/rag/documents/index",
        json={"userId": "user-A", "documentId": "da", "type": "lab", "text": "Marker alpha for user A"},
        headers=headers,
    )
    client.post(
        "/rag/documents/index",
        json={"userId": "user-B", "documentId": "db", "type": "lab", "text": "Marker beta for user B"},
        headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-B"},
    )
    qa = client.post("/rag/query", json={"userId": "user-A", "query": "marker"}, headers=headers)
    qb = client.post("/rag/query", json={"userId": "user-B", "query": "marker"}, headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "user-B"})
    ids_a = {c["chunkId"] for c in qa.json()["candidates"]}
    ids_b = {c["chunkId"] for c in qb.json()["candidates"]}
    assert "db" not in {c["documentId"] for c in qa.json()["candidates"]}
    assert ids_a.isdisjoint(ids_b) or "db" not in ids_a
