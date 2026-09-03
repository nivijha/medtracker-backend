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
You are a Senior Clinical Data Specialist. Read the medical document and produce a thorough, detailed, evidence-faithful summary that a patient and doctor can act on. Omitting a measured value is a defect.

### A) Patient Emergency Card (5 fields)
Extract with absolute accuracy. If not stated, write "Not Specified." Preserve exact spellings.
1. **Blood Group:** ABO + Rh (e.g., O positive)
2. **Allergies:** drug/food/environmental + reaction
3. **Chronic Conditions:** ongoing issues
4. **Current Medications:** names, dosages, frequency, route
5. **Emergency Contact:** name, relationship, phone

### B) Detailed Clinical Summary — be thorough, not terse
Cover every section below. If no data for a section, write "None noted in this document." Include all measured values.

1. **Report Identity:** type (e.g., Hormone Panel, HbA1c, CBC, Imaging), lab/hospital, all timestamps (collection/received/reported), demographics on header (age, sex, ID where printed). List each timestamp separately if they differ.
2. **Complete Lab / Imaging Results (table + bullets):**
   - Table columns: Test | Result | Unit | Bio. Ref. Interval | Flag (High/Low/Borderline/Within/N/A)
   - One row per measured parameter. Preserve exact numbers/units (e.g., "FSH 6.44 mIU/mL"). If interval not printed, write N/A.
   - After the table, a bullet list of the same rows: "FSH — 6.44 mIU/mL (Ref: 2.5–10.20 Follicular) — Within range"
3. **Abnormal & Borderline Highlights:** every High/Low or within 10% of boundary, with value, interval, distance, and quoted interpretation note.
4. **What This Means (2–3 sentences per abnormal/borderline, plain English):** explain what the printed interval implies; do NOT diagnose or prescribe — only relate the number to its interval.
5. **Impressions / Diagnosis:** conclusion in full — quote verbatim via blockquote when present.
6. **Patient Context:** demographics, history, vitals, fasting status, cycle phase, specimen type, collection site when mentioned.
7. **Action Items / Follow-ups:** every follow-up/medication/lifestyle/repeat-test suggestion — quote wording. If none: "No follow-up stated; discuss timing with your clinician."
8. **Limitations & Next Steps:** single-report limitation + records-based next step (do not invent a prior value; state "no prior report in this document" if absent).

### Constraints
- Do NOT make up medical information. Only use the provided text.
- Do NOT diagnose or prescribe. Explain intervals only.
- DO NOT use emojis or decorative symbols.
- Formatting Rule 1: markdown bullet (\`- \`) for EVERY listed item.
- Formatting Rule 2: blank empty line after EVERY heading.
- Prefer quoting exact phrasing over paraphrasing.
- If not a medical report, state: "This document does not appear to contain standard medical report data."

### Medical Record Text:
"""
${truncatedText}
"""

### Output Format — follow this skeleton exactly
**Clinical Report Summary**

**Blood Group:** [Value]
**Allergies:** [List or None]
**Chronic Conditions:** [List or None]
**Current Medications:** [List or None]
**Emergency Contact:** [Name - Relationship - Phone]

**Report Identity:**
- [Type, lab, all timestamps, demographics]

**Complete Results (Table):**
| Test | Result | Unit | Bio. Ref. Interval | Flag |
|------|--------|------|---------------------|------|
| [e.g., FSH] | [6.44] | [mIU/mL] | [2.50–10.20] | [Within range] |

**Complete Results (Bullets):**
- [Test — value unit (Ref: interval) — Flag]

**Abnormal & Borderline Highlights:**
- [Value, interval, distance, quoted note]

**What This Means:**
- [2–3 sentence note per abnormal/borderline]

**Impressions / Diagnosis:**
> [Verbatim impression]

**Patient Context:**
- [Demographics, history, vitals]

**Action Items:**
- [Follow-up]

**Limitations & Next Steps:**
- [Limitation + next step]
`,
        },
      ],
      max_tokens: 1600,
    });
    return chatCompletion.choices[0].message.content;
  } catch (error) {
    console.error("AI Summary Error:", error);
    throw new Error("Failed to generate AI summary from document.");
  }
};
