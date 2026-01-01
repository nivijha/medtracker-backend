import express from "express";
import {
  getProfile,
  updateProfile,
  getHealthSummary,
  changePassword,
} from "../controllers/profileController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", protect, getProfile);
router.put("/", protect, updateProfile);
router.get("/summary", protect, getHealthSummary);
router.put("/change-password", protect, changePassword);

export default router;
