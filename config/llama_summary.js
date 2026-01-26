import dotenv from "dotenv";
dotenv.config();
import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(process.env.HF_TOKEN);

const chatCompletion = await client.chatCompletion({
    model: "meta-llama/Llama-3.1-8B-Instruct:novita",
    messages: [
        {
            role: "user",
            content: `
    ### Role
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
**Emergency Contact:** [Name - Relationship - Phone]`,
        },
    ],
});

console.log(chatCompletion.choices[0].message);