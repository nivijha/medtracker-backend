import express from "express";
import {
  getAppointments,
  getUpcomingAppointments,
  getPastAppointments,
  createAppointment,
  cancelAppointment,
  deleteAppointment,
} from "../controllers/appointmentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getAppointments);
router.get("/upcoming", protect, getUpcomingAppointments);
router.get("/past", protect, getPastAppointments);

router.post("/", protect, createAppointment);
router.put("/:id/cancel", protect, cancelAppointment);
router.delete("/:id", protect, deleteAppointment);

export default router;
