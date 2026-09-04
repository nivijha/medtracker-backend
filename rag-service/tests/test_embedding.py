import httpx
import app.config as config_module
from app.embedding import HfInferenceEmbedder

DIM = 384


def _vec(val=0.1):
    v = [val] * DIM
    import math

    n = math.sqrt(sum(x * x for x in v)) or 1.0
    return [x / n for x in v]


def _feature_extraction_body(vec):
    return [vec]


def _transport(handler):
    return httpx.MockTransport(handler)


def _embedder(transport, model="sentence-transformers/all-MiniLM-L6-v2"):
    emb = HfInferenceEmbedder(model_name=model, api_key="test-key", api_url="https://api-inference.huggingface.co")
    orig_client = httpx.Client

    class PatchedClient(httpx.Client):
        def __init__(self, *a, **kw):
            kw["transport"] = transport
            super().__init__(*a, **kw)

    import unittest.mock as mock

    return emb, mock.patch("httpx.Client", PatchedClient)


def _configure(handle_time=True):
    if handle_time:
        import unittest.mock as mock

        return mock.patch("time.sleep", lambda s: None)
    import contextlib

    return contextlib.nullcontext()


# ── Test 1 — successful embedding (single attempt) ──────────────────────────

def test_successful_embedding_one_attempt():
    vec = _vec(0.1)
    def handler(req):
        return httpx.Response(200, json=_feature_extraction_body(vec))

    emb, patcher = _embedder(_transport(handler))
    with patcher, _configure():
        out = emb.embed(["hello"])
    assert len(out) == 1
    assert len(out[0]) == DIM


# ── Test 2 — timeout then success (retry) ───────────────────────────────────

def test_timeout_then_success():
    vec = _vec(0.1)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        if calls["n"] == 1:
            raise httpx.ReadTimeout("The read operation timed out")
        return httpx.Response(200, json=_feature_extraction_body(vec))

    emb, patcher = _embedder(_transport(handler))
    with patcher, _configure():
        out = emb.embed(["hello"])
    assert calls["n"] == 2
    assert len(out) == 1


# ── Test 3 — repeated transient failure → controlled failure ────────────────

def test_repeated_timeout_controlled_failure():
    def handler(req):
        raise httpx.ReadTimeout("The read operation timed out")

    emb, patcher = _embedder(_transport(handler))
    with patcher, _configure():
        try:
            emb.embed(["hello"])
            assert False, "should have raised"
        except httpx.ReadTimeout:
            pass
        except RuntimeError as e:
            assert "timed out" in str(e).lower() or "failed" in str(e).lower()


# ── Test 4 — 429 then success (respects retry) ─────────────────────────────

def test_429_then_success():
    vec = _vec(0.1)
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="Too Many Requests", headers={"retry-after": "0"})
        return httpx.Response(200, json=_feature_extraction_body(vec))

    emb, patcher = _embedder(_transport(handler))
    with patcher, _configure():
        out = emb.embed(["hello"])
    assert calls["n"] == 2
    assert len(out) == 1


# ── Test 5 — non-transient 401 → no retry, immediate error ─────────────────

def test_401_no_retry():
    calls = {"n": 0}

    def handler(req):
        calls["n"] += 1
        return httpx.Response(401, text="Unauthorized")

    emb, patcher = _embedder(_transport(handler))
    with patcher, _configure():
        try:
            emb.embed(["hello"])
            assert False, "should have raised"
        except RuntimeError as e:
            assert "401" in str(e)
    assert calls["n"] == 1


# ── Test 6 — indexing path uses same embedder correctly ────────────────────

def test_indexing_path_reuses_embedder():
    from app.cache import InMemoryCache
    from app.main import app
    from app.retrieval import InMemoryRetrievalStore, get_default_store
    from app.api import ingestion, query
    from fastapi.testclient import TestClient

    vec = _vec(0.1)

    def handler(req):
        return httpx.Response(200, json=_feature_extraction_body(vec))

    emb, patcher = _embedder(_transport(handler))
    config_module.settings.rag_service_secret = "test-secret"
    store = InMemoryRetrievalStore()
    app.dependency_overrides[ingestion.get_embedder] = lambda: emb
    app.dependency_overrides[query.get_embedder] = lambda: emb
    app.dependency_overrides[get_default_store] = lambda: store
    app.dependency_overrides[query.get_cache] = lambda: InMemoryCache()

    with patcher, _configure():
        client = TestClient(app)
        r = client.post(
            "/rag/documents/index",
            json={"userId": "u1", "documentId": "d1", "type": "lab", "text": "hello world lab report"},
            headers={"X-Rag-Service-Secret": "test-secret", "X-User-Id": "u1"},
        )
        assert r.status_code == 200
        assert r.json()["indexed"] is True
