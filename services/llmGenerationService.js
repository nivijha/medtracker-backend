import { generateGeminiText } from "../config/gemini.js";
import getLlamaClient from "../config/llama_chat.js";
import logger from "../utils/logger.js";

export const generateText = async (systemPrompt, userPrompt) => {
  try {
    const text = await generateGeminiText(systemPrompt, userPrompt);
    logger.info("GENERATE_PROVIDER: gemini");
    return text;
  } catch (error) {
    logger.warn(`GEMINI_GENERATE_FAILED: ${error.message}; trying NVIDIA fallback.`);
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
    } catch (llamaError) {
      logger.error(`LLAMA_GENERATE_FAILED: ${llamaError.message}`);
      throw new Error("Failed to generate text from the provided evidence.");
    }
  }
};
