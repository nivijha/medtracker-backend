import express from "express";
import protect from "../middleware/authMiddleware.js";
import { getRecentActivity } from "../controllers/activityController.js";

const router = express.Router();

router.get("/", protect, getRecentActivity);

export default router;
