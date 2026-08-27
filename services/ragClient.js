import logger from "../utils/logger.js";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL;
const RAG_SERVICE_SECRET = process.env.RAG_SERVICE_SECRET || "";
const RAG_TIMEOUT_MS = 50000;
const RAG_RETRY_DELAY_MS = parseInt(process.env.RAG_RETRY_DELAY_MS || "8000", 10);

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
  return status === 429 || (status >= 500 && status <= 599);
}

async function ragPost(path, body, userId) {
  if (!RAG_SERVICE_URL) {
    return { ok: false, skipped: "RAG_SERVICE_URL not configured" };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
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
        const text = await res.text().catch(() => "");
        const err = new Error(`RAG ${path} responded ${res.status}: ${text.slice(0, 200)}`);
        err.status = res.status;
        err.retryAfter = res.headers.get("retry-after");
        throw err;
      }
      return { ok: true, data: await res.json() };
    } catch (err) {
      const isAbort = err.name === "AbortError";
      const status = err.status;
      const shouldRetry = attempt === 0 && (isAbort || (status && isRetryableStatus(status)));

      if (isAbort) {
        if (shouldRetry) {
          logger.warn(`RAG ${path} timed out (attempt ${attempt + 1}/2), retrying in ${RAG_RETRY_DELAY_MS}ms`);
          clearTimeout(timer);
          await new Promise((r) => setTimeout(r, RAG_RETRY_DELAY_MS));
          continue;
        }
        throw new Error(`RAG ${path} timed out`);
      }

      if (shouldRetry) {
        const delayMs = parseRetryAfterMs(err.retryAfter) ?? RAG_RETRY_DELAY_MS;
        logger.warn(`RAG ${path} responded ${status} (attempt ${attempt + 1}/2), retrying in ${delayMs}ms`);
        clearTimeout(timer);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }

      throw err;
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
    return { ok: false, error: err.message };
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
