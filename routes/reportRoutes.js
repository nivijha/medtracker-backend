import express from "express";
import {
  uploadReport,
  getMyReports,
  deleteReport,
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

export default router;
