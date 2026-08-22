import getClient from "../config/llama_chat.js";
import { queryRag } from "../services/ragClient.js";
import Appointment from "../models/Appointment.js";
import Medication from "../models/Medication.js";
import Report from "../models/Report.js";

/* ─────────────────────────────────────────────────────────────────────────────
   STEP 1 – INTENT EXTRACTION PROMPT
   Ask LLaMA to classify the user message and extract structured entities.
   We explicitly tell it to output ONLY valid JSON so we can parse it reliably.
───────────────────────────────────────────────────────────────────────────── */

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for a medical app chatbot.
Analyze the user's message and return ONLY a valid JSON object – no prose, no markdown, no explanation.

Supported intents:
- view_appointments     → user wants to see their appointments
- schedule_appointment  → user wants to book/schedule a new appointment
- cancel_appointment    → user wants to cancel an existing appointment
- view_medications      → user wants to see their medication list
- add_medication        → user wants to add a new medication
- remove_medication     → user wants to remove/stop a medication
- view_reports          → user wants to see their medical reports
- out_of_scope          → anything unrelated to appointments, medications, reports, or your MedTracker app

For date fields output ISO 8601 date (YYYY-MM-DD). Today is ${new Date().toISOString().split("T")[0]}.
For time fields output 24-hour HH:MM format.

Response schema (return exactly this shape):
{
  "intent": "<one of the intents above>",
  "entities": {
    "doctorName": "<string or null>",
    "specialty": "<string or null>",
    "hospital":  "<string or null>",
    "date":      "<YYYY-MM-DD or null>",
    "time":      "<HH:MM or null>",
    "notes":     "<string or null>",
    "medicationName": "<string or null>",
    "dosage":    "<string or null>",
    "frequency": "<string or null>",
    "medicationTime": "<string or null>"
  }
}`;

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────────────────────── */

/** Call LLaMA and get the text content back */
async function llamaChat(systemPrompt, userMessage) {
  const completion = await getClient().chat.completions.create({
    model: "meta/llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userMessage },
    ],
    temperature: 0.2,
    max_tokens: 600,
  });
  return completion.choices[0].message.content.trim();
}

/** Format an appointment for display */
function formatAppointment(a, index) {
  const dt = a.appointmentDateTime
    ? new Date(a.appointmentDateTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "Date not set";
  const parts = [`${index + 1}. ${a.doctorName}`];
  if (a.specialty) parts.push(`   Specialty: ${a.specialty}`);
  if (a.hospital)  parts.push(`   Hospital: ${a.hospital}`);
  parts.push(`   ${dt}`);
  parts.push(`   Status: ${a.status}`);
  if (a.notes) parts.push(`   Notes: ${a.notes}`);
  return parts.join("\n");
}

/** Format a medication for display */
function formatMedication(m, index) {
  const parts = [`${index + 1}. ${m.name} (${m.dosage})`];
  if (m.frequency) parts.push(`   Frequency: ${m.frequency}`);
  if (m.time)      parts.push(`   Time: ${m.time}`);
  if (m.prescribedBy) parts.push(`   Prescribed by: ${m.prescribedBy}`);
  parts.push(`   Status: ${m.status}`);
  return parts.join("\n");
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN CONTROLLER
───────────────────────────────────────────────────────────────────────────── */

export const chatWithAI = async (req, res) => {
  try {
    const { messages, ragMode = false } = req.body;

    if (!messages || messages.length === 0) {
      return res.json({ reply: "Hi! I'm your MedTracker assistant. How can I help you today?" });
    }

    const userId = req.user.id;
    const userMessage = messages[messages.length - 1].content;

    /* 'STEP 1A: If RAG mode, query document index' ──────────────────────── */
    if (ragMode) {
      try {
        const ragResponse = await queryRag({ userId, query: userMessage });
        return res.json({
          response: ragResponse.answer || ragResponse.reply || "I've reviewed your documents, but couldn't generate a specific answer.",
          sources: ragResponse.sources || [],
          grounded: ragResponse.grounded !== false,
          evidenceScore: ragResponse.evidenceScore || 0,
          queryType: ragResponse.queryType || "document_query"
        });
      } catch (ragError) {
        console.error("RAG_QUERY_ERROR:", ragError.message);
        // Fall through to normal intent processing if RAG fails
      }
    }

    /* ── STEP 1: Extract intent + entities via LLaMA ── */

    let parsed;
    try {
      const raw = await llamaChat(INTENT_SYSTEM_PROMPT, userMessage);

      // Strip markdown code fences if LLaMA wraps the JSON in ```json ... ```
      const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // JSON parse failed → treat as out-of-scope/unrelated query
      parsed = { intent: "out_of_scope", entities: {} };
    }

    const { intent, entities = {} } = parsed;

    if (intent === "out_of_scope") {
      return res.json({
        reply: "Sorry, this is beyond my scope. I can only help with your MedTracker appointments, medications, reports, and other app-related tasks."
      });
    }

    /* ── STEP 2: Execute DB action based on intent ── */

    /* -------- VIEW APPOINTMENTS -------- */
    if (intent === "view_appointments") {
      const appointments = await Appointment.find({ user: userId }).sort({ appointmentDateTime: 1 });

      if (!appointments.length) {
        return res.json({ reply: "You have no appointments scheduled at the moment. Would you like to book one?" });
      }

      const upcoming = appointments.filter(a => a.status !== "cancelled");
      const cancelled = appointments.filter(a => a.status === "cancelled");

      let reply = `You have ${upcoming.length} upcoming appointment(s):\n\n`;
      upcoming.forEach((a, i) => { reply += formatAppointment(a, i) + "\n\n"; });

      if (cancelled.length) {
        reply += `\nCancelled (${cancelled.length}):\n`;
        cancelled.forEach((a, i) => { reply += `${i + 1}. ${a.doctorName}\n`; });
      }

      return res.json({ reply: reply.trim() });
    }

    /* -------- SCHEDULE APPOINTMENT -------- */
    if (intent === "schedule_appointment") {
      const doctorName = entities.doctorName || "Doctor";

      if (!entities.date && !entities.time) {
        return res.json({
          reply: `Sure! To schedule your appointment, please let me know:\n• Doctor's name\n• Date (e.g., "tomorrow", "March 5th")\n• Time (e.g., "10am", "6pm")`,
        });
      }

      const dateStr  = entities.date || new Date().toISOString().split("T")[0];
      const timeStr  = entities.time || "10:00";
      const appointmentDateTime = new Date(`${dateStr}T${timeStr}:00+05:30`);

      if (isNaN(appointmentDateTime.getTime())) {
        return res.json({ reply: "I couldn't understand that date/time. Could you rephrase? e.g. 'Book dentist tomorrow at 6pm'" });
      }

      const appointment = await Appointment.create({
        user: userId,
        doctorName,
        specialty: entities.specialty || undefined,
        hospital:  entities.hospital  || undefined,
        appointmentDateTime,
        notes:     entities.notes     || undefined,
        status:    "scheduled",
      });

      const dt = appointmentDateTime.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      return res.json({
        reply: `Appointment scheduled.\n\nDoctor: ${appointment.doctorName}\nDate & Time: ${dt}${appointment.specialty ? `\nSpecialty: ${appointment.specialty}` : ""}`,
        action: "refresh_appointments",
      });
    }

    /* -------- CANCEL APPOINTMENT -------- */
    if (intent === "cancel_appointment") {
      if (!entities.doctorName) {
        return res.json({ reply: "Which appointment would you like to cancel? Please mention the doctor's name." });
      }

      const appointment = await Appointment.findOne({
        user: userId,
        doctorName: { $regex: String(entities.doctorName), $options: "i" },
        status: "scheduled",
      });

      if (!appointment) {
        return res.json({ reply: `I couldn't find a scheduled appointment with "${entities.doctorName}". Type "show appointments" to see your current list.` });
      }

      appointment.status = "cancelled";
      await appointment.save();

      const dt = new Date(appointment.appointmentDateTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      return res.json({
        reply: `Appointment cancelled.\n\nDoctor: ${appointment.doctorName}\nWas scheduled for: ${dt}`,
        action: "refresh_appointments",
      });
    }

    /* -------- VIEW MEDICATIONS -------- */
    if (intent === "view_medications") {
      const meds = await Medication.find({ user: userId, status: "active" }).sort({ createdAt: -1 });

      if (!meds.length) {
        return res.json({ reply: "You have no active medications logged. Would you like to add one?" });
      }

      let reply = `Your current medications (${meds.length}):\n\n`;
      meds.forEach((m, i) => { reply += formatMedication(m, i) + "\n\n"; });

      return res.json({ reply: reply.trim() });
    }

    /* -------- ADD MEDICATION -------- */
    if (intent === "add_medication") {
      if (!entities.medicationName) {
        return res.json({
          reply: `To add a medication, please tell me:\n• Medication name\n• Dosage (e.g., "400mg")\n• How often (e.g., "twice a day", "once daily")\n• Time to take it (e.g., "8am")`,
        });
      }

      const medication = await Medication.create({
        user:        userId,
        name:        entities.medicationName,
        dosage:      entities.dosage       || "As prescribed",
        frequency:   entities.frequency    || "Daily",
        time:        entities.medicationTime || "08:00 AM",
        prescribedBy: "Self",
        startDate:   new Date(),
        status:      "active",
      });

      return res.json({
        reply: `Medication added.\n\n${medication.name} (${medication.dosage})\n${medication.frequency} at ${medication.time}`,
        action: "refresh_medications",
      });
    }

    /* -------- REMOVE MEDICATION -------- */
    if (intent === "remove_medication") {
      if (!entities.medicationName) {
        return res.json({ reply: "Which medication would you like to remove? Please mention its name." });
      }

      const medication = await Medication.findOneAndDelete({
        user: userId,
        name: { $regex: String(entities.medicationName), $options: "i" },
      });

      if (!medication) {
        return res.json({ reply: `I couldn't find "${entities.medicationName}" in your medication list. Type "show medications" to see your list.` });
      }

      return res.json({
        reply: `"${medication.name}" has been removed from your medications.`,
        action: "refresh_medications",
      });
    }

    /* -------- VIEW REPORTS -------- */
    if (intent === "view_reports") {
      const reports = await Report.find({ user: userId }).sort({ reportDate: -1 }).limit(10);

      if (!reports.length) {
        return res.json({ reply: "You have no medical reports uploaded yet. You can upload reports from the Reports section." });
      }

      let reply = `Your recent medical reports (${reports.length}):\n\n`;
      reports.forEach((r, i) => {
        const date = r.reportDate ? new Date(r.reportDate).toLocaleDateString("en-IN") : "Date unknown";
        reply += `${i + 1}. ${r.type.charAt(0).toUpperCase() + r.type.slice(1)} report`;
        if (r.doctorName) reply += ` - Dr. ${r.doctorName}`;
        reply += `\n   ${date}`;
        if (r.description) reply += `\n   ${r.description}`;
        reply += "\n\n";
      });

      return res.json({ reply: reply.trim() });
    }

    return res.json({
      reply: "Sorry, this is beyond my scope. I can only help with your MedTracker appointments, medications, reports, and other app-related tasks."
    });

  } catch (error) {
    console.error("CHATBOT ERROR:", error.message);
    console.error(error.stack);
    return res.status(500).json({ error: "AI request failed. Please try again." });
  }
};
