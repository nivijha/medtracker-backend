"""Query rewriting — only when a query is context-dependent (MODIFY #4).

v1 heuristic: a follow-up that contains anaphoric pronouns/references is rewritten
by concatenating the previous query. Queries without context, or that are already
self-contained, are passed through unchanged (no unnecessary LLM rewriter calls).
"""
from __future__ import annotations

import re

# Anaphoric references that signal a follow-up depends on prior context.
_CONTEXT_MARKERS = re.compile(
    r"\b(it|its|this|that|these|those|they|them|he|she|his|her|"
    r"the patient|the medication|the drug|the test|the result)\b",
    re.IGNORECASE,
)


def is_context_dependent(query: str) -> bool:
    return bool(_CONTEXT_MARKERS.search(query))


def rewrite_query(query: str, previous_query: str | None) -> str:
    """Return a de-contextualized query, or the original if no rewrite is warranted."""
    if not previous_query or not previous_query.strip():
        return query
    if not is_context_dependent(query):
        return query
    # Concatenative rewrite for v1; a model-based rewriter is future work (Phase 4+).
    return f"{previous_query.strip()} {query.strip()}"
