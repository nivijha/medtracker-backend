"""Retrieval store: interface + in-memory (tests/dev) + PostgreSQL/pgvector.

Both implementations share the same contract so the FastAPI app can run with the
in-memory store when no DATABASE_URL is configured (local dev / unit tests), and
with pgvector in production. Patient isolation (user_id filter) is mandatory in both.
"""
from __future__ import annotations

import math
import os
import uuid
from abc import ABC, abstractmethod
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from .config import settings


def filters_to_dict(f: Any | None) -> dict:
    if f is None:
        return {}
    return {
        "documentTypes": getattr(f, "documentTypes", None),
        "dateFrom": getattr(f, "dateFrom", None),
        "dateTo": getattr(f, "dateTo", None),
        "sections": getattr(f, "sections", None),
        "documentIds": getattr(f, "documentIds", None),
    }


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def _rrf(ranked_ids: list[list[str]], k: int = 60) -> dict[str, float]:
    scores: dict[str, float] = {}
    for ranking in ranked_ids:
        for rank, cid in enumerate(ranking, start=1):
            scores[cid] = scores.get(cid, 0.0) + 1.0 / (k + rank)
    return scores


def _latest_chunks(chunks: list[dict]) -> dict[str, dict]:
    """Given a list of chunks for the same document_id, return only the latest version per chunk_id."""
    latest: dict[str, dict] = {}
    for c in chunks:
        cid = c["chunk_id"]
        if cid not in latest or c["updated_at"] > latest[cid]["updated_at"]:
            latest[cid] = c
    return latest


class RetrievalStore(ABC):
    @abstractmethod
    def index_chunks(self, chunks: list[dict[str, Any]]) -> int:
        ...

    @abstractmethod
    def delete_document(self, user_id: str, document_id: str) -> int:
        ...

    @abstractmethod
    def hybrid_search(
        self,
        user_id: str,
        query: str,
        query_vec: list[float],
        top_k: int = 10,
        filters: dict | None = None,
    ) -> list[dict[str, Any]]:
        ...

    @abstractmethod
    def health(self) -> dict[str, Any]:
        ...


class InMemoryRetrievalStore(RetrievalStore):
    def __init__(self) -> None:
        self._chunks: list[dict[str, Any]] = []

    def index_chunks(self, chunks: list[dict[str, Any]]) -> int:
        # Idempotent by document_id: replace existing chunks for that document.
        doc_ids = {c["document_id"] for c in chunks}
        self._chunks = [c for c in self._chunks if c["document_id"] not in doc_ids]
        self._chunks.extend(chunks)
        return len(chunks)

    def delete_document(self, user_id: str, document_id: str) -> int:
        before = len(self._chunks)
        self._chunks = [
            c for c in self._chunks if not (c["user_id"] == user_id and c["document_id"] == document_id)
        ]
        return before - len(self._chunks)

    def _apply_filters(self, user_id: str, filters: dict | None) -> list[dict[str, Any]]:
        out = [c for c in self._chunks if c["user_id"] == user_id]
        if not filters:
            return out
        if filters.get("documentTypes"):
            out = [c for c in out if c["doc_type"] in filters["documentTypes"]]
        if filters.get("documentIds"):
            out = [c for c in out if c["document_id"] in filters["documentIds"]]
        if filters.get("sections"):
            out = [c for c in out if c.get("section") in filters["sections"]]
        if filters.get("dateFrom"):
            df = date.fromisoformat(filters["dateFrom"])
            out = [c for c in out if c.get("report_date") and c["report_date"] >= df]
        if filters.get("dateTo"):
            dt = date.fromisoformat(filters["dateTo"])
            out = [c for c in out if c.get("report_date") and c["report_date"] <= dt]
        return out

    def _vector_scores(self, pool, query_vec) -> dict[str, float]:
        """Absolute cosine similarity per chunk; exposed to grounding so the
        semantic retrieval signal survives even when RRF ranks are tied."""
        return {c["chunk_id"]: _cosine(query_vec, c["embedding"]) for c in pool}

    def _keyword_rank(self, pool, query) -> list[str]:
        toks = [t for t in query.lower().split() if len(t) > 2]
        if not toks:
            return []
        scored = []
        for c in pool:
            text = (c.get("chunk_text") or "").lower()
            s = sum(text.count(t) for t in toks)
            if s > 0:
                scored.append((c["chunk_id"], s))
        scored.sort(key=lambda x: x[1], reverse=True)
        return [cid for cid, _ in scored]

    def hybrid_search(self, user_id, query, query_vec, top_k=10, filters=None) -> list[dict[str, Any]]:
        pool = self._apply_filters(user_id, filters)
        if not pool:
            return []
        sims = self._vector_scores(pool, query_vec)
        v_rank = sorted(sims, key=lambda cid: sims[cid], reverse=True)
        k_rank = self._keyword_rank(pool, query)
        fused = _rrf([v_rank, k_rank], k=settings.rrf_k)
        ordered = sorted(fused.keys(), key=lambda cid: fused[cid], reverse=True)[:top_k]
        by_id = {c["chunk_id"]: c for c in pool}
        result = []
        for cid in ordered:
            c = dict(by_id[cid])
            # "score" = fused hybrid (vector + keyword -> RRF) retrieval score.
            c["score"] = round(fused[cid], 6)
            c["similarity"] = round(sims[cid], 6)
            result.append(c)
        return result

    def health(self) -> dict[str, Any]:
        return {"store": "in-memory", "chunk_count": len(self._chunks)}


class PostgresRetrievalStore(RetrievalStore):
    def __init__(self, database_url: str) -> None:
        from sqlalchemy import create_engine

        # Accept plain "postgresql://" URLs (e.g., from Render) and route them
        # through psycopg 3, which is what requirements.txt installs.
        url = database_url
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg://", 1)
        elif url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg://", 1)

        self._engine = create_engine(url, future=True)
        self._init_schema()

    def _init_schema(self) -> None:
        from sqlalchemy import text as sa_text

        from .db_models import Base, DocumentChunk

        with self._engine.begin() as conn:
            conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        Base.metadata.create_all(self._engine)

    def index_chunks(self, chunks: list[dict[str, Any]]) -> int:
        from sqlalchemy import delete
        from sqlalchemy.orm import Session
        from .db_models import DocumentChunk

        doc_ids = {c["document_id"] for c in chunks}
        with Session(self._engine) as session, session.begin():
            for did in doc_ids:
                # Delete old chunks for this document to ensure versioning
                session.execute(
                    delete(DocumentChunk).where(DocumentChunk.document_id == did)
                )
            for c in chunks:
                session.add(
                    DocumentChunk(
                        chunk_id=c.get("chunk_id") or uuid.uuid4(),
                        document_id=c["document_id"],
                        user_id=c["user_id"],
                        doc_type=c["doc_type"],
                        report_date=c.get("report_date"),
                        page=c.get("page"),
                        section=c.get("section"),
                        source_filename=c.get("source_filename"),
                        chunk_text=c["chunk_text"],
                        embedding=c["embedding"],
                        updated_at=date.today(),
                        document_version=c.get("document_version", "v1"),
                    )
                )
            session.commit()
        return len(chunks)

    def delete_document(self, user_id: str, document_id: str) -> int:
        from sqlalchemy import delete, select, func

        from .db_models import DocumentChunk

        with self._engine.begin() as conn:
            count = conn.scalar(
                select(func.count()).select_from(DocumentChunk).where(
                    DocumentChunk.user_id == user_id, DocumentChunk.document_id == document_id
                )
            )
            conn.execute(
                delete(DocumentChunk).where(
                    DocumentChunk.user_id == user_id, DocumentChunk.document_id == document_id
                )
            )
        return int(count or 0)

    def hybrid_search(self, user_id, query, query_vec, top_k=10, filters=None) -> list[dict[str, Any]]:
        from sqlalchemy import func, select, text as sa_text

        from .db_models import DocumentChunk

        f = filters or {}
        stmt = select(DocumentChunk).where(DocumentChunk.user_id == user_id)
        if f.get("documentTypes"):
            stmt = stmt.where(DocumentChunk.doc_type.in_(f["documentTypes"]))
        if f.get("documentIds"):
            stmt = stmt.where(DocumentChunk.document_id.in_(f["documentIds"]))
        if f.get("sections"):
            stmt = stmt.where(DocumentChunk.section.in_(f["sections"]))
        if f.get("dateFrom"):
            stmt = stmt.where(DocumentChunk.report_date >= date.fromisoformat(f["dateFrom"]))
        if f.get("dateTo"):
            stmt = stmt.where(DocumentChunk.report_date <= date.fromisoformat(f["dateTo"]))

        # Session.execute() materializes select(DocumentChunk) into ORM objects
        # (r.chunk_id, r.document_id, ...). A raw Connection.execute() would
        # return plain rows and .scalars() yields just the UUID primary key.
        with Session(self._engine) as session:
            rows = list(session.execute(stmt).scalars().all())

        if not rows:
            return []

        def to_dict(r: DocumentChunk) -> dict[str, Any]:
            return {
                "chunk_id": str(r.chunk_id),
                "document_id": r.document_id,
                "user_id": r.user_id,
                "doc_type": r.doc_type,
                "report_date": r.report_date,
                "page": r.page,
                "section": r.section,
                "source_filename": r.source_filename,
                "chunk_text": r.chunk_text,
                "embedding": list(r.embedding),
            }

        pool = [to_dict(r) for r in rows]
        vec_ids = [str(r.chunk_id) for r in rows]
        # vector ranking via pgvector cosine distance
        vstmt = (
            select(DocumentChunk.chunk_id, DocumentChunk.embedding.cosine_distance(query_vec).label("d"))
            .where(DocumentChunk.user_id == user_id)
        )
        if f.get("documentTypes"):
            vstmt = vstmt.where(DocumentChunk.doc_type.in_(f["documentTypes"]))
        if f.get("documentIds"):
            vstmt = vstmt.where(DocumentChunk.document_id.in_(f["documentIds"]))
        if f.get("sections"):
            vstmt = vstmt.where(DocumentChunk.section.in_(f["sections"]))
        if f.get("dateFrom"):
            vstmt = vstmt.where(DocumentChunk.report_date >= date.fromisoformat(f["dateFrom"]))
        if f.get("dateTo"):
            vstmt = vstmt.where(DocumentChunk.report_date <= date.fromisoformat(f["dateTo"]))
        vstmt = vstmt.order_by("d").limit(max(top_k * 3, 50))
        with self._engine.begin() as conn:
            vres = conn.execute(vstmt).all()
        v_rank = [str(cid) for cid, _ in vres]
        # pgvector cosine distance d = 1 - cosine similarity. Keep the absolute
        # semantic signal per chunk (RRF ranks alone cannot express it).
        sim_by_id = {str(cid): 1.0 - float(d) for cid, d in vres}

        # keyword ranking via Postgres FTS
        pts = func.plainto_tsquery("english", query)
        kstmt = (
            select(DocumentChunk.chunk_id, func.ts_rank(func.to_tsvector("english", DocumentChunk.chunk_text), pts).label("r"))
            .where(DocumentChunk.user_id == user_id)
            .where(func.to_tsvector("english", DocumentChunk.chunk_text).op("@@")(pts))
        )
        if f.get("documentTypes"):
            kstmt = kstmt.where(DocumentChunk.doc_type.in_(f["documentTypes"]))
        if f.get("documentIds"):
            kstmt = kstmt.where(DocumentChunk.document_id.in_(f["documentIds"]))
        if f.get("sections"):
            kstmt = kstmt.where(DocumentChunk.section.in_(f["sections"]))
        if f.get("dateFrom"):
            kstmt = kstmt.where(DocumentChunk.report_date >= date.fromisoformat(f["dateFrom"]))
        if f.get("dateTo"):
            kstmt = kstmt.where(DocumentChunk.report_date <= date.fromisoformat(f["dateTo"]))
        kstmt = kstmt.order_by("r").limit(max(top_k * 3, 50))
        with self._engine.begin() as conn:
            kres = conn.execute(kstmt).all()
        k_rank = [str(cid) for cid, _ in kres]

        fused = _rrf([v_rank, k_rank], k=settings.rrf_k)
        # restrict to fused keys that exist in pool
        by_id = {str(c["chunk_id"]): c for c in pool}
        ordered = [cid for cid in sorted(fused.keys(), key=lambda x: fused[x], reverse=True) if cid in by_id][:top_k]
        result = []
        for cid in ordered:
            c = dict(by_id[cid])
            # "score" = fused hybrid (pgvector + FTS -> RRF) retrieval score.
            c["score"] = round(fused[cid], 6)
            if cid in sim_by_id:
                c["similarity"] = round(sim_by_id[cid], 6)
            result.append(c)
        return result

    def health(self) -> dict[str, Any]:
        try:
            with self._engine.connect() as conn:
                from sqlalchemy import text as sa_text

                conn.execute(sa_text("SELECT 1"))
            return {"store": "postgres", "ok": True}
        except Exception as e:  # pragma: no cover
            return {"store": "postgres", "ok": False, "error": str(e)}


_DEFAULT_STORE: RetrievalStore | None = None


def get_default_store() -> RetrievalStore:
    global _DEFAULT_STORE
    if _DEFAULT_STORE is None:
        db_url = settings.pg_rag_database_url or settings.database_url
        if db_url:
            # In production (embedding_provider=api), PostgreSQL is required.
            # Fail fast with a clear error if connection fails.
            provider = getattr(settings, "embedding_provider", "local")
            if provider == "api":
                try:
                    _DEFAULT_STORE = PostgresRetrievalStore(db_url)
                    # Test connection
                    _ = _DEFAULT_STORE.health()
                except Exception as e:
                    raise RuntimeError(
                        f"Failed to connect to PostgreSQL at PG_RAG_DATABASE_URL: {e}"
                    ) from e
            else:
                # Local dev: try PostgreSQL, fall back to in-memory
                try:
                    _DEFAULT_STORE = PostgresRetrievalStore(db_url)
                    _ = _DEFAULT_STORE.health()
                except Exception:
                    _DEFAULT_STORE = InMemoryRetrievalStore()
        else:
            # No database URL configured: use in-memory (local dev only)
            _DEFAULT_STORE = InMemoryRetrievalStore()
    return _DEFAULT_STORE
