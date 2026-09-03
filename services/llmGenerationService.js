import { generateGeminiText } from "../config/gemini.js";
import getLlamaClient from "../config/llama_chat.js";
import logger from "../utils/logger.js";

function isRetryableGeminiError(error) {
  const msg = String(error.message || error).toLowerCase();
  const status = error.status || error.code || 0;
  if (status === 429 || status === 503 || status === 504) return true;
  if (/429|503|504|unavailable|high demand|overloaded|timeout|timed out|etimedout|econnreset|rate.?limit/i.test(msg)) return true;
  return false;
}

export const generateText = async (systemPrompt, userPrompt) => {
  let geminiError;
  try {
    logger.info(JSON.stringify({ event: "generation_provider_attempt", provider: "gemini" }));
    const text = await generateGeminiText(systemPrompt, userPrompt);
    logger.info(JSON.stringify({ event: "generation_provider_success", provider: "gemini" }));
    return text;
  } catch (error) {
    geminiError = error;
    const retryable = isRetryableGeminiError(error);
    logger.warn(JSON.stringify({ event: "generation_provider_failure", provider: "gemini", retryable, error: error.message?.slice(0, 300) }));
    if (!retryable) {
      logger.warn(JSON.stringify({ event: "generation_fallback", from: "gemini", to: "nvidia", reason: "non_retryable_but_trying_fallback" }));
    } else {
      logger.info(JSON.stringify({ event: "generation_fallback", from: "gemini", to: "nvidia", reason: String(error.message).slice(0, 200) }));
    }
  }

  try {
    logger.info(JSON.stringify({ event: "generation_provider_attempt", provider: "nvidia" }));
    const completion = await getLlamaClient().chat.completions.create({
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 800,
    });
    const text = completion.choices[0].message.content.trim();
    if (!text) throw new Error("NVIDIA returned empty response");
    logger.info(JSON.stringify({ event: "generation_provider_success", provider: "nvidia" }));
    return text;
  } catch (llamaError) {
    logger.error(JSON.stringify({ event: "generation_provider_failure", provider: "nvidia", error: String(llamaError.message).slice(0, 300) }));
    throw new Error(`Failed to generate text from the provided evidence. Gemini: ${String(geminiError.message).slice(0, 200)} | NVIDIA: ${String(llamaError.message).slice(0, 200)}`);
  }
};
