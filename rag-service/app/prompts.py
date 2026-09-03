from __future__ import annotations

import re

GROUNDING_SYSTEM_PROMPT = """You are a Medical Record Assistant for a personal health-record app.
Your ONLY job is to retrieve, summarize, compare, and explain information that is
explicitly present in the provided EVIDENCE (retrieved chunks from the user's own
medical records).

Rules:
- Answer strictly from the EVIDENCE. Do not use any knowledge not in the EVIDENCE.
- If the EVIDENCE does not contain the answer, say you could not find it in the
  available records. Do NOT invent values, dates, medications, or diagnoses.
- This is NOT a diagnostic or treatment system. Do NOT recommend medications or
  treatments, and do NOT diagnose conditions. If asked, state that you can only
  summarize the records.
- Be concise. Cite which source each fact came from using the source labels.
- Preserve exact numbers and units as written in the EVIDENCE (e.g., "LDL 142 mg/dL").
"""

_DATE_TOKEN_RE = re.compile(
    r"(?:\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t)?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b"
    r"|20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2})",
    re.IGNORECASE,
)


def _mentions_multiple_dates(query: str) -> bool:
    tokens = _DATE_TOKEN_RE.findall(query)
    if len(tokens) >= 2:
        return True
    iso_dates = re.findall(r"20\d{2}-\d{2}-\d{2}", query)
    if len(iso_dates) >= 2:
        return True
    explicit_month_day = re.findall(
        r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?\b",
        query,
        re.IGNORECASE,
    )
    if len(explicit_month_day) >= 2:
        return True
    explicit_day_month = re.findall(
        r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b",
        query,
        re.IGNORECASE,
    )
    if len(explicit_day_month) >= 2:
        return True
    ordinals = re.findall(r"\b\d{1,2}(?:st|nd|rd|th)\b", query)
    if len(ordinals) >= 2 and re.search(r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", query, re.IGNORECASE):
        return True
    return False


def build_user_prompt(query: str, candidates: list[dict], context: str | None = None) -> str:
    ev = []
    for i, c in enumerate(candidates, start=1):
        src = f"[src {i}] doc={c.get('document_id')} page={c.get('page')} section={c.get('section')}"
        ev.append(f"{src}\n{c.get('chunk_text', '')}")
    lines = [
        "EVIDENCE:",
        "\n---\n".join(ev),
        "",
        f"USER QUESTION: {query}",
    ]
    if context:
        lines.append(f"CONVERSATION CONTEXT: {context}")
    if _mentions_multiple_dates(query):
        lines.append(
            "When the question compares two or more dates, group evidence by report_date. "
            "Contrast matching markers side-by-side (e.g. HbA1c, FSH, LH, eAG) as "
            "\"July 13: — / July 23: 5.6% [src 2]\"; quote each value verbatim with its unit. "
            "State explicitly when a marker exists for only one date instead of hedging."
        )
    lines.append("ANSWER (from evidence only):")
    return "\n".join(lines)
