#!/usr/bin/env python3
"""Initialize the pgvector schema for the RAG service.

Run this once per database to create the `vector` and `pgcrypto` extensions
and the `document_chunk` table. Uses the same connection logic as the service
(`get_default_store` prefers PG_RAG_DATABASE_URL then DATABASE_URL).

Usage:
    python -m scripts.init_pgvector
    PG_RAG_DATABASE_URL=postgresql://... python -m scripts.init_pgvector
"""
from __future__ import annotations

import os
import sys

from app.config import settings


def main() -> int:
    db_url = settings.pg_rag_database_url or settings.database_url
    if not db_url:
        print("ERROR: No database URL configured. Set PG_RAG_DATABASE_URL or DATABASE_URL.", file=sys.stderr)
        return 1

    try:
        from sqlalchemy import create_engine, text as sa_text
        from app.db_models import Base
    except ImportError as e:
        print(f"ERROR: Missing dependency: {e}", file=sys.stderr)
        return 1

    print(f"Connecting to {db_url.split('@')[-1] if '@' in db_url else db_url}")
    engine = create_engine(db_url, future=True)

    try:
        with engine.begin() as conn:
            print("Creating extension 'vector'...")
            conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS vector"))
            print("Creating extension 'pgcrypto'...")
            conn.execute(sa_text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
            print("Creating tables...")
            Base.metadata.create_all(engine)
        print("Schema initialized successfully.")
        return 0
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())