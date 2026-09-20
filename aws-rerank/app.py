import json
import logging
import os
import time
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))

MODEL_PATH = "/opt/models/ms-marco-MiniLM-L-6-v2"
MAX_CANDIDATES = int(os.getenv("MAX_CANDIDATES", "64"))
MAX_CHARS_PER_TEXT = int(os.getenv("MAX_CHARS_PER_TEXT", "8000"))
MAX_QUERY_CHARS = int(os.getenv("MAX_QUERY_CHARS", "2000"))

REQUIRED_MODEL_FILES = (
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
)

_model = None


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _log(event, **fields):
    payload = {
        "event": event,
        "ts": _now(),
    }
    payload.update(fields)
    logger.info(json.dumps(payload))


def _auth_ok(headers):
    secret = os.getenv("LAMBDA_RERANK_SECRET", "")
    if not secret:
        return True
    got = headers.get("x-rerank-secret") or headers.get("X-Rerank-Secret") or headers.get("X-rerank-secret")
    return got == secret


def _reply(status, payload):
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps(payload),
    }


def _verify_model_path():
    """Ensure the baked model is present locally and fail fast and clearly if
    any required file is missing, instead of silently attempting a network
    download at runtime."""
    reasons = []
    if not os.path.isdir(MODEL_PATH):
        reasons.append(f"model directory not found: {MODEL_PATH}")
    else:
        for f in REQUIRED_MODEL_FILES:
            if not os.path.isfile(os.path.join(MODEL_PATH, f)):
                reasons.append(f"missing required file: {f}")
        has_weights = os.path.isfile(os.path.join(MODEL_PATH, "model.safetensors")) or os.path.isfile(
            os.path.join(MODEL_PATH, "pytorch_model.bin")
        )
        if not has_weights:
            reasons.append("missing model weights (model.safetensors or pytorch_model.bin)")
    if reasons:
        raise FileNotFoundError("; ".join(reasons))
    return None


def _load_model():
    global _model
    if _model is not None:
        return _model
    _verify_model_path()
    from sentence_transformers import CrossEncoder

    _log("model_init_start", model_path=MODEL_PATH)
    t0 = time.time()
    _model = CrossEncoder(MODEL_PATH, device="cpu", local_files_only=True)
    _log("model_init_complete", model_path=MODEL_PATH, elapsed_ms=int((time.time() - t0) * 1000))
    return _model


def lambda_handler(event, context):
    t_start = time.time()
    request_id = (
        event.get("requestId")
        or (event.get("requestContext") or {}).get("requestId")
        or None
    )
    _log("handler_entry", request_id=request_id)

    headers = event.get("headers") or {}
    lower_headers = {k.lower(): v for k, v in headers.items()}
    if not _auth_ok(lower_headers):
        _log("auth_failed", request_id=request_id)
        return _reply(401, {"error": "unauthorized"})

    try:
        body = event.get("body") or ""
        if event.get("isBase64Encoded"):
            import base64
            body = base64.b64decode(body).decode("utf-8")
        if isinstance(body, str) and body:
            data = json.loads(body)
        elif isinstance(body, dict):
            data = body
        else:
            data = event
    except Exception:
        return _reply(400, {"error": "invalid json"})

    query = data.get("query")
    if not isinstance(query, str) or not query.strip():
        return _reply(400, {"error": "query must be non-empty string"})
    if len(query) > MAX_QUERY_CHARS:
        return _reply(400, {"error": f"query too long max {MAX_QUERY_CHARS}"})

    candidates = data.get("candidates")
    if not isinstance(candidates, list) or len(candidates) == 0:
        return _reply(400, {"error": "candidates must be non-empty list"})
    if len(candidates) > MAX_CANDIDATES:
        return _reply(400, {"error": f"too many candidates max {MAX_CANDIDATES}"})

    top_k = data.get("top_k", 10)
    if not isinstance(top_k, int) or top_k < 1:
        top_k = 10

    pairs = []
    chunk_ids = []
    for c in candidates:
        if not isinstance(c, dict):
            return _reply(400, {"error": "each candidate must be an object"})
        chunk_id = c.get("chunk_id")
        chunk_text = c.get("chunk_text")
        if not isinstance(chunk_id, str) or not chunk_id:
            return _reply(400, {"error": "each candidate must have chunk_id"})
        if not isinstance(chunk_text, str) or not chunk_text.strip():
            return _reply(400, {"error": "each candidate must have chunk_text"})
        if len(chunk_text) > MAX_CHARS_PER_TEXT:
            return _reply(400, {"error": f"chunk_text too long max {MAX_CHARS_PER_TEXT}"})
        pairs.append((query, chunk_text))
        chunk_ids.append(chunk_id)

    _log(
        "validation_complete",
        request_id=request_id,
        candidate_count=len(candidates),
        top_k=top_k,
    )

    try:
        model = _load_model()
        _log("predict_start", request_id=request_id, pair_count=len(pairs), top_k=top_k)
        t0 = time.time()
        scores = model.predict(pairs)
        _log("predict_complete", request_id=request_id, pair_count=len(pairs), elapsed_ms=int((time.time() - t0) * 1000))
    except Exception:
        _log("inference_failed", request_id=request_id)
        logger.exception("rerank inference failed")
        return _reply(500, {"error": "rerank inference failed"})

    scored = []
    for cid, score in zip(chunk_ids, scores):
        scored.append({"chunk_id": cid, "rerank_score": float(score)})
    scored.sort(key=lambda x: x["rerank_score"], reverse=True)
    result = scored[:top_k]

    t0 = time.time()
    payload = {"reranked": result, "count": len(result), "model": "cross-encoder/ms-marco-MiniLM-L-6-v2"}
    body = json.dumps(payload)
    _log(
        "response_serialized",
        request_id=request_id,
        count=len(result),
        serialize_ms=int((time.time() - t0) * 1000),
        total_ms=int((time.time() - t_start) * 1000),
    )
    return _reply(200, payload)