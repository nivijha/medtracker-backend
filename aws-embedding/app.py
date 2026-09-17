import json
import logging
import math
import os

logger = logging.getLogger()
logger.setLevel(os.getenv("LOG_LEVEL", "INFO"))

MODEL_PATH = "/opt/models/all-MiniLM-L6-v2"
MAX_TEXTS = int(os.getenv("MAX_TEXTS", "64"))
MAX_CHARS = int(os.getenv("MAX_CHARS_PER_TEXT", "8000"))
MAX_TOTAL_BYTES = int(os.getenv("MAX_TOTAL_BYTES", "262144"))

_model = None

def _load_model():
    global _model
    if _model is not None:
        return _model
    from sentence_transformers import SentenceTransformer
    _model = SentenceTransformer(MODEL_PATH, device="cpu")
    return _model


def _auth_ok(headers):
    secret = os.getenv("LAMBDA_EMBEDDING_SECRET", "")
    if not secret:
        return True
    got = headers.get("x-embedding-secret") or headers.get("X-Embedding-Secret") or headers.get("X-embedding-secret")
    return got == secret


def lambda_handler(event, context):
    headers = event.get("headers") or {}
    # normalize header keys lower
    lower_headers = {k.lower(): v for k, v in headers.items()}
    if not _auth_ok(lower_headers):
        return {"statusCode": 401, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "unauthorized"})}

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
        texts = data.get("texts")
        if texts is None and isinstance(event.get("texts"), list):
            texts = event["texts"]
    except Exception:
        return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "invalid json"})}

    if not isinstance(texts, list) or len(texts) == 0:
        return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "texts must be non-empty list"})}
    if len(texts) > MAX_TEXTS:
        return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": f"too many texts max {MAX_TEXTS}"})}
    total = 0
    for t in texts:
        if not isinstance(t, str) or not t.strip():
            return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "each text must be non-empty string"})}
        if len(t) > MAX_CHARS:
            return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": f"text too long max {MAX_CHARS}"})}
        total += len(t.encode("utf-8"))
    if total > MAX_TOTAL_BYTES:
        return {"statusCode": 400, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "payload too large"})}

    try:
        model = _load_model()
        vectors = model.encode(texts, normalize_embeddings=True)
        embeddings = [list(map(float, v)) for v in vectors]
        # validate 384
        for v in embeddings:
            if len(v) != 384:
                raise ValueError(f"unexpected dimension {len(v)}")
    except Exception as e:
        logger.exception("embedding failed")
        return {"statusCode": 500, "headers": {"Content-Type": "application/json"}, "body": json.dumps({"error": "embedding failed"})}

    logger.info(json.dumps({"event": "lambda_embed", "count": len(texts), "dimension": 384}))
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"embeddings": embeddings, "dimension": 384, "count": len(embeddings)}),
    }
