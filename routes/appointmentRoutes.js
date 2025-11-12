import express from "express";
import {
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  deleteAppointment,
  getUpcomingAppointments,
  getPastAppointments,
  getAvailableSlots,
  rescheduleAppointment,
} from "../controllers/appointmentController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All appointment routes are protected
router.use(protect);

// @route   GET /api/appointments
// @desc    Get all appointments for a user
// @access  Private
router.get("/", getAppointments);

// @route   GET /api/appointments/upcoming
// @desc    Get upcoming appointments
// @access  Private
router.get("/upcoming", getUpcomingAppointments);

// @route   GET /api/appointments/past
// @desc    Get past appointments
// @access  Private
router.get("/past", getPastAppointments);

// @route   GET /api/appointments/available-slots
// @desc    Get available time slots for a doctor
// @access  Private
router.get("/available-slots", getAvailableSlots);

// @route   GET /api/appointments/:id
// @desc    Get single appointment
// @access  Private
router.get("/:id", getAppointmentById);

// @route   POST /api/appointments
// @desc    Create a new appointment
// @access  Private
router.post("/", createAppointment);

// @route   PUT /api/appointments/:id
// @desc    Update an appointment
// @access  Private
router.put("/:id", updateAppointment);

// @route   PUT /api/appointments/:id/cancel
// @desc    Cancel an appointment
// @access  Private
router.put("/:id/cancel", cancelAppointment);

// @route   PUT /api/appointments/:id/reschedule
// @desc    Reschedule an appointment
// @access  Private
router.put("/:id/reschedule", rescheduleAppointment);

// @route   DELETE /api/appointments/:id
// @desc    Delete an appointment
// @access  Private
router.delete("/:id", deleteAppointment);

export default router;