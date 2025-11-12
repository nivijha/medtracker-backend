import express from "express";
import {
  getHealthMetrics,
  getHealthMetricById,
  createHealthMetric,
  updateHealthMetric,
  deleteHealthMetric,
  getHealthMetricsSummary,
  getHealthTrends,
  getBMIHistory,
} from "../controllers/healthMetricsController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All health metrics routes are protected
router.use(protect);

// @route   GET /api/health-metrics
// @desc    Get all health metrics for a user
// @access  Private
router.get("/", getHealthMetrics);

// @route   GET /api/health-metrics/summary
// @desc    Get health metrics summary
// @access  Private
router.get("/summary", getHealthMetricsSummary);

// @route   GET /api/health-metrics/trends
// @desc    Get health trends
// @access  Private
router.get("/trends", getHealthTrends);

// @route   GET /api/health-metrics/bmi
// @desc    Get BMI history
// @access  Private
router.get("/bmi", getBMIHistory);

// @route   GET /api/health-metrics/:id
// @desc    Get single health metric entry
// @access  Private
router.get("/:id", getHealthMetricById);

// @route   POST /api/health-metrics
// @desc    Create a new health metric entry
// @access  Private
router.post("/", createHealthMetric);

// @route   PUT /api/health-metrics/:id
// @desc    Update a health metric entry
// @access  Private
router.put("/:id", updateHealthMetric);

// @route   DELETE /api/health-metrics/:id
// @desc    Delete a health metric entry
// @access  Private
router.delete("/:id", deleteHealthMetric);

export default router;