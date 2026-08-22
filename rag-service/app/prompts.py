"""System prompts for grounded generation (Phase 2)."""
from __future__ import annotations

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
    lines.append("ANSWER (from evidence only):")
    return "\n".join(lines)
