import Report from "../models/Report.js";
import cloudinary from "../config/cloudinary.js";
import logger from "../utils/logger.js";
import { analyzeMedicalReport } from "../services/aiService.js";

/**
 * @desc    Upload a medical report
 * @route   POST /api/reports/upload
 * @access  Private
 */
const uploadReport = async (req, res, next) => {
  try {
    const { type, description, doctorName, reportDate } = req.body;

    logger.info(`UPLOAD_REPORT: received upload request for type=${type}, doctor=${doctorName}`);

    if (!type || !req.file) {
      logger.warn("UPLOAD_REPORT: missing required fields or file");
      return res.status(400).json({
        message: "Report type and file are required",
      });
    }

    logger.info(`UPLOAD_REPORT: file received => ${req.file.originalname}, path=${req.file.path}`);

    const report = await Report.create({
      user: req.user.id,
      type,
      fileUrl: req.file.path,
      cloudinaryId: req.file.filename,
      mimeType: req.file.mimetype,
      description,
      doctorName,
      reportDate: reportDate ? new Date(reportDate) : new Date(),
    });

    logger.info(`UPLOAD_REPORT: successfully created report record => id=${report._id}`);

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
 * @desc    Analyze a medical report using AI (Gemini Multimodal)
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

    // Use signed URL or direct download via Cloudinary SDK if possible
    // This avoids 401 issues with direct fetch
    const fetchUrl = cloudinary.url(report.cloudinaryId, { secure: true });
    
    logger.info(`ANALYZE_REPORT: fetching file from ${fetchUrl}`);
    const fileRes = await fetch(fetchUrl);
    if (!fileRes.ok) {
      throw new Error(`Failed to fetch report. Status: ${fileRes.status}`);
    }

    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get mime type from database or extension
    let mimeType = report.mimeType;
    if (!mimeType) {
      const extension = report.fileUrl.split(".").pop().toLowerCase();
      if (["jpg", "jpeg"].includes(extension)) mimeType = "image/jpeg";
      else if (extension === "png") mimeType = "image/png";
      else if (extension === "webp") mimeType = "image/webp";
      else mimeType = "application/pdf";
    }

    // Use Gemini Service for Multimodal Analysis
    const summary = await analyzeMedicalReport(buffer, mimeType);

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
    const isImage = fetchUrl.match(/\.(jpg|jpeg|png|webp)$/i);
    
    if (isImage) {
      // Use Cloudinary SDK to generate a reliable URL for the PDF conversion
      // This is more robust than manual string replacement
      fetchUrl = cloudinary.url(report.cloudinaryId, {
        fetch_format: "pdf",
        secure: true,
        // sign_url: true // Add if your assets are restricted
      });
    }

    logger.info(`STREAM_PDF: fetching from ${fetchUrl}`);
    let pdfRes = await fetch(fetchUrl);

    if (!pdfRes.ok) {
      logger.warn(`STREAM_PDF: fetch failed (${pdfRes.status}), trying signed fallback`);
      // Force a signed URL if direct access is restricted
      const signedUrl = cloudinary.url(report.cloudinaryId, {
        fetch_format: isImage ? "pdf" : undefined,
        sign_url: true,
        secure: true
      });
      pdfRes = await fetch(signedUrl);
    }

    if (!pdfRes.ok) {
      logger.error(`STREAM_PDF: failed to retrieve file even with fallback`);
      return res.status(422).json({ message: "Report retrieval failed." });
    }

    const filename = (report.description || "medical-report").replace(/[^a-z0-9]/gi, "_").toLowerCase() + ".pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const arrayBuffer = await pdfRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    logger.error("REPORT_STREAM_CRASH: " + (error.stack || error.message));
    next(error);
  }
};

export { uploadReport, getMyReports, deleteReport, analyzeReport, streamPdf };
