import express from "express";
import {
  getProfile,
  updateProfile,
  getProfileSummary
} from "../controllers/profileController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/", getProfile);
router.put("/", updateProfile);
router.get("/summary", getProfileSummary);

export default router;
