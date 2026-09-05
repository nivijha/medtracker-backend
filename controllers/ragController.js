import Report from "../models/Report.js";
import { extractTextFromPdf, isPdfBuffer } from "../services/pdfExtractionService.js";
import { indexDocument, ragHealth, queryRag, deleteRagDocument } from "../services/ragClient.js";
import logger from "../utils/logger.js";

const sanitizeError = (msg) => {
  if (!msg) return "unknown error";
  return String(msg).slice(0, 200).replace(/https?:\/\/\S+/g, "[url]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
};

async function fetchReportFileDual(fileUrl) {
  const urlsToTry = [fileUrl];
  if (fileUrl.includes("/raw/upload/")) urlsToTry.push(fileUrl.replace("/raw/upload/", "/image/upload/"));
  else if (fileUrl.includes("/image/upload/")) urlsToTry.push(fileUrl.replace("/image/upload/", "/raw/upload/"));
  let firstStatus = null;
  for (let i = 0; i < urlsToTry.length; i++) {
    const url = urlsToTry[i];
    try {
      const res = await fetch(url);
      if (res.ok) {
        if (i > 0) logger.info(JSON.stringify({ event: "rag_index_url_fallback", document_id: "[redacted]", fallback: true, attempt: i + 1 }));
        return res;
      }
      if (firstStatus === null) firstStatus = res.status;
      logger.info(JSON.stringify({ event: "rag_index_url_fallback", attempt: i + 1, status: res.status, fallback: i > 0 }));
    } catch (err) {
      if (firstStatus === null) firstStatus = "network_error";
      logger.warn(JSON.stringify({ event: "rag_index_url_fallback", attempt: i + 1, error_type: "network_error", fallback: i > 0 }));
    }
  }
  return { ok: false, status: firstStatus || 404 };
}

export const indexReportById = async (reportId, userId) => {
  const t0 = Date.now();
  const docId = reportId.toString();
  logger.info(JSON.stringify({ event: "rag_index_started", document_id: docId }));
  try {
    const report = await Report.findById(reportId);
    if (!report || report.user.toString() !== userId) return;

    await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "PENDING", ragIndexError: null } });

    const pdfRes = await fetchReportFileDual(report.fileUrl);
    if (!pdfRes.ok) {
      const errMsg = `PDF fetch failed status=${pdfRes.status}`;
      await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "FAILED", ragIndexError: sanitizeError(errMsg) } });
      logger.warn(JSON.stringify({ event: "rag_index_failed", document_id: docId, error_type: "pdf_fetch_failed", status: pdfRes.status, latency_ms: Date.now() - t0 }));
      return;
    }
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    if (!isPdfBuffer(buffer)) {
      await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "FAILED", ragIndexError: "not a PDF" } });
      logger.warn(JSON.stringify({ event: "rag_index_failed", document_id: docId, error_type: "not_pdf", latency_ms: Date.now() - t0 }));
      return;
    }
    const text = await extractTextFromPdf(buffer);
    if (!text || !text.trim()) {
      await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "FAILED", ragIndexError: "empty text" } });
      logger.warn(JSON.stringify({ event: "rag_index_failed", document_id: docId, error_type: "empty_text", latency_ms: Date.now() - t0 }));
      return;
    }
    const res = await indexDocument({
      userId: report.user.toString(),
      documentId: report._id.toString(),
      type: report.type,
      reportDate: report.reportDate ? report.reportDate.toISOString().split("T")[0] : null,
      sourceFilename: report.cloudinaryId || report._id.toString(),
      text,
    });
    if (!res || res.ok === false) {
      const errMsg = sanitizeError(res?.error || "indexing failed");
      await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "FAILED", ragIndexError: errMsg } });
      logger.warn(JSON.stringify({ event: "rag_index_failed", document_id: docId, error_type: "index_failed", error: errMsg.slice(0, 100), latency_ms: Date.now() - t0 }));
      return;
    }
    const chunkCount = res.data?.chunkCount ?? null;
    await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "INDEXED", ragIndexError: null } });
    logger.info(JSON.stringify({ event: "rag_index_success", document_id: docId, chunk_count: chunkCount, latency_ms: Date.now() - t0 }));
  } catch (err) {
    const errMsg = sanitizeError(err.message);
    try {
      await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "FAILED", ragIndexError: errMsg } });
    } catch (_) {}
    logger.warn(JSON.stringify({ event: "rag_index_failed", document_id: docId, error_type: "exception", error: errMsg.slice(0, 100), latency_ms: Date.now() - t0 }));
  }
};

export const indexReport = async (req, res, next) => {
  try {
    const { reportId } = req.body;
    if (!reportId) return res.status(400).json({ message: "reportId is required" });
    const report = await Report.findById(reportId);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await Report.updateOne({ _id: reportId }, { $set: { ragIndexed: "PENDING", ragIndexError: null } });
    await indexReportById(reportId, req.user.id);
    const updated = await Report.findById(reportId).lean();
    res.json({ message: "Indexing triggered", reportId, ragIndexed: updated?.ragIndexed || "PENDING" });
  } catch (err) {
    next(err);
  }
};

export const queryRagHandler = async (req, res, next) => {
  try {
    const { query, filters, conversationId } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ message: "query is required" });
    }
    const data = await queryRag({ userId: req.user.id, query, filters, conversationId });
    res.json(data);
  } catch (err) {
    logger.error(`RAG_QUERY_FAILED: ${err.message}`);
    next(err);
  }
};

export const ragHealthHandler = async (req, res) => {
  const health = await ragHealth();
  res.json(health);
};

export const deleteRagDocumentHandler = async (req, res, next) => {
  try {
    const { id } = req.params;
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ message: "Report not found" });
    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }
    const result = await deleteRagDocument({ userId: req.user.id, documentId: id });
    res.json({ message: "RAG delete triggered", result });
  } catch (err) {
    next(err);
  }
};
