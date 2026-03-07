import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Generates a summary/analysis of a medical report (PDF or Image)
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - File mime type
 */
export const analyzeMedicalReport = async (buffer, mimeType) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // For images or PDFs, Gemini 1.5 Flash handles them natively
    const prompt = `
      ### Role
      You are a Medical Data Analyst. Your task is to analyze the attached medical report and create a structured summary.

      ### Objective
      Extract and summarize the key findings, test results, and recommendations from this document.
      
      ### Output Format (Markdown)
      # Medical Report Analysis
      
      ## Summary
      [Brief overview of the report]
      
      ## Key Findings
      [List of important observations, abnormal results, or diagnoses]
      
      ## Detailed Results
      [Table or list of specific test values and ranges if applicable]
      
      ## Recommendations
      [List of suggested next steps or follow-ups mentioned in the report]
      
      ---
      *Disclaimer: This is an AI-generated summary for informational purposes only. Please consult with a healthcare professional for accurate interpretation.*
    `;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType,
        },
      },
    ]);

    const response = await result.response;
    return response.text();
  } catch (error) {
    logger.error(`AI_SERVICE_ERROR: ${error.message}`);
    throw new Error("Failed to analyze report using AI.");
  }
};
