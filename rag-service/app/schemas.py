"""Pydantic request/response schemas for the RAG API."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class IndexRequest(BaseModel):
    userId: str
    documentId: str
    type: str
    reportDate: str | None = None  # ISO date
    sourceFilename: str | None = None
    text: str
    pages: list[str] | None = None  # optional per-page text (preserves page numbers)


class IndexResponse(BaseModel):
    indexed: bool
    documentId: str
    chunkCount: int
    error: str | None = None


class QueryFilters(BaseModel):
    documentTypes: list[str] | None = None
    dateFrom: str | None = None
    dateTo: str | None = None
    sections: list[str] | None = None
    documentIds: list[str] | None = None


class QueryRequest(BaseModel):
    userId: str
    query: str
    # Optional prior turn for context-dependent rewriting (see app/rewrite.py).
    previousQuery: str | None = None
    filters: QueryFilters | None = None
    conversationId: str | None = None


class ChunkOut(BaseModel):
    chunkId: str
    documentId: str
    page: int | None = None
    section: str | None = None
    sourceFilename: str | None = None
    score: float
    text: str


class SourceOut(BaseModel):
    documentId: str
    sourceFilename: str | None = None
    page: int | None = None
    section: str | None = None
    score: float


class QueryResponse(BaseModel):
    query: str
    rewrittenQuery: str | None = None
    grounded: bool = False
    # Relevance/grounding signal (NOT a calibrated probability; see ADR-016).
    evidenceScore: float = 0.0
    answer: str = ""
    sources: list[SourceOut] = Field(default_factory=list)
    # Retrieved evidence (for UI "Retrieved Evidence" panel).
    candidates: list[ChunkOut] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    store: str
    detail: dict[str, Any] = Field(default_factory=dict)


class DeleteRequest(BaseModel):
    userId: str


class DeleteResponse(BaseModel):
    deleted: bool
    documentId: str
    chunkCount: int
