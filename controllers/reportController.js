import Report from "../models/Report.js";
import cloudinary from "../config/cloudinary.js";
import logger from "../utils/logger.js";
import { generateReportSummary } from "../services/reportSummaryService.js";
import { extractTextFromPdf, isPdfBuffer } from "../services/pdfExtractionService.js";
import { extractReportDateFromBuffer } from "../services/reportMetaExtractionService.js";
import {
  getSummaryFromRedis,
  setSummaryInRedis,
  deleteSummaryFromRedis,
} from "../services/summaryCacheService.js";

/**
 * Fetch a report file from Cloudinary, trying both raw/upload and image/upload
 * URL variants. Older reports may have been stored under either resource type.
 */
const fetchReportFile = async (fileUrl) => {
  const urlsToTry = [fileUrl];

  if (fileUrl.includes("/raw/upload/")) {
    urlsToTry.push(fileUrl.replace("/raw/upload/", "/image/upload/"));
  } else if (fileUrl.includes("/image/upload/")) {
    urlsToTry.push(fileUrl.replace("/image/upload/", "/raw/upload/"));
  }

  for (const url of urlsToTry) {
    let pdfRes;
    try {
      pdfRes = await fetch(url);
    } catch (err) {
      logger.warn(`FETCH_REPORT_FILE: network error fetching ${url}: ${err.message}`);
      continue;
    }

    logger.info(`FETCH_REPORT_FILE: fetched ${url} => ${pdfRes.status}`);

    if (pdfRes.ok) {
      return pdfRes;
    }
  }

  return null;
};

const sanitizeFilename = (name) =>
  (name || "report.pdf").replace(/[^\w.\- ]+/g, "_").replace(/"/g, "");

/**
 * @desc    Upload a medical report
 * @route   POST /api/reports/upload
 * @access  Private
 */
const uploadReport = async (req, res, next) => {
  try {
    const { type, description, doctorName, title } = req.body;

    if (!type || !req.file) {
      return res.status(400).json({
        message: "Report type and file are required",
      });
    }

    let reportTitle = (title || "").trim() || null;
    let reportDescription = (description || "").trim() || null;
    if (!reportTitle && reportDescription && reportDescription.includes(":::")) {
      const idx = reportDescription.indexOf(":::");
      reportTitle = reportDescription.slice(0, idx).trim() || null;
      reportDescription = reportDescription.slice(idx + 3).trim() || null;
    }

    let reportDate = new Date();
    try {
      const pdfRes = await fetch(req.file.path);
      if (pdfRes.ok) {
        const buf = Buffer.from(await pdfRes.arrayBuffer());
        const extracted = await extractReportDateFromBuffer(buf);
        if (extracted) reportDate = extracted;
      }
    } catch (err) {
      logger.warn(`REPORT_DATE_EXTRACT_WARN: ${err.message}`);
    }

    const report = await Report.create({
      user: req.user.id,
      type,
      title: reportTitle,
      fileUrl: req.file.path,
      cloudinaryId: req.file.filename,
      originalFilename: req.file.originalname,
      description: reportDescription,
      doctorName: doctorName ? doctorName.trim() : undefined,
      reportDate,
    });

    res.status(201).json({
      message: "Report uploaded successfully",
      report,
    });
  } catch (error) {
    logger.error("REPORT_UPLOAD_CRASH: " + (error.stack || error.message || JSON.stringify(error)));
    next(error);
  }
};

/**
 * @desc    Get logged-in user's reports
 * @route   GET /api/reports/my
 * @access  Private
 */
const getMyReports = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Report.countDocuments({ user: req.user.id });
    const reports = await Report.find({ user: req.user.id })
      .populate("user", "name email")
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limit);

    res.json({
      reports,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a report
 * @route   DELETE /api/reports/:id
 * @access  Private
 */
const deleteReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (report.cloudinaryId) {
      const isRaw = report.fileUrl && report.fileUrl.includes("/raw/upload/");
      const opts = isRaw ? { resource_type: "raw" } : report.fileUrl && report.fileUrl.includes("/image/upload/") ? { resource_type: "image" } : {};
      try {
        await cloudinary.uploader.destroy(report.cloudinaryId, opts);
      } catch (err) {
        logger.warn(`CLOUDINARY_DESTROY_WARN: ${err.message}`);
      }
    }

    // DELETE FROM DB
    await report.deleteOne();

    // Invalidate cached summary so no stale data is served
    await deleteSummaryFromRedis(report._id.toString());

    res.json({ message: "Report deleted successfully" });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Analyze a medical report using AI
 * @route   GET /api/reports/:id/analyze
 * @access  Private
 */
const analyzeReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // 1. Redis hot cache
    const cachedSummary = await getSummaryFromRedis(report._id.toString());
    if (cachedSummary) {
      return res.json({ summary: cachedSummary, cached: true });
    }

    // 2. MongoDB source of truth
    if (report.summary) {
      await setSummaryInRedis(report._id.toString(), report.summary);
      return res.json({ summary: report.summary, cached: true });
    }

    // 3. Generate once, persist to both stores
    const pdfRes = await fetchReportFile(report.fileUrl);
    if (!pdfRes) {
      throw new Error(`Failed to fetch PDF from any known URL variant (${report.fileUrl}).`);
    }

    const arrayBuffer = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify it's actually a PDF using the magic string %PDF
    if (!isPdfBuffer(buffer)) {
      return res.status(400).json({ message: "The selected file is not a valid PDF document and cannot be analyzed." });
    }

    // Parse text from the PDF Buffer
    const pdfText = await extractTextFromPdf(buffer);

    if (!pdfText || pdfText.trim().length === 0) {
      return res.status(400).json({ message: "Could not extract any readable text from this PDF." });
    }

    // Pass text to the AI summary service (LLaMA with Gemini fallback)
    const summary = await generateReportSummary(pdfText);

    report.summary = summary;
    report.summaryGeneratedAt = new Date();
    await report.save();

    await setSummaryInRedis(report._id.toString(), summary);

    res.json({ summary, cached: false });
  } catch (error) {
    logger.error("REPORT_ANALYZE_CRASH: " + (error.stack || error.message || JSON.stringify(error)));
    next(error);
  }
};

/**
 * @desc    Stream a PDF report file from Cloudinary via the backend
 * @route   GET /api/reports/:id/pdf
 * @access  Private
 */
const streamPdf = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const pdfRes = await fetchReportFile(report.fileUrl);

    if (!pdfRes) {
      logger.warn(`STREAM_PDF: could not fetch PDF from any URL variant, url=${report.fileUrl}`);
      return res.status(422).json({
        message: "This report cannot be previewed. It may have been uploaded in an older format.",
        cannotPreview: true,
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline");

    const arrayBuffer = await pdfRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    logger.error("REPORT_STREAM_CRASH: " + (error.stack || error.message));
    next(error);
  }
};

/**
 * @desc    Download a PDF report file with Content-Disposition: attachment
 * @route   GET /api/reports/:id/download
 * @access  Private
 */
const downloadReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const pdfRes = await fetchReportFile(report.fileUrl);

    if (!pdfRes) {
      logger.warn(`DOWNLOAD_REPORT: could not fetch file from any URL variant, url=${report.fileUrl}`);
      return res.status(422).json({
        message: "This report cannot be downloaded. It may have been uploaded in an older format.",
        cannotDownload: true,
      });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${sanitizeFilename(report.originalFilename)}"`
    );

    const arrayBuffer = await pdfRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    logger.error("REPORT_DOWNLOAD_CRASH: " + (error.stack || error.message));
    next(error);
  }
};

export { uploadReport, getMyReports, deleteReport, analyzeReport, streamPdf, downloadReport };