import express from "express";
import {
  getHealthTrends,
  getMedicationAdherence,
  getAppointmentStats,
  getDashboardSummary,
} from "../controllers/dataVisualizationController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All data visualization routes are protected
router.use(protect);

// @route   GET /api/visualization/health-trends
// @desc    Get health metrics trends
// @access  Private
router.get("/health-trends", getHealthTrends);

// @route   GET /api/visualization/medication-adherence
// @desc    Get medication adherence trends
// @access  Private
router.get("/medication-adherence", getMedicationAdherence);

// @route   GET /api/visualization/appointment-stats
// @desc    Get appointment statistics
// @access  Private
router.get("/appointment-stats", getAppointmentStats);

// @route   GET /api/visualization/dashboard
// @desc    Get dashboard summary
// @access  Private
router.get("/dashboard", getDashboardSummary);

export default router;