import logger from "../utils/logger.js";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL;
const RAG_SERVICE_SECRET = process.env.RAG_SERVICE_SECRET || "";
const RAG_TIMEOUT_MS = 50000;
const RAG_MAX_RETRIES = parseInt(process.env.RAG_MAX_RETRIES || "3", 10);
const RAG_RETRY_DELAY_MS = parseInt(process.env.RAG_RETRY_DELAY_MS || "5000", 10);
const RAG_RETRY_MAX_DELAY_MS = parseInt(process.env.RAG_RETRY_MAX_DELAY_MS || "30000", 10);

function parseRetryAfterMs(headerValue) {
  if (!headerValue) return null;
  const secs = parseInt(String(headerValue).trim(), 10);
  if (!Number.isNaN(secs) && secs >= 0 && secs <= 120) return secs * 1000;
  const dateMs = Date.parse(String(headerValue).trim());
  if (!Number.isNaN(dateMs)) {
    const delta = dateMs - Date.now();
    if (delta > 0 && delta <= 120000) return delta;
  }
  return null;
}

function isRetryableStatus(status) {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function computeBackoffMs(attempt, retryAfterMs) {
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, 5000), RAG_RETRY_MAX_DELAY_MS);
  }
  const exp = RAG_RETRY_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 1000);
  return Math.min(exp + jitter, RAG_RETRY_MAX_DELAY_MS);
}

async function ragPost(path, body, userId) {
  if (!RAG_SERVICE_URL) {
    return { ok: false, skipped: "RAG_SERVICE_URL not configured" };
  }

  const maxAttempts = Math.max(1, RAG_MAX_RETRIES);
  const tStart = Date.now();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isLastAttempt = attempt === maxAttempts - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RAG_TIMEOUT_MS);
    try {
      const headers = {
        "Content-Type": "application/json",
        "X-Rag-Service-Secret": RAG_SERVICE_SECRET,
      };
      if (userId) headers["X-User-Id"] = userId;

      const res = await fetch(`${RAG_SERVICE_URL}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const status = res.status;
        const retryAfter = res.headers.get("retry-after");
        if (!isRetryableStatus(status) || isLastAttempt) {
          const text = await res.text().catch(() => "");
          const err = new Error(`RAG ${path} responded ${status}: ${text.slice(0, 200)}`);
          err.status = status;
          err.retryAfter = retryAfter;
          err.ragUnavailable = isRetryableStatus(status);
          throw err;
        }
        const retryAfterMs = parseRetryAfterMs(retryAfter);
        const delayMs = computeBackoffMs(attempt, retryAfterMs);
        const elapsedMs = Date.now() - tStart;
        logger.warn(JSON.stringify({ event: "rag_retry", path, attempt: attempt + 1, maxAttempts, status, retryAfter: retryAfter || null, delayMs, elapsedMs }));
        clearTimeout(timer);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      return { ok: true, data: await res.json() };
    } catch (err) {
      const isAbort = err.name === "AbortError";
      const status = err.status;
      const isRetryable = isAbort || (status && isRetryableStatus(status));

      if (err.ragUnavailable !== undefined) throw err;

      if (!isRetryable || isLastAttempt) {
        if (isAbort) throw new Error(`RAG ${path} timed out`);
        throw err;
      }

      const retryAfterMs = parseRetryAfterMs(err.retryAfter || null);
      const delayMs = computeBackoffMs(attempt, retryAfterMs);
      const elapsedMs = Date.now() - tStart;
      if (isAbort) {
        logger.warn(JSON.stringify({ event: "rag_retry", path, attempt: attempt + 1, maxAttempts, status: "timeout", retryAfter: null, delayMs, elapsedMs }));
      } else {
        logger.warn(JSON.stringify({ event: "rag_retry", path, attempt: attempt + 1, maxAttempts, status, retryAfter: err.retryAfter || null, delayMs, elapsedMs }));
      }
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("RAG request failed after retry");
}

export const indexDocument = async ({ userId, documentId, type, reportDate, sourceFilename, text }) => {
  try {
    return await ragPost("/rag/documents/index", {
      userId,
      documentId,
      type,
      reportDate,
      sourceFilename,
      text,
    }, userId);
  } catch (err) {
    logger.warn(`RAG_INDEX_FAILED: ${err.message}`);
    return { ok: false, error: err.message, ragUnavailable: !!err.ragUnavailable };
  }
};

export const queryRag = async ({ userId, query, filters, conversationId }) => {
  const res = await ragPost("/rag/query", { userId, query, filters, conversationId }, userId);
  if (!res.ok) throw new Error(res.error || res.skipped || "RAG query failed");
  return res.data;
};

export const deleteRagDocument = async ({ userId, documentId }) => {
  try {
    return await ragPost("/rag/documents/delete", { userId, documentId }, userId);
  } catch (err) {
    logger.warn(`RAG_DELETE_FAILED: ${err.message}`);
    return { ok: false, error: err.message };
  }
};

export const ragHealth = async () => {
  if (!RAG_SERVICE_URL) return { ok: false, skipped: "RAG_SERVICE_URL not configured" };
  try {
    const res = await fetch(`${RAG_SERVICE_URL}/rag/health`, {
      headers: { "X-Rag-Service-Secret": RAG_SERVICE_SECRET },
    });
    if (!res.ok) throw new Error(`RAG health ${res.status}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
};
