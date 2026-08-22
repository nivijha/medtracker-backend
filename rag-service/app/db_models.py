"""SQLAlchemy models for the pgvector retrieval store."""
from __future__ import annotations

import uuid
from datetime import date
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Date, Integer, String, Text, create_engine, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class DocumentChunk(Base):
    __tablename__ = "document_chunks"

    chunk_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[str] = mapped_column(String, index=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    doc_type: Mapped[str] = mapped_column(String, index=True)
    report_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    section: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    source_filename: Mapped[str | None] = mapped_column(String, nullable=True)
    chunk_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[list[float]] = mapped_column(Vector(384))
    updated_at: Mapped[date] = mapped_column(Date, nullable=False, server_default=func.now())
    document_version: Mapped[str] = mapped_column(String, nullable=False, server_default="v1")
