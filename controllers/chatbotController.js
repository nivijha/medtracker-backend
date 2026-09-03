import getClient from "../config/llama_chat.js";
import Appointment from "../models/Appointment.js";
import Medication from "../models/Medication.js";
import Report from "../models/Report.js";
import logger from "../utils/logger.js";
import { extractDates, isDateOnlyFollowUp } from "../utils/dateUtils.js";
import { looksLikeDocumentQuery, isFollowUp } from "../utils/intentUtils.js";

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
- document_query        → user is asking about specific values, trends, comparisons, or summaries from their medical reports/documents (e.g. "what are my creatinine levels?", "compare my July blood tests", "summarize my latest report")
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

async function llamaChat(systemPrompt, userMessage) {
  const { generateGeminiText } = await import("../config/gemini.js");
  try {
    return await generateGeminiText(systemPrompt, userMessage);
  } catch (error) {
    logger.warn(`GEMINI_CHAT_FAILED: ${error.message}; trying NVIDIA fallback.`);
    const completion = await getClient().chat.completions.create({
      model: "meta/llama-3.3-70b-instruct",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.2,
      max_tokens: 600,
    });
    return completion.choices[0].message.content.trim();
  }
}

function formatAppointment(a, index) {
  const dt = a.appointmentDateTime
    ? new Date(a.appointmentDateTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    : "Date not set";
  const parts = [`${index + 1}. ${a.doctorName}`];
  if (a.specialty) parts.push(`   Specialty: ${a.specialty}`);
  if (a.hospital) parts.push(`   Hospital: ${a.hospital}`);
  parts.push(`   ${dt}`);
  parts.push(`   Status: ${a.status}`);
  if (a.notes) parts.push(`   Notes: ${a.notes}`);
  return parts.join("\n");
}

function formatMedication(m, index) {
  const parts = [`${index + 1}. ${m.name} (${m.dosage})`];
  if (m.frequency) parts.push(`   Frequency: ${m.frequency}`);
  if (m.time) parts.push(`   Time: ${m.time}`);
  if (m.prescribedBy) parts.push(`   Prescribed by: ${m.prescribedBy}`);
  parts.push(`   Status: ${m.status}`);
  return parts.join("\n");
}

export const chatWithAI = async (req, res) => {
  try {
    const { messages } = req.body;

    if (!messages || messages.length === 0) {
      return res.json({ reply: "Hi! I'm your MedTracker assistant. How can I help you today?" });
    }

    const userId = req.user.id;
    const userMessage = messages[messages.length - 1].content;
    const previousQuery = messages.length >= 2 ? (messages[messages.length - 2].content || null) : null;

    const extractedDates = extractDates(userMessage);
    let followUpInherited = false;
    let effectiveDates = extractedDates;
    if (extractedDates.length === 0 && isDateOnlyFollowUp(userMessage) && previousQuery) {
      const prevDates = extractDates(previousQuery);
      if (prevDates.length > 0) {
        const { extractDatesWithContext } = await import("../utils/dateUtils.js");
        const inherited = extractDatesWithContext(userMessage, previousQuery);
        if (inherited.length > 0) {
          effectiveDates = inherited;
          followUpInherited = true;
        }
      }
    }

    const wantsFollowUpContext = isFollowUp(userMessage, previousQuery);
    const looksDoc = looksLikeDocumentQuery(userMessage);
    const shouldExpandFollowUp = wantsFollowUpContext && previousQuery && looksLikeDocumentQuery(previousQuery);

    let effectiveQuery = userMessage;
    if (shouldExpandFollowUp || followUpInherited) {
      const { rewriteShortFollowUp } = await import("../utils/intentUtils.js");
      effectiveQuery = rewriteShortFollowUp
        ? rewriteShortFollowUp(userMessage, previousQuery)
        : `${previousQuery} ${userMessage}`;
      logger.info(JSON.stringify({ event: "followup_rewrite", raw: userMessage, previous: previousQuery, effective: effectiveQuery, inheritedDates: effectiveDates }));
    }

    logger.info(JSON.stringify({
      event: "chatbot_request",
      raw_query: userMessage,
      effective_query: effectiveQuery,
      extracted_dates: effectiveDates,
      followUpInherited,
      looks_document_query: looksDoc,
    }));

    const deterministicDoc = looksDoc || looksLikeDocumentQuery(effectiveQuery) || effectiveDates.length > 0;

    let parsed;
    let intentSource = "deterministic";
    if (deterministicDoc) {
      parsed = { intent: "document_query", entities: {} };
      logger.info(JSON.stringify({ event: "intent_resolved", intent: "document_query", source: "deterministic", raw: userMessage }));
    } else {
      intentSource = "llm";
      try {
        const raw = await llamaChat(INTENT_SYSTEM_PROMPT, userMessage);
        const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = { intent: "out_of_scope", entities: {} };
      }
      logger.info(JSON.stringify({ event: "intent_resolved", intent: parsed.intent, source: "llm", raw: userMessage }));
      if (parsed.intent === "out_of_scope" && effectiveDates.length > 0) {
        parsed = { intent: "document_query", entities: {} };
        logger.info(JSON.stringify({ event: "intent_overridden", from: "out_of_scope", to: "document_query", reason: "has_extracted_dates", dates: effectiveDates }));
      }
    }

    const { intent, entities = {} } = parsed;

    if (intent === "document_query") {
      let dateFilters = null;
      let missingDates = [];
      if (effectiveDates.length > 0) {
        const resolved = await resolveReportsForDates(userId, effectiveDates);
        if (resolved.found.length === 0 && resolved.missing.length > 0) {
          const missList = resolved.missing.join(", ");
          return res.json({
            reply: `I couldn't find a report for ${missList}. Please make sure those reports have been uploaded.`,
            response: `I couldn't find a report for ${missList}. Please make sure those reports have been uploaded.`,
            sources: [],
            grounded: false,
            evidenceScore: 0,
            missingDates: resolved.missing,
          });
        }
        if (resolved.found.length > 0) {
          dateFilters = { documentIds: resolved.found.map((r) => r._id.toString()) };
          missingDates = resolved.missing;
          logger.info(JSON.stringify({ event: "date_resolution", requested: effectiveDates, found: resolved.found.map((r) => r.reportDate), missing: resolved.missing }));
        }
      }

      const ragQuery = effectiveQuery;
      const previousForRag = shouldExpandFollowUp ? previousQuery : null;

      try {
        const { queryRag } = await import("../services/ragClient.js");
        const ragResponse = await queryRag({ userId, query: ragQuery, filters: dateFilters, previousQuery: previousForRag });

        if (ragResponse.grounded === false && ragResponse.evidenceScore === 0 && ragResponse.rag_available === false) {
          logger.warn(JSON.stringify({ event: "rag_unavailable_propagated", query: ragQuery }));
          return res.json({
            reply: "Document search is temporarily unavailable, so I don't want to make a comparison without retrieving the relevant reports. Please try again in a moment.",
            response: "Document search is temporarily unavailable, so I don't want to make a comparison without retrieving the relevant reports. Please try again in a moment.",
            sources: [],
            grounded: false,
            evidenceScore: 0,
            rag_available: false,
            generation_available: false,
            document_search_unavailable: true,
          });
        }

        if (missingDates.length > 0 && ragResponse.answer) {
          const note = `\n\nNote: no report was found for ${missingDates.join(", ")}.`;
          ragResponse.answer += note;
        }

        const genFailed = ragResponse.answer === "Answer could not be generated at this time.";
        if (genFailed) {
          logger.warn(JSON.stringify({ event: "rag_generation_failed", query: ragQuery, evidenceScore: ragResponse.evidenceScore, grounded: ragResponse.grounded }));
          const fallbackSources = ragResponse.sources || [];
          const fallbackCandidates = ragResponse.candidates || [];
          if (fallbackCandidates.length > 0 || fallbackSources.length > 0) {
            const evidenceLines = (fallbackCandidates.length > 0 ? fallbackCandidates : fallbackSources)
              .slice(0, 5)
              .map((c, i) => `Source ${i + 1}: ${String(c.text || "").slice(0, 300)}`)
              .join("\n\n");
            return res.json({
              response: `I found relevant information but couldn't generate a full summary right now. Here is the retrieved evidence:\n\n${evidenceLines}`,
              reply: `I found relevant information but couldn't generate a full summary right now. Here is the retrieved evidence:\n\n${evidenceLines}`,
              sources: fallbackSources,
              candidates: fallbackCandidates,
              grounded: ragResponse.grounded,
              evidenceScore: ragResponse.evidenceScore,
              generation_available: false,
            });
          }
        }

        return res.json({
          response: ragResponse.answer || ragResponse.reply || "I've reviewed your documents, but couldn't generate a specific answer.",
          reply: ragResponse.answer || ragResponse.reply || "I've reviewed your documents, but couldn't generate a specific answer.",
          sources: ragResponse.sources || [],
          candidates: ragResponse.candidates || [],
          grounded: ragResponse.grounded !== false,
          evidenceScore: ragResponse.evidenceScore || 0,
          rag_available: ragResponse.rag_available !== false,
          generation_available: !genFailed,
          queryType: ragResponse.queryType || "document_query",
          missingDates: missingDates.length > 0 ? missingDates : undefined,
        });
      } catch (ragError) {
        logger.error(`RAG_QUERY_ERROR: ${ragError.message}`);
        const isUnavailable = ragError.ragUnavailable || /temporarily unavailable|503|429/i.test(ragError.message);
        const msg = isUnavailable
          ? "Document search is temporarily unavailable, so I don't want to make a comparison without retrieving the relevant reports. Please try again in a moment."
          : "I couldn't search your documents right now. Please try again shortly. If the issue persists, make sure your reports have been uploaded and indexed.";
        return res.json({
          reply: msg,
          response: msg,
          sources: [],
          grounded: false,
          evidenceScore: 0,
          rag_available: false,
          generation_available: false,
          document_search_unavailable: true,
        });
      }
    }

    if (intent === "out_of_scope") {
      if (looksLikeDocumentQuery(userMessage) || effectiveDates.length > 0) {
        logger.warn(JSON.stringify({ event: "out_of_scope_redirect", raw: userMessage, dates: effectiveDates }));
        return res.json({
          reply: "I can help with your reports. Try: 'what does my July 13 report say?' or 'compare my July 13 and July 23 reports'.",
          response: "I can help with your reports. Try: 'what does my July 13 report say?' or 'compare my July 13 and July 23 reports'.",
          sources: [],
          grounded: false,
        });
      }
      return res.json({
        reply: "Sorry, this is beyond my scope. I can only help with your MedTracker appointments, medications, reports, and other app-related tasks.",
      });
    }

    if (intent === "view_appointments") {
      const appointments = await Appointment.find({ user: userId }).sort({ appointmentDateTime: 1 });

      if (!appointments.length) {
        return res.json({ reply: "You have no appointments scheduled at the moment. Would you like to book one?" });
      }

      const upcoming = appointments.filter((a) => a.status !== "cancelled");
      const cancelled = appointments.filter((a) => a.status === "cancelled");

      let reply = `You have ${upcoming.length} upcoming appointment(s):\n\n`;
      upcoming.forEach((a, i) => {
        reply += formatAppointment(a, i) + "\n\n";
      });

      if (cancelled.length) {
        reply += `\nCancelled (${cancelled.length}):\n`;
        cancelled.forEach((a, i) => {
          reply += `${i + 1}. ${a.doctorName}\n`;
        });
      }

      return res.json({ reply: reply.trim() });
    }

    if (intent === "schedule_appointment") {
      const doctorName = entities.doctorName || "Doctor";

      if (!entities.date && !entities.time) {
        return res.json({
          reply: `Sure! To schedule your appointment, please let me know:\n• Doctor's name\n• Date (e.g., "tomorrow", "March 5th")\n• Time (e.g., "10am", "6pm")`,
        });
      }

      const dateStr = entities.date || new Date().toISOString().split("T")[0];
      const timeStr = entities.time || "10:00";
      const appointmentDateTime = new Date(`${dateStr}T${timeStr}:00+05:30`);

      if (isNaN(appointmentDateTime.getTime())) {
        return res.json({ reply: "I couldn't understand that date/time. Could you rephrase? e.g. 'Book dentist tomorrow at 6pm'" });
      }

      const appointment = await Appointment.create({
        user: userId,
        doctorName,
        specialty: entities.specialty || undefined,
        hospital: entities.hospital || undefined,
        appointmentDateTime,
        notes: entities.notes || undefined,
        status: "scheduled",
      });

      const dt = appointmentDateTime.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      return res.json({
        reply: `Appointment scheduled.\n\nDoctor: ${appointment.doctorName}\nDate & Time: ${dt}${appointment.specialty ? `\nSpecialty: ${appointment.specialty}` : ""}`,
        action: "refresh_appointments",
      });
    }

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

    if (intent === "view_medications") {
      const meds = await Medication.find({ user: userId, status: "active" }).sort({ createdAt: -1 });

      if (!meds.length) {
        return res.json({ reply: "You have no active medications logged. Would you like to add one?" });
      }

      let reply = `Your current medications (${meds.length}):\n\n`;
      meds.forEach((m, i) => {
        reply += formatMedication(m, i) + "\n\n";
      });

      return res.json({ reply: reply.trim() });
    }

    if (intent === "add_medication") {
      if (!entities.medicationName) {
        return res.json({
          reply: `To add a medication, please tell me:\n• Medication name\n• Dosage (e.g., "400mg")\n• How often (e.g., "twice a day", "once daily")\n• Time to take it (e.g., "8am")`,
        });
      }

      const medication = await Medication.create({
        user: userId,
        name: entities.medicationName,
        dosage: entities.dosage || "As prescribed",
        frequency: entities.frequency || "Daily",
        time: entities.medicationTime || "08:00 AM",
        prescribedBy: "Self",
        startDate: new Date(),
        status: "active",
      });

      return res.json({
        reply: `Medication added.\n\n${medication.name} (${medication.dosage})\n${medication.frequency} at ${medication.time}`,
        action: "refresh_medications",
      });
    }

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
      reply: "Sorry, this is beyond my scope. I can only help with your MedTracker appointments, medications, reports, and other app-related tasks. You can also ask me about values or trends in your medical reports.",
    });
  } catch (error) {
    logger.error(`CHATBOT ERROR: ${error.message}`);
    logger.error(error.stack);
    return res.status(500).json({ error: "AI request failed. Please try again." });
  }
};

async function resolveReportsForDates(userId, isoDates) {
  const found = [];
  const missing = [];
  for (const iso of isoDates) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) {
      missing.push(iso);
      continue;
    }
    const start = new Date(d);
    start.setHours(0, 0, 0, 0);
    const end = new Date(d);
    end.setHours(23, 59, 59, 999);
    const report = await Report.findOne({ user: userId, reportDate: { $gte: start, $lte: end } }).lean();
    if (report) found.push(report);
    else missing.push(iso);
  }
  return { found, missing };
}
