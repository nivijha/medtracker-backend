import express from "express";
import {
  getPrescriptions,
  getPrescriptionById,
  createPrescription,
  updatePrescription,
  deletePrescription,
  getActivePrescriptions,
  getPrescriptionsNeedingRefill,
  processRefill,
  checkPrescriptionInteractions,
  transferPrescription,
} from "../controllers/prescriptionController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All prescription routes are protected
router.use(protect);

// @route   GET /api/prescriptions
// @desc    Get all prescriptions for a user
// @access  Private
router.get("/", getPrescriptions);

// @route   GET /api/prescriptions/active
// @desc    Get active prescriptions
// @access  Private
router.get("/active", getActivePrescriptions);

// @route   GET /api/prescriptions/refill-needed
// @desc    Get prescriptions needing refill
// @access  Private
router.get("/refill-needed", getPrescriptionsNeedingRefill);

// @route   POST /api/prescriptions/check-interactions
// @desc    Get prescription interactions
// @access  Private
router.post("/check-interactions", checkPrescriptionInteractions);

// @route   GET /api/prescriptions/:id
// @desc    Get single prescription
// @access  Private
router.get("/:id", getPrescriptionById);

// @route   POST /api/prescriptions
// @desc    Create a new prescription
// @access  Private
router.post("/", createPrescription);

// @route   PUT /api/prescriptions/:id
// @desc    Update a prescription
// @access  Private
router.put("/:id", updatePrescription);

// @route   POST /api/prescriptions/:id/refill
// @desc    Process prescription refill
// @access  Private
router.post("/:id/refill", processRefill);

// @route   POST /api/prescriptions/:id/transfer
// @desc    Transfer prescription
// @access  Private
router.post("/:id/transfer", transferPrescription);

// @route   DELETE /api/prescriptions/:id
// @desc    Delete a prescription
// @access  Private
router.delete("/:id", deletePrescription);

export default router;