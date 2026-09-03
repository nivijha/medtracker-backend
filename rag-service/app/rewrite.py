from __future__ import annotations

import re

_CONTEXT_MARKERS = re.compile(
    r"\b(it|its|this|that|these|those|they|them|he|she|his|her|"
    r"the patient|the medication|the drug|the test|the result)\b",
    re.IGNORECASE,
)

_DATE_ONLY_RE = re.compile(
    r"^\s*(?:for|what about|and|how about|the|also)?\s*"
    r"(?:\d{1,2}(?:st|nd|rd|th)?\s*(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*"
    r"|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?"
    r"|\d{1,2}(?:st|nd|rd|th)?)\s*\??\s*$",
    re.IGNORECASE,
)


def is_context_dependent(query: str) -> bool:
    if _CONTEXT_MARKERS.search(query):
        return True
    if _DATE_ONLY_RE.match(query.strip()):
        return True
    return False


def rewrite_query(query: str, previous_query: str | None) -> str:
    if not previous_query or not previous_query.strip():
        return query
    if not is_context_dependent(query):
        return query
    return f"{previous_query.strip()} {query.strip()}"
