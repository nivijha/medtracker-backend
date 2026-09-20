from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.rerank import (
    CrossEncoderReranker,
    LambdaReranker,
    LexicalReranker,
    get_default_reranker,
)
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


def test_cross_encoder_reranker_via_explicit_provider():
    from app.config import settings

    original = settings.reranker_provider
    try:
        settings.reranker_provider = "cross_encoder"
        r = get_default_reranker()
        assert isinstance(r, CrossEncoderReranker)
        assert r._model_name == "cross-encoder/ms-marco-MiniLM-L-6-v2"
    finally:
        settings.reranker_provider = original


def test_lexical_reranker_via_explicit_provider():
    from app.config import settings

    original = settings.reranker_provider
    try:
        settings.reranker_provider = "lexical"
        r = get_default_reranker()
        assert isinstance(r, LexicalReranker)
    finally:
        settings.reranker_provider = original


def test_lambda_reranker_via_explicit_provider():
    from app.config import settings

    original = settings.reranker_provider
    original_url = settings.lambda_reranker_url
    original_secret = settings.lambda_reranker_secret
    try:
        settings.reranker_provider = "lambda"
        settings.lambda_reranker_url = "https://rerank.mock/"
        settings.lambda_reranker_secret = "s3cr3t"
        r = get_default_reranker()
        assert isinstance(r, LambdaReranker)
        assert r._url == "https://rerank.mock"
    finally:
        settings.reranker_provider = original
        settings.lambda_reranker_url = original_url
        settings.lambda_reranker_secret = original_secret


def test_lambda_reranker_requires_url():
    from app.config import settings

    original = settings.reranker_provider
    original_url = settings.lambda_reranker_url
    original_secret = settings.lambda_reranker_secret
    try:
        settings.reranker_provider = "lambda"
        settings.lambda_reranker_url = ""
        settings.lambda_reranker_secret = ""
        with pytest.raises(RuntimeError):
            get_default_reranker()
    finally:
        settings.reranker_provider = original
        settings.lambda_reranker_url = original_url
        settings.lambda_reranker_secret = original_secret


def test_cross_encoder_instantiates_without_loading_model():
    # Construction must NOT require network / model download.
    r = CrossEncoderReranker(model_name="cross-encoder/ms-marco-MiniLM-L-6-v2")
    assert r._model is None
    assert hasattr(r, "rerank")


class _FakeCrossEncoderModel:
    """Stands in for sentence_transformers.CrossEncoder in tests."""

    def __init__(self, scores):
        self._scores = list(scores)
        self.predict_calls = []

    def predict(self, pairs):
        self.predict_calls.append(list(pairs))
        return list(self._scores)


def test_cross_encoder_attaches_scores_and_ranks_without_mutating_input():
    """Regression: scored copies were previously discarded, so rerank_score
    never reached the caller and ranking silently used stale keys."""
    r = CrossEncoderReranker(model_name="test-model")
    r._model = _FakeCrossEncoderModel([0.2, 0.8])

    candidates = [
        {"chunk_id": "a", "document_id": "d1", "chunk_text": "text a", "score": 0.9},
        {"chunk_id": "b", "document_id": "d1", "chunk_text": "text b", "score": 0.4},
    ]
    out = r.rerank("some query", candidates, top_k=2)

    # Candidate b (0.8) must rank above candidate a (0.2).
    assert [c["chunk_id"] for c in out] == ["b", "a"]
    assert out[0]["rerank_score"] == 0.8
    assert out[1]["rerank_score"] == 0.2

    # Original candidate metadata remains intact on the returned copies.
    assert out[0]["score"] == 0.4
    assert out[0]["document_id"] == "d1"
    assert out[0]["chunk_text"] == "text b"

    # The caller's list must not be mutated.
    assert all("rerank_score" not in c for c in candidates)


def test_lexical_reranker_preserves_retrieval_score_and_adds_lexical_score():
    """Score contract: score = retrieval score (untouched), lexical_score =
    overlap count, rerank_score = lexical count used for ranking."""
    r = LexicalReranker()
    retrieval_score = 0.032787
    candidates = [
        {
            "chunk_id": "c1",
            "document_id": "doc-9",
            "chunk_text": "The patient is currently taking metformin 500 mg once daily.",
            "score": retrieval_score,
        }
    ]
    out = r.rerank("What medication is the patient taking?", candidates, top_k=5)

    c = out[0]
    # Original hybrid/RRF retrieval score is NOT overwritten.
    assert c["score"] == retrieval_score
    assert "lexical_score" in c
    assert "rerank_score" in c
    # 'patient' and 'taking' overlap; stopwords/punctuation excluded.
    assert c["lexical_score"] == 2.0
    assert c["rerank_score"] == 2.0
    assert c is not candidates[0]


def test_lexical_reranker_counts_distinct_matched_tokens():
    """Regression: text.count() summed every occurrence, so one token repeated
    in a chunk inflated evidence. A token found N times is ONE match."""
    r = LexicalReranker()
    candidates = [
        {
            "chunk_id": "c1",
            "chunk_text": "metformin metformin metformin patient patient",
            "score": 0.01,
        }
    ]
    out = r.rerank("What medication is the patient taking?", candidates, top_k=1)
    # Distinct matched tokens = {patient}; 'metformin' occurrences are ignored
    # (query never mentions it) and 'patient' repeats count once.
    assert out[0]["lexical_score"] == 1.0
    assert out[0]["rerank_score"] == 1.0

    out = r.rerank("metformin dosage", candidates, top_k=1)
    assert out[0]["lexical_score"] == 1.0


def test_lexical_reranker_ignores_stopwords_and_punctuation():
    """'the'/'what' must not create phantom overlap; 'taking?' counts as
    'taking'."""
    r = LexicalReranker()
    candidates = [{"chunk_id": "c1", "chunk_text": "the patient is currently taking metformin.", "score": 0.01}]
    out = r.rerank("What is the patient's insurance provider?", candidates, top_k=3)
    # Only "patient's" could match and it stays distinct from "patient".
    assert out[0]["lexical_score"] == 0.0

    out = r.rerank("What medication is the patient taking?", candidates, top_k=3)
    assert out[0]["lexical_score"] == 2.0


def _lambda_response(chunk_scores):
    return {"reranked": [{"chunk_id": cid, "rerank_score": float(s)} for cid, s in chunk_scores], "count": len(chunk_scores), "model": "cross-encoder/ms-marco-MiniLM-L-6-v2"}


def _mock_response(status_code=200, json_data=None, text=""):
    resp = MagicMock()
    resp.status_code = status_code
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = RuntimeError("no json")
    resp.text = text
    resp.headers = {}
    return resp


def _mock_client_patch(fake_post):
    mock_instance = MagicMock()
    mock_instance.post.side_effect = fake_post
    mock_client_cls = MagicMock(return_value=mock_instance)
    mock_instance.__enter__ = MagicMock(return_value=mock_instance)
    mock_instance.__exit__ = MagicMock(return_value=False)
    return patch("httpx.Client", mock_client_cls)


_CANDIDATES = [
    {"chunk_id": "a", "document_id": "d1", "chunk_text": "metformin 500 mg", "score": 0.9, "src": "doc_a.txt"},
    {"chunk_id": "b", "document_id": "d1", "chunk_text": "patient history diabetes", "score": 0.4, "src": "doc_b.txt"},
]


def test_lambda_reranker_request_payload():
    captured = {}

    def fake_post(url, headers=None, json=None):
        captured["url"] = url
        captured["headers"] = headers
        captured["json"] = json
        return _mock_response(json_data=_lambda_response([("a", 0.2)]))

    with _mock_client_patch(fake_post), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="s3cr3t")
        r.rerank("query here", _CANDIDATES, top_k=5)

    assert captured["url"] == "https://rerank.mock"
    assert captured["json"]["query"] == "query here"
    assert captured["json"]["top_k"] == 5
    assert captured["json"]["candidates"] == [
        {"chunk_id": "a", "chunk_text": "metformin 500 mg"},
        {"chunk_id": "b", "chunk_text": "patient history diabetes"},
    ]


def test_lambda_reranker_auth_header():
    captured = {}

    def fake_post(url, headers=None, json=None):
        captured["headers"] = headers
        return _mock_response(json_data=_lambda_response([("a", 0.2)]))

    with _mock_client_patch(fake_post):
        r = LambdaReranker(url="https://rerank.mock/", secret="s3cr3t")
        r.rerank("q", _CANDIDATES[:1], top_k=1)

    assert captured["headers"]["X-Rerank-Secret"] == "s3cr3t"

    with _mock_client_patch(fake_post):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        r.rerank("q", _CANDIDATES[:1], top_k=1)
    assert "X-Rerank-Secret" not in captured["headers"]


def test_lambda_reranker_parses_response_and_preserves_identity():
    with _mock_client_patch(lambda *a, **k: _mock_response(json_data=_lambda_response([("b", 0.8), ("a", 0.2)]))), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="s3cr3t")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert len(out) == 2
    assert [c["chunk_id"] for c in out] == ["b", "a"]
    assert out[0]["rerank_score"] == 0.8
    assert out[0]["src"] == "doc_b.txt"       # original metadata preserved
    assert out[0]["score"] == 0.4             # retrieval score preserved
    assert out[1]["rerank_score"] == 0.2
    assert out[1]["src"] == "doc_a.txt"


def test_lambda_reranker_top_k_limits_results():
    with _mock_client_patch(lambda *a, **k: _mock_response(json_data=_lambda_response([("a", 0.2), ("b", 0.8)]))), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=1)

    assert len(out) == 1
    assert [c["chunk_id"] for c in out] == ["b"]


def test_lambda_reranker_empty_candidates():
    r = LambdaReranker(url="https://rerank.mock/", secret="")
    assert r.rerank("q", [], top_k=5) == []


def test_lambda_reranker_retries_429_then_succeeds():
    calls = {"n": 0}

    def fake_post(url, headers=None, json=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return _mock_response(status_code=429, text="rate limited")
        return _mock_response(json_data=_lambda_response([("b", 0.8), ("a", 0.2)]))

    with patch("time.sleep") as mock_sleep, _mock_client_patch(fake_post):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert calls["n"] == 2
    assert mock_sleep.called
    assert len(out) == 2


@pytest.mark.parametrize("status", [502, 503, 504])
def test_lambda_reranker_retries_transient_status_then_succeeds(status):
    calls = {"n": 0}

    def fake_post(url, headers=None, json=None):
        calls["n"] += 1
        if calls["n"] == 1:
            return _mock_response(status_code=status, text="transient")
        return _mock_response(json_data=_lambda_response([("b", 0.8), ("a", 0.2)]))

    with patch("time.sleep"), _mock_client_patch(fake_post):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert calls["n"] == 2
    assert len(out) == 2


@pytest.mark.parametrize("status", [400, 401, 403])
def test_lambda_reranker_does_not_retry_non_retryable_4xx(status):
    """Non-retryable 4xx falls back to LexicalReranker, not another HTTP attempt."""
    calls = {"n": 0}
    lexical_query = {"n": 0}

    original_lexical = LexicalReranker.rerank

    def patched_lexical(self, query, candidates, top_k):
        lexical_query["n"] += 1
        return original_lexical(self, query, candidates, top_k)

    def fake_post(url, headers=None, json=None):
        calls["n"] += 1
        return _mock_response(status_code=status, text="denied")

    with patch("time.sleep"), _mock_client_patch(fake_post), patch.object(LexicalReranker, "rerank", patched_lexical):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert calls["n"] == 1          # exactly one HTTP attempt, no retry
    assert lexical_query["n"] == 1  # fell back to lexical
    assert len(out) == 2


def test_lambda_reranker_timeout_falls_back_to_lexical():
    def fake_post(url, headers=None, json=None):
        raise httpx.ConnectTimeout("timed out", request=url)

    lexical_query = {"n": 0}
    original_lexical = LexicalReranker.rerank

    def patched_lexical(self, query, candidates, top_k):
        lexical_query["n"] += 1
        return original_lexical(self, query, candidates, top_k)

    with patch("time.sleep"), _mock_client_patch(fake_post), patch.object(LexicalReranker, "rerank", patched_lexical):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert lexical_query["n"] == 1
    assert len(out) == 2


def test_lambda_reranker_persistent_transient_failure_falls_back_to_lexical():
    """Transient 429 that never clears falls back to LexicalReranker after retries."""
    calls = {"n": 0}
    lexical_query = {"n": 0}
    original_lexical = LexicalReranker.rerank

    def patched_lexical(self, query, candidates, top_k):
        lexical_query["n"] += 1
        return original_lexical(self, query, candidates, top_k)

    def fake_post(url, headers=None, json=None):
        calls["n"] += 1
        return _mock_response(status_code=429, text="rate limited")

    from app.config import settings

    orig_retries = settings.reranker_max_retries
    orig_delay = settings.reranker_retry_delay_ms
    settings.reranker_max_retries = 3
    settings.reranker_retry_delay_ms = 1
    try:
        with patch("time.sleep"), _mock_client_patch(fake_post), patch.object(LexicalReranker, "rerank", patched_lexical):
            r = LambdaReranker(url="https://rerank.mock/", secret="")
            out = r.rerank("q", _CANDIDATES, top_k=2)
    finally:
        settings.reranker_max_retries = orig_retries
        settings.reranker_retry_delay_ms = orig_delay

    assert calls["n"] == 3  # retried to max_attempts
    assert lexical_query["n"] == 1
    assert len(out) == 2


def test_lambda_reranker_malformed_response_falls_back_to_lexical():
    """Missing 'reranked' list in the Lambda response falls back to lexical."""
    lexical_query = {"n": 0}
    original_lexical = LexicalReranker.rerank

    def patched_lexical(self, query, candidates, top_k):
        lexical_query["n"] += 1
        return original_lexical(self, query, candidates, top_k)

    with _mock_client_patch(lambda *a, **k: _mock_response(json_data={"count": 0})), patch("time.sleep"), patch.object(LexicalReranker, "rerank", patched_lexical):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert lexical_query["n"] == 1
    assert len(out) == 2


def test_lambda_reranker_unknown_candidates_excluded():
    """Candidates with no score in the Lambda response are dropped from the result."""
    with _mock_client_patch(lambda *a, **k: _mock_response(json_data=_lambda_response([("a", 0.2)]))), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert [c["chunk_id"] for c in out] == ["a"]
    assert len(out) == 1


# ---------------------------------------------------------------------------
# aws-rerank/app.py (Lambda runtime) tests
# ---------------------------------------------------------------------------
import importlib.util
import io
import json as _json
import pathlib
import sys as _sys
import tempfile


_LAMBDA_APP = None


def _lambda_app():
    global _LAMBDA_APP
    if _LAMBDA_APP is None:
        path = pathlib.Path(__file__).resolve().parents[2] / "aws-rerank" / "app.py"
        spec = importlib.util.spec_from_file_location("_aws_rerank_lambda_app", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _LAMBDA_APP = mod
    return _LAMBDA_APP


def _event(payload=None, headers=None, base64=None):
    evt = {"headers": headers or {}}
    if payload is not None:
        evt["body"] = _json.dumps(payload)
    if base64 is not None:
        import base64 as _b64
        evt["body"] = _b64.b64encode(_json.dumps(base64).encode("utf-8")).decode("ascii")
        evt["isBase64Encoded"] = True
    return evt


class _FakePredictModel:
    def __init__(self, scores):
        self._scores = list(scores)
        self.predict_pairs = []

    def predict(self, pairs):
        self.predict_pairs.append(pairs)
        return list(self._scores)


def test_lambda_app_model_init_uses_local_files_only_and_device_cpu():
    mod = _lambda_app()
    original = mod._model
    fake_st = MagicMock()
    try:
        mod._model = None
        with patch.object(mod, "_verify_model_path", return_value=None), patch.dict(
            _sys.modules, {"sentence_transformers": fake_st}
        ):
            ce_cls = fake_st.CrossEncoder
            ce_cls.return_value.predict.return_value = [0.5]
            model = mod._load_model()

        assert model is ce_cls.return_value
        ce_cls.assert_called_once_with(mod.MODEL_PATH, device="cpu", local_files_only=True)
    finally:
        mod._model = original


def test_lambda_app_model_init_is_warm_singleton():
    mod = _lambda_app()
    original = mod._model
    fake_st = MagicMock()
    try:
        mod._model = None
        with patch.object(mod, "_verify_model_path", return_value=None), patch.dict(
            _sys.modules, {"sentence_transformers": fake_st}
        ):
            ce_cls = fake_st.CrossEncoder
            ce_cls.return_value.predict.return_value = [0.5]
            first = mod._load_model()
            second = mod._load_model()

        assert first is second
        assert ce_cls.call_count == 1
    finally:
        mod._model = original


def test_lambda_app_verify_model_path_fails_fast_on_missing_files(tmp_path):
    mod = _lambda_app()
    (tmp_path / "config.json").write_text("{}")
    with patch.object(mod, "MODEL_PATH", str(tmp_path)):
        with pytest.raises(FileNotFoundError) as exc:
            mod._verify_model_path()
    assert "missing required file: tokenizer.json" in str(exc.value)


def test_lambda_app_verify_model_path_fails_fast_on_missing_dir(tmp_path):
    mod = _lambda_app()
    with patch.object(mod, "MODEL_PATH", str(tmp_path / "does-not-exist")):
        with pytest.raises(FileNotFoundError) as exc:
            mod._verify_model_path()
    assert "model directory not found" in str(exc.value)


def test_lambda_app_verify_model_path_rejects_both_weights_absent(tmp_path):
    mod = _lambda_app()
    for f in mod.REQUIRED_MODEL_FILES:
        (tmp_path / f).write_text("{}")
    with patch.object(mod, "MODEL_PATH", str(tmp_path)):
        with pytest.raises(FileNotFoundError) as exc:
            mod._verify_model_path()
    assert "model weights" in str(exc.value)


def test_lambda_app_handler_401_without_secret():
    mod = _lambda_app()
    import os as _os

    with patch.dict(_os.environ, {"LAMBDA_RERANK_SECRET": "sekret"}, clear=False):
        resp = mod.lambda_handler(_event({"query": "q", "candidates": [{"chunk_id": "a", "chunk_text": "t"}]}), None)
        assert resp["statusCode"] == 401
        assert _json.loads(resp["body"])["error"] == "unauthorized"


def test_lambda_app_handler_auth_header_matched_or_unset():
    mod = _lambda_app()
    import os as _os

    fake = _FakePredictModel([0.5])
    with patch.dict(_os.environ, {"LAMBDA_RERANK_SECRET": "sekret"}, clear=False), patch.object(
        mod, "_load_model", return_value=fake
    ):
        ok = mod.lambda_handler(
            _event(
                {"query": "q", "candidates": [{"chunk_id": "a", "chunk_text": "t"}]},
                headers={"x-rerank-secret": "sekret"},
            ),
            None,
        )
        assert ok["statusCode"] == 200

    with patch.dict(_os.environ, {"LAMBDA_RERANK_SECRET": ""}, clear=False), patch.object(
        mod, "_load_model", return_value=fake
    ):
        no_secret = mod.lambda_handler(
            _event({"query": "q", "candidates": [{"chunk_id": "a", "chunk_text": "t"}]}),
            None,
        )
        assert no_secret["statusCode"] == 200


def test_lambda_app_handler_400_invalid_json():
    mod = _lambda_app()
    resp = mod.lambda_handler({"headers": {}, "body": "{not json"}, None)
    assert resp["statusCode"] == 400
    assert _json.loads(resp["body"])["error"] == "invalid json"


def test_lambda_app_handler_400_validation_errors():
    mod = _lambda_app()
    fake = _FakePredictModel([0.5])
    cases = [
        {"query": "", "candidates": [{"chunk_id": "a", "chunk_text": "t"}]},
        {"query": 7, "candidates": [{"chunk_id": "a", "chunk_text": "t"}]},
        {"query": "q", "candidates": []},
        {"query": "q", "candidates": [{"chunk_text": "t"}]},
        {"query": "q", "candidates": [{"chunk_id": "a"}]},
        {"query": "q", "candidates": ["notanobject"]},
        {"query": "q", "candidates": [{"chunk_id": "a", "chunk_text": "x" * (mod.MAX_CHARS_PER_TEXT + 1)}]},
        {"query": "x" * (mod.MAX_QUERY_CHARS + 1), "candidates": [{"chunk_id": "a", "chunk_text": "t"}]},
    ]
    with patch.object(mod, "_load_model", return_value=fake):
        for payload in cases:
            resp = mod.lambda_handler(_event(payload), None)
            assert resp["statusCode"] == 400, f"{payload}: {resp}"


def test_lambda_app_handler_response_contract_sorted_desc_top_k():
    mod = _lambda_app()
    candidates = [
        {"chunk_id": "c1", "chunk_text": "text a"},
        {"chunk_id": "c2", "chunk_text": "text b"},
        {"chunk_id": "c3", "chunk_text": "text c"},
    ]
    fake = _FakePredictModel([0.31, 0.92, 0.64])
    with patch.object(mod, "_load_model", return_value=fake):
        resp = mod.lambda_handler(_event({"query": "q", "candidates": candidates, "top_k": 2}), None)

    assert resp["statusCode"] == 200
    body = _json.loads(resp["body"])
    assert body["count"] == 2
    assert body["model"] == "cross-encoder/ms-marco-MiniLM-L-6-v2"
    assert body["reranked"] == [
        {"chunk_id": "c2", "rerank_score": 0.92},
        {"chunk_id": "c3", "rerank_score": 0.64},
    ]
    assert [c["chunk_id"] for c in body["reranked"]] == ["c2", "c3"]
    assert fake.predict_pairs == [
        [("q", "text a"), ("q", "text b"), ("q", "text c")]
    ]


def test_lambda_app_handler_base64_body():
    mod = _lambda_app()
    fake = _FakePredictModel([0.5])
    with patch.object(mod, "_load_model", return_value=fake):
        resp = mod.lambda_handler(
            _event(base64={"query": "q", "candidates": [{"chunk_id": "a", "chunk_text": "t"}]}),
            None,
        )
    assert resp["statusCode"] == 200


def test_lambda_app_handler_500_on_inference_failure():
    mod = _lambda_app()

    def boom():
        raise RuntimeError("model load failed")

    with patch.object(mod, "_load_model", side_effect=boom):
        resp = mod.lambda_handler(_event({"query": "q", "candidates": [{"chunk_id": "a", "chunk_text": "t"}]}), None)
    assert resp["statusCode"] == 500
    assert _json.loads(resp["body"])["error"] == "rerank inference failed"


# ---------------------------------------------------------------------------
# RAG investigation regression guards (rerank score/metadata contract)
# ---------------------------------------------------------------------------
def test_lambda_reranker_preserves_scores_exactly():
    """Lambda rerank scores are attached verbatim to the matching candidate."""
    lam_scores = [("a", 0.7654), ("b", -1.2345)]
    with _mock_client_patch(lambda *a, **k: _mock_response(json_data=_lambda_response(lam_scores))), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert len(out) == 2
    by_id = {c["chunk_id"]: c for c in out}
    assert by_id["a"]["rerank_score"] == 0.7654
    assert by_id["b"]["rerank_score"] == -1.2345
    assert [c["chunk_id"] for c in out] == ["a", "b"]  # sorted desc by rerank_score


def test_lambda_reranker_preserves_original_candidate_metadata():
    """Original retrieval fields survive the Lambda round-trip on top of rerank_score."""
    with _mock_client_patch(lambda *a, **k: _mock_response(json_data=_lambda_response([("b", 0.9), ("a", 0.1)]))), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert len(out) == 2
    by_id = {c["chunk_id"]: c for c in out}
    for cid, expected in [("a", _CANDIDATES[0]), ("b", _CANDIDATES[1])]:
        c = by_id[cid]
        for key in ("document_id", "chunk_text", "score", "src"):
            assert c[key] == expected[key], f"{cid}.{key} not preserved"


def test_lambda_reranker_does_not_fabricate_lexical_score():
    """The Lambda provider must not invent lexical_score/rerank_source; the
    evidence breakdown relies on the documented rerank_score fallback."""
    with _mock_client_patch(lambda *a, **k: _mock_response(json_data=_lambda_response([("a", 0.5), ("b", -1.0)]))), patch("time.sleep"):
        r = LambdaReranker(url="https://rerank.mock/", secret="")
        out = r.rerank("q", _CANDIDATES, top_k=2)

    assert len(out) == 2
    assert all("lexical_score" not in c for c in out)
    assert all("rerank_source" not in c for c in out)


def test_cross_encoder_reranker_does_not_fabricate_lexical_score():
    """CrossEncoderReranker attaches only rerank_score (raw logit), never a
    lexical_score or rerank_source."""
    r = CrossEncoderReranker(model_name="test-model")
    r._model = _FakeCrossEncoderModel([0.2, 0.8])
    candidates = [
        {"chunk_id": "a", "document_id": "d1", "chunk_text": "text a", "score": 0.9},
        {"chunk_id": "b", "document_id": "d1", "chunk_text": "text b", "score": 0.4},
    ]
    out = r.rerank("some query", candidates, top_k=2)

    assert len(out) == 2
    assert [c["chunk_id"] for c in out] == ["b", "a"]
    assert all("lexical_score" not in c for c in out)
    assert all("rerank_source" not in c for c in out)
    assert {c["chunk_id"]: c["rerank_score"] for c in out} == {"b": 0.8, "a": 0.2}


def test_lexical_reranker_behavior_unchanged():
    """LexicalReranker still attaches lexical_score == rerank_score (distinct
    matched-token count) and orders by it."""
    r = LexicalReranker()
    out = r.rerank("metformin dosage", _CANDIDATES, top_k=2)

    assert len(out) == 2
    assert all("lexical_score" in c for c in out)
    for c in out:
        assert c["lexical_score"] == c["rerank_score"]
    assert out[0]["chunk_id"] == "a"  # chunk mentioning 'metformin' ranks first
    assert out[0]["lexical_score"] == 1.0
