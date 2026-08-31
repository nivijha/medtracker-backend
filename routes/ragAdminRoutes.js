import express from "express";
import protect from "../middleware/authMiddleware.js";
import { reindexNoisy } from "../controllers/ragAdminController.js";

const router = express.Router();

router.post("/reindex-noisy", protect, reindexNoisy);

export default router;
