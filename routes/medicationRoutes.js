import express from "express";
import {
  getMedications,
  getMedicationById,
  createMedication,
  updateMedication,
  deleteMedication,
  getMedicationsNeedingRefill,
  getTodayMedicationSchedule,
  markMedicationAsTaken,
  checkMedicationInteractions,
  getMedicationAdherence,
} from "../controllers/medicationController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All medication routes are protected
router.use(protect);

// @route   GET /api/medications
// @desc    Get all medications for a user
// @access  Private
router.get("/", getMedications);

// @route   GET /api/medications/refill-soon
// @desc    Get medications that need refill soon
// @access  Private
router.get("/refill-soon", getMedicationsNeedingRefill);

// @route   GET /api/medications/schedule
// @desc    Get today's medication schedule
// @access  Private
router.get("/schedule", getTodayMedicationSchedule);

// @route   GET /api/medications/adherence
// @desc    Get medication adherence statistics
// @access  Private
router.get("/adherence", getMedicationAdherence);

// @route   POST /api/medications/check-interactions
// @desc    Check for medication interactions
// @access  Private
router.post("/check-interactions", checkMedicationInteractions);

// @route   GET /api/medications/:id
// @desc    Get single medication
// @access  Private
router.get("/:id", getMedicationById);

// @route   POST /api/medications/:id/take
// @desc    Mark medication as taken
// @access  Private
router.post("/:id/take", markMedicationAsTaken);

// @route   PUT /api/medications/:id
// @desc    Update a medication
// @access  Private
router.put("/:id", updateMedication);

// @route   DELETE /api/medications/:id
// @desc    Delete a medication
// @access  Private
router.delete("/:id", deleteMedication);

export default router;