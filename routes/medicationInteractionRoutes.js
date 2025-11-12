import express from "express";
import {
  checkMedicationInteractions,
  checkPrescriptionInteractions,
  checkMixedInteractions,
  getMedicationInteractions,
  addMedicationInteraction,
  removeMedicationInteraction,
  getCommonInteractions,
} from "../controllers/medicationInteractionController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All medication interaction routes are protected
router.use(protect);

// @route   POST /api/medication-interactions/check
// @desc    Check for medication interactions
// @access  Private
router.post("/check", checkMedicationInteractions);

// @route   POST /api/medication-interactions/check-prescriptions
// @desc    Check for prescription interactions
// @access  Private
router.post("/check-prescriptions", checkPrescriptionInteractions);

// @route   POST /api/medication-interactions/check-mixed
// @desc    Check for interactions between medications and prescriptions
// @access  Private
router.post("/check-mixed", checkMixedInteractions);

// @route   GET /api/medication-interactions/:medicationId
// @desc    Get interaction details for a medication
// @access  Private
router.get("/:medicationId", getMedicationInteractions);

// @route   POST /api/medication-interactions/:medicationId/interactions
// @desc    Add interaction to a medication
// @access  Private
router.post("/:medicationId/interactions", addMedicationInteraction);

// @route   DELETE /api/medication-interactions/:medicationId/interactions/:interactionId
// @desc    Remove interaction from a medication
// @access  Private
router.delete("/:medicationId/interactions/:interactionId", removeMedicationInteraction);

// @route   GET /api/medication-interactions/common
// @desc    Get common medication interactions
// @access  Public
router.get("/common", getCommonInteractions);

export default router;