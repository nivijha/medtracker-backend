import dotenv from "dotenv";
dotenv.config();
import { InferenceClient } from "@huggingface/inference";

let client;
const getClient = () => {
  if (!client) {
    if (!process.env.HF_TOKEN) {
      throw new Error("HF_TOKEN is missing in environment variables.");
    }
    client = new InferenceClient(process.env.HF_TOKEN);
  }
  return client;
};

export const generateReportSummary = async (documentText) => {
  try {
    const hf = getClient();
    const truncatedText = documentText.substring(0, 15000);
    const chatCompletion = await hf.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [
        {
          role: "user",
          content: `
### Role & Context
You are a highly skilled Clinical Data Extraction AI. The user has uploaded a medical document (Lab Test, Imaging Report, Pathology, etc.). Your task is to extract a structured, highly valuable clinical summary that a doctor or the patient can quickly review.

### Instructions
Analyze the text and extract information into the sections below. If a section is not applicable or not found, write "None noted" or "N/A".

1. **Document Type & Date:** Type of report (e.g., CBC Blood Test, Chest X-Ray) and date of examination/collection/reporting — include all three timestamps when present.
2. **Key Findings / Parameters:** List EVERY measured value with its unit, Bio. Ref. Interval, and flag (High/Low/Borderline/Within range) when the interval is printed. Highlight abnormals explicitly.
3. **What This Means (plain English, 1-2 lines per abnormal):** For each flagged value, briefly explain what the reference range implies, in plain language. Do NOT diagnose or prescribe — only relate the value to its printed interval.
4. **Diagnosis / Impressions:** Doctor's or radiologist's final conclusion, diagnosis, or impression — quote impression lines verbatim when present.
5. **Patient Vitals / Conditions:** Patient demographics, history, baseline conditions, or vitals mentioned.
6. **Action Items / Recommendations:** Follow-ups, medications, lifestyle changes suggested in the report — quote when possible.

### Constraints
- Do NOT make up medical information. Only use the provided text.
- Be concise but clinically precise.
- DO NOT use any emojis or decorative symbols.
- **Formatting Rule 1**: Use a markdown bullet point (\`- \`) for EVERY item you list under the headings.
- **Formatting Rule 2**: Leave a blank empty line after EVERY heading.
- If the document is not a medical report, state: "This document does not appear to contain standard medical report data."

### Medical Record Text:
"""
${truncatedText}
"""

### Output Format
**Clinical Report Summary**

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
- [Recommendation]
`,
        },
      ],
      max_tokens: 1100,
    });
    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error("AI Summary Error:", error);
    throw new Error("Failed to generate AI summary from document.");
  }
};
