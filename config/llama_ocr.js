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
You are a Medical Prescription Parser. Your goal is to extract medication schedules from the provided document and convert them into a structured tracking format.

### Context
Today's Date: {{current_date}}
Patient Start Date: {{start_date}} (Default to Today's Date if not specified)

### Extraction Requirements
For every medication identified in the document, extract:
1. **Medicine Name:** The brand or generic name.
2. **Dosage:** The strength (e.g., 500mg) and the frequency (e.g., Twice daily, 1-0-1).
3. **Duration:** The total number of days/weeks the medication should be taken.
4. **End Date Calculation:** - Calculate the End Date based on: [Start Date] + [Duration].
   - Format: YYYY-MM-DD.

### Rules
- If "Duration" is not mentioned, check for "Total Quantity" (e.g., 30 tablets) and infer duration based on dosage frequency.
- If duration is "Ongoing" or "Lifetime," set End Date to "Indefinite".
- Use a JSON-like structure for the output to ensure easy parsing.

### Output Format
| Medicine Name | Dosage | Duration | End Date |
| :--- | :--- | :--- | :--- |
| [Name] | [Dosage/Freq] | [Days] | [Date] |`,
        },
    ],
});

console.log(chatCompletion.choices[0].message);