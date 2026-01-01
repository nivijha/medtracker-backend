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

router.get("/", getProfile);
router.put("/", updateProfile);
router.get("/summary", getHealthSummary);
router.put("/change-password", changePassword);

export default router;
