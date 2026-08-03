import { generateReportSummary as generateLlamaSummary } from "../config/llama_summary.js";
import { generateGeminiSummary } from "../config/gemini.js";
import logger from "../utils/logger.js";

export const generateReportSummary = async (documentText) => {
  try {
    const summary = await generateLlamaSummary(documentText);
    logger.info("SUMMARY_PROVIDER: llama");
    return summary;
  } catch (error) {
    logger.warn(`LLAMA_SUMMARY_FAILED: ${error.message}. Falling back to Gemini.`);
    try {
      const summary = await generateGeminiSummary(documentText);
      logger.info("SUMMARY_PROVIDER: gemini");
      return summary;
    } catch (geminiError) {
      logger.error(`GEMINI_SUMMARY_FAILED: ${geminiError.message}`);
      throw new Error("Failed to generate AI summary from document.");
    }
  }
};
