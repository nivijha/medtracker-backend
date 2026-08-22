import Report from "../models/Report.js";
import { extractTextFromPdf, isPdfBuffer } from "../services/pdfExtractionService.js";
import { indexDocument, ragHealth, queryRag, deleteRagDocument } from "../services/ragClient.js";
import logger from "../utils/logger.js";

/**
 * Fetch a report's PDF from its Cloudinary URL, extract text, and index it into
 * the RAG service. Resilient: failures are logged, not thrown.
 */
export const indexReportById = async (reportId, userId) => {
  try {
    const report = await Report.findById(reportId);
    if (!report || report.user.toString() !== userId) return;

    const pdfRes = await fetch(report.fileUrl);
    if (!pdfRes.ok) {
      logger.warn(`RAG_INDEX_SKIP: could not fetch PDF for ${reportId} (${pdfRes.status})`);
      return;
    }
    const buffer = Buffer.from(await pdfRes.arrayBuffer());
    if (!isPdfBuffer(buffer)) {
      logger.warn(`RAG_INDEX_SKIP: not a PDF for ${reportId}`);
      return;
    }
    const text = await extractTextFromPdf(buffer);
    if (!text || !text.trim()) {
      logger.warn(`RAG_INDEX_SKIP: empty text for ${reportId}`);
      return;
    }
    await indexDocument({
      userId: report.user.toString(),
      documentId: report._id.toString(),
      type: report.type,
      reportDate: report.reportDate ? report.reportDate.toISOString().split("T")[0] : null,
      sourceFilename: report.cloudinaryId || report._id.toString(),
      text,
    });
  } catch (err) {
    logger.warn(`RAG_INDEX_FAILED: ${err.message}`);
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
    await indexReportById(reportId, req.user.id);
    res.json({ message: "Indexing triggered", reportId });
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
    // Verify ownership via the Report before delegating deletion.
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
