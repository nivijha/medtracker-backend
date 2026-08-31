import express from "express";
import { reindexNoisy } from "../controllers/ragAdminController.js";

const router = express.Router();

function requireRagSecret(req, res, next) {
  const secret = process.env.RAG_SERVICE_SECRET;
  if (secret && req.headers["x-rag-service-secret"] !== secret) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

router.post("/reindex-noisy", requireRagSecret, reindexNoisy);

export default router;
