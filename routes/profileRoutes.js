import express from "express";
import {
  getProfile,
  updateProfile,
  getHealthSummary
} from "../controllers/profileController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getProfile);
router.put("/", updateProfile);
router.get("/summary", getHealthSummary);

export default router;
