import express from "express";
import protect from "../middleware/authMiddleware.js";
import {
  createMedication,
  getMedications,
  deleteMedication,
  markMedicationAsTaken,
  getMedicationSchedule,
  processRefill,
} from "../controllers/medicationController.js";

const router = express.Router();

router.use(protect);

router.post("/", createMedication);
router.get("/", getMedications);
router.get("/schedule", getMedicationSchedule);
router.post("/:id/take", markMedicationAsTaken);
router.post("/:id/refill", processRefill);
router.delete("/:id", deleteMedication);

export default router;
