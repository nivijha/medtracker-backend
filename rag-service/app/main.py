"""FastAPI application entrypoint for the RAG service."""
from __future__ import annotations

import logging

from fastapi import FastAPI

from .api import ingestion, query
from .cache import CacheStore, get_default_cache
from .embedding import EmbeddingProvider, get_default_embedder
from .generation import GenerationClient, get_default_generation_client
from .rerank import Reranker, get_default_reranker
from .retrieval import RetrievalStore, get_default_store

logging.basicConfig(level=logging.INFO, format="%(message)s")

app = FastAPI(title="MedTracker RAG Service", version="0.2.0")

app.include_router(ingestion.router, prefix="/rag")
app.include_router(query.router, prefix="/rag")


# Dependency overrides (used by tests to inject fakes).
def get_embedder_dep() -> EmbeddingProvider:
    return get_default_embedder()


def get_store_dep() -> RetrievalStore:
    return get_default_store()


def get_reranker_dep() -> Reranker:
    return get_default_reranker()


def get_generation_dep() -> GenerationClient:
    return get_default_generation_client()


def get_cache_dep() -> CacheStore:
    return get_default_cache()


app.dependency_overrides[ingestion.get_embedder] = get_embedder_dep
app.dependency_overrides[query.get_embedder] = get_embedder_dep
app.dependency_overrides[get_default_store] = get_store_dep
app.dependency_overrides[query.get_reranker] = get_reranker_dep
app.dependency_overrides[query.get_generation] = get_generation_dep
app.dependency_overrides[query.get_cache] = get_cache_dep


@app.get("/")
def root():
    return {"service": "medtracker-rag", "status": "ok"}
