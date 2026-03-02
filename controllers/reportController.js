import Report from "../models/Report.js";
import cloudinary from "../config/cloudinary.js";
import logger from "../utils/logger.js";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
import { generateReportSummary } from "../config/llama_summary.js";

/**
 * @desc    Upload a medical report
 * @route   POST /api/reports/upload
 * @access  Private
 */
const uploadReport = async (req, res, next) => {
  try {
    const { type, description, doctorName, reportDate } = req.body;

    if (!type || !req.file) {
      return res.status(400).json({
        message: "Report type and file are required",
      });
    }

    const report = await Report.create({
      user: req.user.id,
      type,
      fileUrl: req.file.path,
      cloudinaryId: req.file.filename,
      description,
      doctorName,
      reportDate: reportDate ? new Date(reportDate) : new Date(),
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

    // DELETE FROM CLOUDINARY
    if (report.cloudinaryId) {
      await cloudinary.uploader.destroy(report.cloudinaryId);
    }

    // DELETE FROM DB
    await report.deleteOne();

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

    // Fetch the PDF from Cloudinary URL
    const pdfRes = await fetch(report.fileUrl);
    if (!pdfRes.ok) {
      let errorBody = "";
      try { errorBody = await pdfRes.text(); } catch(e) {}
      throw new Error(`Failed to fetch PDF (${report.fileUrl}). Status: ${pdfRes.status} ${pdfRes.statusText}. Body: ${errorBody}`);
    }

    const arrayBuffer = await pdfRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Verify it's actually a PDF using the magic string %PDF
    if (buffer.length < 4 || buffer.slice(0, 4).toString() !== "%PDF") {
      return res.status(400).json({ message: "The selected file is not a valid PDF document and cannot be analyzed." });
    }

    // Parse text from the PDF Buffer
    const parser = new pdfParse.PDFParse({ data: buffer });
    const pdfData = await parser.getText();
    await parser.destroy();
    
    if (!pdfData.text || pdfData.text.trim().length === 0) {
      return res.status(400).json({ message: "Could not extract any readable text from this PDF." });
    }

    // Pass text to HuggingFace LLaMA
    const summary = await generateReportSummary(pdfData.text);

    res.json({ summary });
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

    let fetchUrl = report.fileUrl;
    let pdfRes = await fetch(fetchUrl);

    logger.info(`STREAM_PDF: fetched ${fetchUrl} => ${pdfRes.status}`);

    // Fallback: old reports used image/upload — try raw/upload instead
    if (!pdfRes.ok && fetchUrl.includes("/image/upload/")) {
      fetchUrl = fetchUrl.replace("/image/upload/", "/raw/upload/");
      pdfRes = await fetch(fetchUrl);
      logger.info(`STREAM_PDF fallback: fetched ${fetchUrl} => ${pdfRes.status}`);
    }

    if (!pdfRes.ok) {
      logger.warn(`STREAM_PDF: could not fetch PDF, status=${pdfRes.status}, url=${fetchUrl}`);
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

export { uploadReport, getMyReports, deleteReport, analyzeReport, streamPdf };
