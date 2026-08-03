import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import logger from "../utils/logger.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const EXTRACTION_PROMPT = `### Role
You are a Medical Data Extraction Specialist. Your task is to analyze the attached PDF medical record and create a concise, one-page summary for emergency use.

### Objective
Extract the following five data points with absolute accuracy. If the information is not explicitly stated in the document, mark it as "Not Specified."

### Extraction Fields
1. **Blood Group:** Identify ABO and Rh factor (e.g., O positive).
2. **Allergies:** List all known drug, food, or environmental allergies. Include the reaction if noted.
3. **Chronic Conditions:** List ongoing medical issues (e.g., Diabetes Type 2, Hypertension, Asthma).
4. **Current Medications:** List names of drugs, dosages, and frequency if available.
5. **Emergency Contact:** Extract the name, relationship, and phone number of the primary contact.

### Constraints
- **Accuracy First:** Do not infer or guess information. Only extract what is written.
- **Formatting:** Use a clean, bulleted list format.
- **Privacy:** Do not include full social security numbers or sensitive notes unrelated to these five categories.
- **Conflict Resolution:** If the document contains conflicting information, note both and flag it as a "Conflict."

### Output Format
# Patient Medical Summary
---
**Blood Group:** [Value]
**Allergies:** [List or None]
**Chronic Conditions:** [List or None]
**Current Medications:** [List or None]
**Emergency Contact:** [Name - Relationship - Phone]`;

export const generateGeminiSummary = async (documentText) => {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }

  if (!documentText || !documentText.trim()) {
    throw new Error("No document text provided for summarization.");
  }

  const truncatedText = documentText.substring(0, 15000);

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `${EXTRACTION_PROMPT}

### Medical Record Text:
"""
${truncatedText}
"""`,
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  logger.info("GEMINI_SUMMARY_SUCCESS");
  return response.text;
};
