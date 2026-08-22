"""Ingestion + health API."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from ..cache import CacheStore, get_default_cache
from ..config import settings
from ..embedding import EmbeddingProvider, get_default_embedder
from ..ingestion import build_chunks
from ..retrieval import RetrievalStore, get_default_store
from ..schemas import HealthResponse, IndexRequest, IndexResponse, DeleteRequest, DeleteResponse

router = APIRouter()


def verify_secret(x_rag_service_secret: str | None = Header(default=None)) -> None:
    if settings.rag_service_secret and x_rag_service_secret != settings.rag_service_secret:
        raise HTTPException(status_code=403, detail="Invalid RAG service secret")


async def verify_user_id(request: Request, x_user_id: str | None = Header(default=None, alias="X-User-Id")) -> str:
    """Verify that the authenticated user (from X-User-Id header) matches the request body userId.
    Returns the verified user_id. Raises 403 if mismatch or missing header."""
    if x_user_id is None:
        raise HTTPException(status_code=403, detail="Missing X-User-Id header")
    
    # Parse body to get userId
    body = await request.json()
    req_user_id = body.get("userId")
    if not req_user_id:
        raise HTTPException(status_code=403, detail="Missing userId in request body")
    
    if req_user_id != x_user_id:
        raise HTTPException(status_code=403, detail="User ID mismatch: authenticated user does not match request")
    return x_user_id


def get_embedder() -> EmbeddingProvider:
    return get_default_embedder()


def get_cache() -> CacheStore:
    return get_default_cache()


@router.post("/documents/index", response_model=IndexResponse, dependencies=[Depends(verify_secret)])
async def index_document(
    req: IndexRequest,
    embedder: EmbeddingProvider = Depends(get_embedder),
    store: RetrievalStore = Depends(get_default_store),
    verified_user_id: str = Depends(verify_user_id),
):
    chunks = build_chunks(
        document_id=req.documentId,
        user_id=verified_user_id,
        doc_type=req.type,
        report_date=req.reportDate,
        source_filename=req.sourceFilename,
        text=req.text,
        pages=req.pages,
        chunk_size=settings.chunk_size,
        overlap=settings.chunk_overlap,
    )
    if not chunks:
        return IndexResponse(indexed=False, documentId=req.documentId, chunkCount=0, error="no text produced")
    embeddings = embedder.embed([c["chunk_text"] for c in chunks])
    for c, e in zip(chunks, embeddings):
        c["embedding"] = e
    store.index_chunks(chunks)
    return IndexResponse(indexed=True, documentId=req.documentId, chunkCount=len(chunks))


@router.delete("/documents/{document_id}", response_model=DeleteResponse, dependencies=[Depends(verify_secret)])
async def delete_document(
    document_id: str,
    req: DeleteRequest = Depends(),
    store: RetrievalStore = Depends(get_default_store),
    verified_user_id: str = Depends(verify_user_id),
):
    deleted = store.delete_document(user_id=verified_user_id, document_id=document_id)
    return DeleteResponse(deleted=True, documentId=document_id, chunkCount=deleted)


@router.get("/health", response_model=HealthResponse)
def health(
    store: RetrievalStore = Depends(get_default_store),
    cache: CacheStore = Depends(get_cache),
):
    detail = store.health()
    detail["cache"] = cache.__class__.__name__
    if hasattr(cache, "_store"):
        detail["cache_size"] = len(cache._store)
    return HealthResponse(status="ok", store=store.__class__.__name__, detail=detail)