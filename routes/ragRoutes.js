import express from "express";
import { indexReport, queryRagHandler, ragHealthHandler, deleteRagDocumentHandler } from "../controllers/ragController.js";
import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// All RAG routes require an authenticated user; Express forwards userId to FastAPI.
router.post("/documents/index", protect, indexReport);
router.delete("/documents/:id", protect, deleteRagDocumentHandler);
router.post("/query", protect, queryRagHandler);
router.get("/health", protect, ragHealthHandler);

export default router;
