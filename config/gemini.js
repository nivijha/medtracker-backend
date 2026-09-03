import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";
import logger from "../utils/logger.js";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const EXTRACTION_PROMPT = `### Role
You are a Senior Clinical Data Specialist. Your job is to read the attached medical record and produce a **thorough, detailed, evidence-faithful** summary that a patient and their doctor can actually act on.

### A) Patient Emergency Card (5 fields) — must be complete
Extract with absolute accuracy. If not explicitly stated, write "Not Specified" — never guess. Preserve exact spellings.
1. **Blood Group:** ABO and Rh factor (e.g., O positive)
2. **Allergies:** drug / food / environmental + reaction if noted
3. **Chronic Conditions:** ongoing issues (e.g., Diabetes Type 2, Hypertension, PCOS)
4. **Current Medications:** names, dosages, frequency, route if stated
5. **Emergency Contact:** name, relationship, phone

### B) Detailed Clinical Summary — be thorough, not terse
Cover **every** section below in order. For sections with no data, write "None noted in this document." rather than skipping. Include all measured values — omitting a value is a defect.

1. **Report Identity:** report type (e.g., Hormone Panel, HbA1c, CBC, Imaging), issuing lab/hospital if printed, and **all** timestamps: collection date/time, received date/time, reported date/time, and the patient's demographics on the header (age, sex, ID where printed). If timestamps differ, list each separately.

2. **Complete Lab / Imaging Results (table + bullets):**
   - First, render a markdown table with columns: \`Test | Result | Unit | Bio. Ref. Interval | Flag (High/Low/Borderline/Within range/N/A)\`.
   - Every row = one measured parameter from the document. Preserve **exact** numbers and units as printed (e.g., "FSH 6.44 mIU/mL", "LDL 142 mg/dL"). If a ref interval is not printed for a row, write N/A.
   - After the table, add a bullet list of the same results for readability (one bullet per row: "FSH — 6.44 mIU/mL (Ref: 2.5–10.20 Follicular) — Within range — Follicular phase").

3. **Abnormal & Borderline Highlights:** dedicated bullets for every value flagged High/Low or within 10% of the interval boundary. State the value, interval, how far outside/beside it is, and quote any printed interpretation note.

4. **What This Means (plain English, 2–3 sentences per abnormal/borderline):** for each flagged or borderline value, explain in plain language what the reference interval implies and why the lab includes it. Do NOT diagnose a condition and do NOT prescribe — only relate the number to its printed interval. Cite the interval you are referencing. Example: "Your HbA1c 5.6% sits at the upper edge of the lab's non-diabetic interval (4.0–5.6%); the lab note calls this suggestive of well-controlled ..."

5. **Impressions / Diagnosis:** doctor/radiologist conclusion in full — quote impression/diagnosis lines **verbatim** when present (use a blockquote). If the document says "No abnormality detected" or similar, quote it exactly.

6. **Patient Context:** demographics, relevant history, vitals, fasting status, cycle phase, specimen type, or collection site when mentioned. Quote header demographics.

7. **Action Items / Follow-ups:** every follow-up, medication, lifestyle, or repeat-test suggestion in the document — quote wording. If none, state "No follow-up stated in this report; discuss timing with your clinician."

8. **Limitations & Next Steps:** one short paragraph noting any limitations of *this single report* (e.g., single timepoint, fasting vs non-fasting) and what a useful next step would be from a records perspective (e.g., "compare with prior HbA1c of …" if a prior report exists — but do not invent a prior value; state "no prior report in this document").

### Constraints
- Do NOT make up medical information. Only use the provided text. If you state a number, it must appear in the record.
- Do NOT diagnose a condition and do NOT prescribe or adjust medication. You may explain what a printed interval means.
- DO NOT use emojis or decorative symbols.
- Use a markdown bullet (\`- \`) for EVERY listed item; leave a blank line after each heading.
- Prefer quoting exact phrasing for interpretations over paraphrasing.
- If not a medical report, state: "This document does not appear to contain standard medical report data."

### Output Format (follow this skeleton exactly)
# Patient Medical Summary
---
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
- [Test — value unit (Ref: interval) — Flag — note]

**Abnormal & Borderline Highlights:**
- [Value, interval, distance, quoted interpretation]

**What This Means:**
- [2–3 sentence plain-English note per abnormal/borderline]

**Impressions / Diagnosis:**
> [Verbatim impression or "None stated"]

**Patient Context:**
- [Demographics, specimen, history, vitals]

**Action Items:**
- [Follow-up / "No follow-up stated ..."]

**Limitations & Next Steps:**
- [Single-report limitation + records-based next step]`;

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

  const controller = new AbortController();
  const timeoutMs = parseInt(process.env.GEMINI_TIMEOUT_MS || "15000", 10);
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await ai.models.generateContent({
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
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError" || controller.signal.aborted) {
      const e = new Error(`Gemini timeout after ${timeoutMs}ms`);
      e.status = 504;
      throw e;
    }
    const msg = String(err.message || err);
    const statusMatch = msg.match(/\b(429|503|504)\b/);
    if (statusMatch) err.status = parseInt(statusMatch[1], 10);
    throw err;
  }
  clearTimeout(timer);

  if (!response.text) {
    throw new Error("Gemini returned an empty response.");
  }

  logger.info("GEMINI_TEXT_GENERATION_SUCCESS");

  return response.text;
};
