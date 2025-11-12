import express from "express";
import {
  exportUserData,
  getExportHistory,
} from "../controllers/dataExportController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All data export routes are protected
router.use(protect);

// @route   POST /api/export
// @desc    Export user data
// @access  Private
router.post("/", exportUserData);

// @route   GET /api/export/history
// @desc    Get export history
// @access  Private
router.get("/history", getExportHistory);

export default router;