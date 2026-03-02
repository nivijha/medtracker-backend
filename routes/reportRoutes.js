import express from "express";
import {
  uploadReport,
  getMyReports,
  deleteReport,
  analyzeReport,
  streamPdf,
} from "../controllers/reportController.js";
import protect from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router();

/**
 * @route   POST /api/reports/upload
 * @desc    Upload a medical report (patient only)
 * @access  Private
 */
router.post(
  "/upload",
  protect,
  upload.single("file"), // key must be "file"
  uploadReport
);

/**
 * @route   GET /api/reports/my
 * @desc    Get logged-in user's reports
 * @access  Private
 */
router.get("/my", protect, getMyReports);

/**
 * @route   DELETE /api/reports/:id
 * @desc    Delete a report (owner only)
 * @access  Private
 */
router.delete("/:id", protect, deleteReport);

/**
 * @route   GET /api/reports/:id/analyze
 * @desc    Analyze a report using AI summary
 * @access  Private
 */
router.get("/:id/analyze", protect, analyzeReport);

/**
 * @route   GET /api/reports/:id/pdf
 * @desc    Stream a PDF from Cloudinary via the backend (avoids CORS/auth issues)
 * @access  Private
 */
router.get("/:id/pdf", protect, streamPdf);

export default router;
