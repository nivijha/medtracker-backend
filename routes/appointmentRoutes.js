import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createAppointment,
  getAppointments,
  updateAppointment,
  cancelAppointment,
  deleteAppointment
} from "../controllers/appointmentController.js";

const router = express.Router();

router.use(protect);

router.post("/", createAppointment);
router.get("/", getAppointments);
router.put("/:id", updateAppointment);
router.put("/:id/cancel", cancelAppointment);
router.delete("/:id", deleteAppointment);

export default router;
