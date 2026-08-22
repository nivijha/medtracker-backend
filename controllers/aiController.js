import { generateText } from "../services/llmGenerationService.js";

/**
 * Internal generation endpoint used by the FastAPI RAG service.
 * Auth: RAG_SERVICE_SECRET header (set in FastAPI). Not exposed to browsers.
 */
export const generate = async (req, res, next) => {
  try {
    const { systemPrompt, userPrompt } = req.body;
    if (!systemPrompt || !userPrompt) {
      return res.status(400).json({ message: "systemPrompt and userPrompt are required" });
    }
    const text = await generateText(systemPrompt, userPrompt);
    res.json({ text });
  } catch (error) {
    next(error);
  }
};
