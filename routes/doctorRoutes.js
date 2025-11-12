import express from "express";
import {
  getDoctors,
  getDoctorById,
  createDoctor,
  updateDoctor,
  deleteDoctor,
  verifyDoctor,
  getDoctorAvailability,
  addDoctorReview,
  getSpecialties,
  getTopRatedDoctors,
} from "../controllers/doctorController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes (no authentication required)
router.get("/", getDoctors);
router.get("/specialties", getSpecialties);
router.get("/top-rated", getTopRatedDoctors);
router.get("/:id", getDoctorById);
router.get("/:id/availability", getDoctorAvailability);

// Protected routes (authentication required)
router.use(protect);

// @route   POST /api/doctors/:id/reviews
// @desc    Add review for a doctor
// @access  Private
router.post("/:id/reviews", addDoctorReview);

// Admin-only routes
// @route   POST /api/doctors
// @desc    Create a new doctor
// @access  Private (Admin only)
router.post("/", createDoctor);

// @route   PUT /api/doctors/:id
// @desc    Update a doctor
// @access  Private (Admin or Doctor)
router.put("/:id", updateDoctor);

// @route   DELETE /api/doctors/:id
// @desc    Delete a doctor
// @access  Private (Admin only)
router.delete("/:id", deleteDoctor);

// @route   PUT /api/doctors/:id/verify
// @desc    Verify a doctor
// @access  Private (Admin only)
router.put("/:id/verify", verifyDoctor);

export default router;