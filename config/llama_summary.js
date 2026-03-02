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
    
    // Ensure text is not too large for the context window (approx 8000 tokens)
    const truncatedText = documentText.substring(0, 15000); 

    const chatCompletion = await hf.chatCompletion({
      model: "meta-llama/Llama-3.1-8B-Instruct:novita",
      messages: [
        {
          role: "user",
          content: `
### Role & Context
You are a highly skilled Clinical Data Extraction AI. The user has uploaded a medical document (Lab Test, Imaging Report, Pathology, etc.). 
Your task is to analyze the text and extract a structured, highly valuable clinical summary that a doctor or the patient can quickly review.

### Instructions
Analyze the text below and extract information into the following sections. If a section is not applicable or not found in the text, write "None noted" or "N/A".

1. **Document Type & Date:** Identify the type of report (e.g., CBC Blood Test, Chest X-Ray) and the date of the examination.
2. **Key Findings / Parameters:** Summarize the most important results. Highlight any abnormal values or critical observations explicitly. 
3. **Diagnosis / Impressions:** What is the doctor's or radiologist's final conclusion, diagnosis, or impression?
4. **Patient Vitals / Conditions:** Briefly list any mentioned patient history, baseline conditions, or vitals if present.
5. **Action Items / Recommendations:** List any recommended follow-ups, medications, or lifestyle changes suggested in the report.

### Constraints
- Do NOT make up medical information. Only use the provided text.
- Be concise but clinically precise.
- DO NOT use any emojis or decorative symbols in your response.
- **Formatting Rule 1**: You MUST use a markdown bullet point (\`- \`) for EVERY item you list under the headings.
- **Formatting Rule 2**: You MUST leave a blank empty line after EVERY heading.
- If the document is not a medical report, state: "This document does not appear to contain standard medical report data."

### Medical Record Text:
"""
${truncatedText}
"""

### Output Format
**Clinical Report Summary**

**Document Type & Date:**
- [Type & Date]

**Key Findings / Abnormalities:**

- [Finding 1]
- [Finding 2]

**Impressions / Diagnosis:**

- [Conclusion]

**Patient Context:**

- [Conditions/Vitals]

**Action Items:**

- [Recommendation 1]
- [Recommendation 2]
`,
        },
      ],
      max_tokens: 800,
    });

    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error("AI Summary Error:", error);
    throw new Error("Failed to generate AI summary from document.");
  }
};