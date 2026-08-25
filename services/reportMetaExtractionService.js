import logger from "../utils/logger.js";
import { extractTextFromPdf, isPdfBuffer } from "./pdfExtractionService.js";
import { generateGeminiText } from "../config/gemini.js";

const DATE_JSON_SYSTEM_PROMPT = `You are a medical report date extractor. Given the text of a medical document, extract the examination/report date.

Return ONLY a single JSON object on one line, no markdown, no code fences, no explanation.
Format: {"reportDate":"YYYY-MM-DD"} if a date is found, or {"reportDate":null} if not found.

Rules:
- Use the examination/report/collection date, not printing/upload dates if distinguishable.
- Normalize to YYYY-MM-DD. If only month/year is present, use first day of that month.
- If multiple dates exist, pick the primary examination date.
- Never invent a date. If uncertain or not present, return null.`;

const safeParseReportDate = (value) => {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getFullYear() < 1900 || d.getFullYear() > 2100) return null;
  return d;
};

const extractJsonDate = (text) => {
  const match = text.match(/\{[^}]*"reportDate"[^}]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    return safeParseReportDate(parsed.reportDate);
  } catch {
    return null;
  }
};

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const tryBuildDate = (y, m, d) => {
  const yy = parseInt(y, 10);
  const mm = parseInt(m, 10) - 1;
  const dd = parseInt(d, 10);
  const dt = new Date(yy, mm, dd);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getFullYear() !== yy || dt.getMonth() !== mm || dt.getDate() !== dd) return null;
  if (yy < 1900 || yy > 2100) return null;
  return dt;
};

const regexFallback = (text) => {
  const t = text.slice(0, 8000);
  const candidates = [];

  let m;
  const isoRe = /\b(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})\b/g;
  while ((m = isoRe.exec(t)) !== null) {
    const dt = tryBuildDate(m[1], m[2], m[3]);
    if (dt) candidates.push(dt);
  }

  const euRe = /\b(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})\b/g;
  while ((m = euRe.exec(t)) !== null) {
    const dt = tryBuildDate(m[3], m[2], m[1]) || tryBuildDate(m[3], m[1], m[2]);
    if (dt) candidates.push(dt);
  }

  const textualRe = /\b(\d{1,2})\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})\b/gi;
  while ((m = textualRe.exec(t)) !== null) {
    const day = m[1];
    const mon = MONTHS[m[2].slice(0, 3).toLowerCase()];
    const year = m[3];
    if (mon !== undefined) {
      const dt = new Date(parseInt(year, 10), mon, parseInt(day, 10));
      if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1900 && dt.getFullYear() <= 2100) candidates.push(dt);
    }
  }

  const textualRe2 = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/gi;
  while ((m = textualRe2.exec(t)) !== null) {
    const mon = MONTHS[m[1].slice(0, 3).toLowerCase()];
    const day = m[2];
    const year = m[3];
    if (mon !== undefined) {
      const dt = new Date(parseInt(year, 10), mon, parseInt(day, 10));
      if (!Number.isNaN(dt.getTime()) && dt.getFullYear() >= 1900 && dt.getFullYear() <= 2100) candidates.push(dt);
    }
  }

  return candidates.length ? candidates[0] : null;
};

export const extractReportDateFromText = async (text) => {
  if (!text || !text.trim()) return null;

  const truncated = text.slice(0, 15000);

  try {
    const raw = await generateGeminiText(DATE_JSON_SYSTEM_PROMPT, truncated);
    const parsed = extractJsonDate(raw);
    if (parsed) {
      logger.info("REPORT_DATE_EXTRACTED: gemini");
      return parsed;
    }
  } catch (err) {
    logger.warn(`REPORT_DATE_GEMINI_FAILED: ${err.message}`);
  }

  const fallback = regexFallback(truncated);
  if (fallback) logger.info("REPORT_DATE_EXTRACTED: regex");
  return fallback;
};

export const extractReportDateFromBuffer = async (buffer) => {
  try {
    if (!isPdfBuffer(buffer)) return null;
    const text = await extractTextFromPdf(buffer);
    if (!text || !text.trim()) return null;
    return await extractReportDateFromText(text);
  } catch (err) {
    logger.warn(`REPORT_DATE_BUFFER_FAILED: ${err.message}`);
    return null;
  }
};
