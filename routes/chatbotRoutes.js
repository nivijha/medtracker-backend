import express from "express";
import { chatWithAI } from "../controllers/chatbotController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/chat", authMiddleware, chatWithAI);

export default router;