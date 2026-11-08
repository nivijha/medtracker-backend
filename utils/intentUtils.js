const REPORT_KEYWORDS = [
  "report", "reports", "test result", "test results", "lab", "labs",
  "health", "value", "values", "trend", "change", "comparison", "compare",
  "summary", "summarize",
];

const DATE_HINT_RE = /(\d{1,2}(?:st|nd|rd|th)?\s*(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?|\d{4}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\b\d{1,2}(?:st|nd|rd|th)?\b)/i;

const FOLLOW_UP_RE = /^(for|what about|and|how about|the|also)\b/i;

export function getAssistantHelpIntent(text) {
  if (!text || !text.trim()) return null;
  const t = text.toLowerCase().trim();

  if (/\bwho\s+(?:are|r)\s+you\b|\bwhat\s+is\s+your\s+(?:name|role)\b|\bintroduce\s+yourself\b/.test(t)) {
    return "identity";
  }

  if (
    /\bwhat\s+can\s+(?:you|i)\s+(?:do|ask)\b/.test(t) ||
    /\bhow\s+can\s+you\s+help\b/.test(t) ||
    /\bwhat\s+do\s+you\s+help\s+with\b/.test(t) ||
    /\bwhat\s+are\s+you\s+able\s+to\s+do\b/.test(t) ||
    /\bcan\s+you\s+(?:do|help)\b/.test(t)
  ) {
    return "capabilities";
  }

  return null;
}

export function hasReportKeyword(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return REPORT_KEYWORDS.some((k) => t.includes(k));
}

export function looksLikeDocumentQuery(text) {
  if (!text || !text.trim()) return false;
  const t = text.toLowerCase().trim();

  if (hasReportKeyword(t)) return true;

  const hasWhatIsHealth = /what\s+is\s+(the\s+)?health/i.test(t);
  const hasTellMe = /tell\s+me\s+about/i.test(t);
  const hasWhatChanged = /what\s+(changed|happened)/i.test(t);
  const hasHowDid = /how\s+did\s+(my\s+)?(health|report)/i.test(t);
  if (hasWhatIsHealth || hasTellMe || hasWhatChanged || hasHowDid) return true;

  if (DATE_HINT_RE.test(t) && FOLLOW_UP_RE.test(t)) return true;

  if (DATE_HINT_RE.test(t) && t.length < 60) return true;

  return false;
}

export function isFollowUp(text, previousQuery) {
  if (!previousQuery || !previousQuery.trim()) return false;
  if (!text || !text.trim()) return false;
  const t = text.trim();
  if (t.length < 50 && (DATE_HINT_RE.test(t) || FOLLOW_UP_RE.test(t))) return true;
  const trimmed = t.toLowerCase();
  if (/^(for|what about|and|how about|the)\b/.test(trimmed)) return true;
  return false;
}

export function rewriteShortFollowUp(shortQuery, previousQuery) {
  if (!shortQuery || !previousQuery) return shortQuery;
  const t = shortQuery.trim();
  if (/^(for|what about|and|how about|the|also)\b/i.test(t)) {
    return `${previousQuery.trim()} ${t}`;
  }
  if (t.length < 60 && DATE_HINT_RE.test(t)) {
    return `${previousQuery.trim()} ${t}`;
  }
  return `${previousQuery.trim()} ${t}`;
}
