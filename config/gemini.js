import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import logger from "../utils/logger.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const EXTRACTION_PROMPT = `### Role
You are a Medical Data Extraction Specialist. Analyze the attached PDF medical record and create a structured, highly valuable clinical summary.

### A) Patient Emergency Card (5 fields)
Extract with absolute accuracy. If not explicitly stated, mark "Not Specified."
1. **Blood Group:** ABO and Rh factor (e.g., O positive)
2. **Allergies:** drug/food/environmental + reaction if noted
3. **Chronic Conditions:** ongoing issues (e.g., Diabetes Type 2, Hypertension)
4. **Current Medications:** names, dosages, frequency if available
5. **Emergency Contact:** name, relationship, phone

### B) Clinical Summary (detailed — this is shown to the user)
Produce the following sections in order:
1. **Document Type & Date:** type (e.g., CBC Blood Test, Chest X-Ray) + all timestamps (collection / reported) when printed
2. **Key Findings / Parameters:** EVERY measured value with unit, Bio. Ref. Interval, and flag (High/Low/Borderline/Within range) when printed
3. **What This Means (plain English, 1-2 lines per abnormal):** plain-language note per flagged value — what the interval implies; do NOT diagnose or prescribe
4. **Impressions / Diagnosis:** doctor/radiologist conclusion — quote impression lines verbatim when present
5. **Patient Context:** demographics, history, vitals mentioned
6. **Action Items:** follow-ups, medications, lifestyle changes — quote when possible

### Constraints
- Do NOT make up medical information. Only use the provided text.
- Be concise but clinically precise.
- DO NOT use emojis or decorative symbols.
- Use a markdown bullet (\`- \`) for EVERY listed item; leave a blank line after each heading.
- If not a medical report, state: "This document does not appear to contain standard medical report data."

### Output Format
# Patient Medical Summary
---
**Blood Group:** [Value]
**Allergies:** [List or None]
**Chronic Conditions:** [List or None]
**Current Medications:** [List or None]
**Emergency Contact:** [Name - Relationship - Phone]

**Document Type & Date:**
- [Type & Date with collection/reported times]

**Key Findings / Abnormalities:**
- [Finding — value, unit, ref interval, flag]

**What This Means:**
- [Per-abnormal plain-English note]

**Impressions / Diagnosis:**
- [Conclusion]

**Patient Context:**
- [Conditions/Vitals]

**Action Items:**
- [Recommendation]`;

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

export const generateGeminiText = async (systemPrompt, userPrompt) => {
  if (!ai) {
    throw new Error("GEMINI_API_KEY is missing in environment variables.");
  }

  if (!userPrompt || !userPrompt.trim()) {
    throw new Error("No user prompt provided for generation.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `${systemPrompt || ""}

### User Query

${userPrompt}`,
          },
        ],
      },
    ],
  });

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  logger.info("GEMINI_TEXT_GENERATION_SUCCESS");

  return response.text;
};
