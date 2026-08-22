import express from "express";
import { generate } from "../controllers/aiController.js";

const router = express.Router();

// Internal-only: requires RAG_SERVICE_SECRET when configured. Reachable only on
// the private Docker network; never exposed through ingress (ADR-026).
function requireRagSecret(req, res, next) {
  const secret = process.env.RAG_SERVICE_SECRET;
  if (secret && req.headers["x-rag-service-secret"] !== secret) {
    return res.status(403).json({ message: "Forbidden" });
  }
  next();
}

router.post("/generate", requireRagSecret, generate);

export default router;
