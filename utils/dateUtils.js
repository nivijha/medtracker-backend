const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function inferYear(yearStr) {
  if (yearStr) return parseInt(yearStr, 10);
  const now = new Date();
  return now.getFullYear();
}

function toISO(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function extractDates(text) {
  if (!text || !text.trim()) return [];
  const raw = text.toLowerCase();
  const results = [];
  const seen = new Set();

  function push(year, month, day) {
    if (!month || month < 1 || month > 12 || !day || day < 1 || day > 31) return;
    const y = inferYear(year);
    const iso = toISO(y, month, day);
    if (!seen.has(iso)) {
      seen.add(iso);
      results.push(iso);
    }
  }

  const monthsPattern = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

  let m;

  const isoRe = /(\d{4})-(\d{1,2})-(\d{1,2})/g;
  while ((m = isoRe.exec(raw)) !== null) {
    push(m[1], parseInt(m[2], 10), parseInt(m[3], 10));
  }

  const dmySlash = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  while ((m = dmySlash.exec(raw)) !== null) {
    push(m[3], parseInt(m[2], 10), parseInt(m[1], 10));
  }

  const sharedMonthRe = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:and|&|,)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthsPattern})\\s*(?:,?\\s*(\\d{4}))?`, "g");
  while ((m = sharedMonthRe.exec(raw)) !== null) {
    const month = MONTHS[m[3]];
    const year = m[4] || null;
    push(year, month, parseInt(m[1], 10));
    push(year, month, parseInt(m[2], 10));
  }

  const dayMonthYearOrd = new RegExp(`(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthsPattern})\\s*(?:,?\\s*(\\d{4}))?`, "g");
  while ((m = dayMonthYearOrd.exec(raw)) !== null) {
    push(m[3] || null, MONTHS[m[2]], parseInt(m[1], 10));
  }

  const monthDayOrd = new RegExp(`(${monthsPattern})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:,?\\s*(\\d{4}))?`, "g");
  while ((m = monthDayOrd.exec(raw)) !== null) {
    push(m[3] || null, MONTHS[m[1]], parseInt(m[2], 10));
  }

  return results;
}

export function extractDatesWithContext(text, previousQuery) {
  const dates = extractDates(text);
  if (dates.length > 0) return dates;

  if (!previousQuery || !previousQuery.trim()) return [];

  const prevDates = extractDates(previousQuery);
  if (prevDates.length === 0) return [];

  const dayOnlyRe = /(\d{1,2})(?:st|nd|rd|th)?/g;
  const days = [];
  let dm;
  while ((dm = dayOnlyRe.exec(text.toLowerCase())) !== null) {
    const d = parseInt(dm[1], 10);
    if (d >= 1 && d <= 31) days.push(d);
  }
  if (days.length === 0) return [];

  const monthsPattern = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
  const monthInPrev = new RegExp(`(${monthsPattern})`, "i").exec(previousQuery);
  if (!monthInPrev) return [];
  const monthNum = MONTHS[monthInPrev[1].toLowerCase()];

  const yearInPrev = /(\d{4})/.exec(previousQuery);
  const year = yearInPrev ? yearInPrev[1] : null;

  const out = [];
  const seen = new Set();
  for (const d of days) {
    const iso = toISO(inferYear(year), monthNum, d);
    if (!seen.has(iso)) {
      seen.add(iso);
      out.push(iso);
    }
  }
  return out;
}

export function isDateOnlyFollowUp(text) {
  if (!text || !text.trim()) return false;
  const t = text.trim().toLowerCase();
  if (t.length > 80) return false;
  if (t.length >= 40) return false;
  const shortMonth = Object.keys(MONTHS).some((m) => t.includes(m));
  const hasDay = /\b\d{1,2}(?:st|nd|rd|th)?\b/.test(t);
  const hasForOrWhatAbout = /^(for|what about|and|how about|the|also)\b/.test(t);
  return (shortMonth || hasDay) && (t.length < 40 || hasForOrWhatAbout);
}
