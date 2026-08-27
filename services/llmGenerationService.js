import getLlamaClient from "../config/llama_chat.js";
import { generateGeminiText } from "../config/gemini.js";
import logger from "../utils/logger.js";

/**
 * Generic grounded-text generation that reuses the EXISTING LLaMA -> Gemini
 * fallback (single source of truth for provider config). Used by the RAG service
 * via the internal /api/ai/generate endpoint.
 */
export const generateText = async (systemPrompt, userPrompt) => {
  try {
    const completion = await getLlamaClient().chat.completions.create({
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });
    return completion.choices[0].message.content.trim();
  } catch (error) {
    logger.warn(`LLAMA_GENERATE_FAILED: ${error.message}; falling back to Gemini.`);
    try {
      const text = await generateGeminiText(systemPrompt, userPrompt);
      logger.info("GENERATE_PROVIDER: gemini");
      return text;
    } catch (geminiError) {
      logger.error(`GEMINI_GENERATE_FAILED: ${geminiError.message}`);
      throw new Error("Failed to generate text from the provided evidence.");
    }
  }
};
