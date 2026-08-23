"""Query API (Phase 2: rerank -> ground -> generate -> cite).

Returns a grounded answer with citations, or abstains when evidence is insufficient.
Retrieved candidates are also returned for the UI "Retrieved Evidence" panel.
"""
from __future__ import annotations

import json
import logging
import time
import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, Request

from ..cache import CacheStore, get_default_cache, make_cache_key
from ..config import settings
from ..embedding import EmbeddingProvider, get_default_embedder
from ..generation import GenerationClient, get_default_generation_client
from ..grounding import compute_evidence_score, explain_evidence, should_abstain
from ..prompts import GROUNDING_SYSTEM_PROMPT, build_user_prompt
from ..rerank import Reranker, get_default_reranker
from ..retrieval import RetrievalStore, filters_to_dict, get_default_store
from ..rewrite import rewrite_query
from ..schemas import ChunkOut, QueryRequest, QueryResponse, SourceOut

logger = logging.getLogger("rag")
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


def get_reranker() -> Reranker:
    return get_default_reranker()


def get_generation() -> GenerationClient:
    return get_default_generation_client()


def get_cache() -> CacheStore:
    return get_default_cache()


@router.post("/query", response_model=QueryResponse, dependencies=[Depends(verify_secret)])
async def query(
    req: QueryRequest,
    embedder: EmbeddingProvider = Depends(get_embedder),
    store: RetrievalStore = Depends(get_default_store),
    reranker: Reranker = Depends(get_reranker),
    generation: GenerationClient = Depends(get_generation),
    cache: CacheStore = Depends(get_cache),
    verified_user_id: str = Depends(verify_user_id),
):
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query is required")

    query_id = str(uuid.uuid4())

    # Rewrite only when context-dependent (MODIFY #4). Effective query drives
    # retrieval/rerank/generation; the original is preserved in the response.
    effective_query = rewrite_query(req.query, req.previousQuery)
    rewritten = effective_query if effective_query != req.query else None

    # Cache lookup (ADR-020/021): key = rag:{userId}:{indexVersion}:{queryHash}.
    cache_key = make_cache_key(verified_user_id, settings.index_version, effective_query)
    cached = cache.get(cache_key)
    if cached is not None:
        logger.info(
            json.dumps(
                {
                    "event": "rag_query",
                    "query_id": query_id,
                    "user_id": verified_user_id,
                    "cache_hit": True,
                    "grounded": cached.get("grounded"),
                }
            )
        )
        return QueryResponse(**cached)

    t0 = time.time()

    query_vec = embedder.embed([effective_query])[0]
    candidates = store.hybrid_search(
        user_id=verified_user_id,
        query=effective_query,
        query_vec=query_vec,
        top_k=settings.top_k * 3,
        filters=filters_to_dict(req.filters),
    )
    retrieval_ms = (time.time() - t0) * 1000

    # Rerank the candidate set (bounded to top-N for latency).
    t1 = time.time()
    reranked = reranker.rerank(effective_query, candidates, top_k=settings.top_k)
    rerank_ms = (time.time() - t1) * 1000

    evidence_score = compute_evidence_score(reranked)
    grounded = not should_abstain(evidence_score)

    # Audit trail: expose every individual signal behind the grounding decision.
    logger.info(
        json.dumps(
            {
                "event": "evidence_breakdown",
                "query_id": query_id,
                **explain_evidence(reranked),
                "grounded": grounded,
            }
        )
    )

    sources: list[SourceOut] = []
    answer = ""
    if grounded:
        t2 = time.time()
        try:
            user_prompt = build_user_prompt(effective_query, reranked, context=None)
            answer = generation.generate(GROUNDING_SYSTEM_PROMPT, user_prompt)
        except Exception as e:  # generation failure: evidence stands, only the answer degrades
            logger.warning(json.dumps({"event": "generation_failed", "query_id": query_id, "error": str(e)}))
            answer = "Answer could not be generated at this time."
        finally:
            gen_ms = (time.time() - t2) * 1000
        sources = [
            SourceOut(
                documentId=c["document_id"],
                sourceFilename=c.get("source_filename"),
                page=c.get("page"),
                section=c.get("section"),
                score=round(float(c.get("rerank_score", c.get("score", 0.0))), 4),
            )
            for c in reranked
        ]
    else:
        gen_ms = 0.0
        answer = "Insufficient evidence was found in the available records."

    response = QueryResponse(
        query=req.query,
        rewrittenQuery=rewritten,
        grounded=grounded,
        evidenceScore=evidence_score,
        answer=answer,
        sources=sources,
        candidates=[
            ChunkOut(
                chunkId=c["chunk_id"],
                documentId=c["document_id"],
                page=c.get("page"),
                section=c.get("section"),
                sourceFilename=c.get("source_filename"),
                score=round(float(c.get("rerank_score", c.get("score", 0.0))), 4),
                text=c["chunk_text"],
            )
            for c in reranked
        ],
    )

    # Persist to cache (skips PHI; only stores the synthesized response).
    try:
        cache.set(cache_key, response.model_dump(), settings.rag_cache_ttl)
    except Exception as e:
        logger.warning(json.dumps({"event": "cache_set_failed", "query_id": query_id, "error": str(e)}))

    logger.info(
        json.dumps(
            {
                "event": "rag_query",
                "query_id": query_id,
                "user_id": verified_user_id,
                "cache_hit": False,
                "retrieval_latency_ms": round(retrieval_ms, 1),
                "num_candidates": len(candidates),
                "rerank_latency_ms": round(rerank_ms, 1),
                "generation_latency_ms": round(gen_ms, 1),
                "num_sources": len(sources),
                "grounded": grounded,
                "evidence_score": evidence_score,
            }
        )
    )

    return response