import logger from "../utils/logger.js";

const RAG_SERVICE_URL = process.env.RAG_SERVICE_URL;
const RAG_SERVICE_SECRET = process.env.RAG_SERVICE_SECRET || "";

async function ragPost(path, body, userId) {
  if (!RAG_SERVICE_URL) {
    return { ok: false, skipped: "RAG_SERVICE_URL not configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
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
      throw new Error(`RAG ${path} responded ${res.status}: ${text.slice(0, 200)}`);
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`RAG ${path} timed out`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Index a document into the RAG service. Never throws — RAG indexing failures
 * must not break the core upload/report flow (recoverable via backfill).
 */
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
  if (!res.ok) throw new Error(res.error || "RAG query failed");
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
