"""Ingestion: text -> chunks with preserved metadata.

Phase 1 chunking is section/page-aware where the source provides page text,
and uses a sliding window with overlap otherwise. Chunk size/overlap are
initial defaults validated by experiment (docs/experiments/EXP-001).
"""
from __future__ import annotations

import re
import uuid
from datetime import date
from typing import Any


_SECTION_RE = re.compile(r"^\s*(?:[A-Z][A-Z0-9 /&()\-]{3,}|[0-9]+[\.\)]\s+[A-Z][A-Za-z ]{2,})\s*[:\-\.]?\s*$", re.MULTILINE)


def _split_paragraphs(text: str) -> list[str]:
    # Keep blank-line separated blocks; fall back to sentence splits.
    parts = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if not parts:
        parts = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
    return parts or [text.strip()]


def _is_heading(line: str) -> bool:
    # Single-line heading detection (no embedded newline).
    return "\n" not in line and bool(_SECTION_RE.match(line)) and len(line.strip()) < 80


def chunk_text(
    text: str,
    chunk_size: int = 1500,
    overlap: int = 200,
) -> list[dict[str, Any]]:
    """Line-aware window chunking that preserves section context.

    Heading-like lines set the current `section` for following chunks. Chunks are
    bounded by `chunk_size` characters with a tail `overlap` carried into the next
    chunk. `page` is None here; callers with per-page text use chunk_pages().
    """
    chunks: list[dict[str, Any]] = []
    current: list[str] = []
    current_len = 0
    current_section: str | None = None

    def flush():
        nonlocal current, current_len, current_section
        if current:
            body = " ".join(current).strip()
            if body:
                chunks.append({"text": body, "section": current_section, "page": None})
            current = []
            current_len = 0

    for raw in text.split("\n"):
        s = raw.strip()
        if not s:
            continue
        if _is_heading(s):
            flush()
            current_section = s.strip().rstrip(":-.").strip()
            continue
        current.append(s)
        current_len += len(s) + 1
        if current_len >= chunk_size:
            chunks.append({"text": " ".join(current).strip(), "section": current_section, "page": None})
            tail = (" ".join(current))[-overlap:] if overlap else ""
            current = [tail] if tail else []
            current_len = len(tail) + 1 if tail else 0
    flush()
    return chunks


def chunk_pages(
    pages: list[str],
    chunk_size: int = 1500,
    overlap: int = 200,
) -> list[dict[str, Any]]:
    """Chunk a list of per-page texts, preserving page numbers."""
    out: list[dict[str, Any]] = []
    for idx, page_text in enumerate(pages, start=1):
        for c in chunk_text(page_text, chunk_size, overlap):
            out.append({**c, "page": idx})
    return out


def build_chunks(
    *,
    document_id: str,
    user_id: str,
    doc_type: str,
    report_date: str | None,
    source_filename: str | None,
    text: str,
    pages: list[str] | None = None,
    chunk_size: int = 1500,
    overlap: int = 200,
) -> list[dict[str, Any]]:
    """Produce fully-formed chunk records (without embeddings)."""
    raw = chunk_pages(pages, chunk_size, overlap) if pages else chunk_text(text, chunk_size, overlap)
    parsed_date = None
    if report_date:
        try:
            parsed_date = date.fromisoformat(report_date)
        except ValueError:
            parsed_date = None
    chunks = []
    for c in raw:
        chunks.append(
            {
                "chunk_id": str(uuid.uuid4()),
                "document_id": document_id,
                "user_id": user_id,
                "doc_type": doc_type,
                "report_date": parsed_date,
                "page": c["page"],
                "section": c["section"],
                "source_filename": source_filename,
                "chunk_text": c["text"],
            }
        )
    return chunks
