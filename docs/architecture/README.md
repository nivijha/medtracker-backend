# MedTracker — Architecture Documentation

> Evidence-Grounded Healthcare Record Intelligence Platform.
> Labeling: **Fact** (verified from repo) · **Decision** (chosen) · **Assumption** (unverified) · **Experiment** (testing) · **Result** (measured) · **Future option**.

## Overview
MedTracker adds an **evidence-grounded RAG subsystem** to an existing Express/MongoDB/Redis medical-record app. A FastAPI service performs hybrid retrieval + reranking over PostgreSQL+pgvector; generation reuses the existing LLaMA→Gemini fallback via an internal Express endpoint. MongoDB stays the source of truth; the RAG index is derived and rebuildable.

## Start Here
1. `00-existing-system.md` — what exists today (verified from the repo).
2. `01-target-architecture.md` — target design + Mermaid diagram.
3. `tradeoff-matrix.md` — one-row-per-decision summary.
4. `decisions/ADR-*.md` — reasoning behind every major choice.
5. `data-flow.md`, `failure-modes.md`, `security.md`, `scalability.md`, `why-not.md`.
6. `../experiments/` — experiment logs (evidence over opinion).
7. `../interview/architecture-questions.md` — interview Q&A.

## ADR Index
| ADR | Title | File |
| --- | --- | --- |
| 001 | RAG as MedTracker subsystem | `decisions/ADR-001-rag-as-subsystem.md` |
| 002 | rag-service inside backend repo | `decisions/ADR-002-rag-service-repo-layout.md` |
| 003 | FastAPI for RAG | `decisions/ADR-003-fastapi.md` |
| 004 | Express as generation gateway | `decisions/ADR-004-express-generation-gateway.md` |
| 005 | Local embeddings (MiniLM) | `decisions/ADR-005-local-embeddings.md` |
| 006 | EmbeddingProvider interface | `decisions/ADR-006-embedding-provider-interface.md` |
| 007 | CrossEncoder reranking | `decisions/ADR-007-crossencoder-reranking.md` |
| 008 | Hybrid retrieval + RRF | `decisions/ADR-008-hybrid-retrieval-rrf.md` |
| 009 | PostgreSQL + pgvector | `decisions/ADR-009-postgres-pgvector.md` |
| 010 | Exact vs approximate vector search | `decisions/ADR-010-exact-vs-approximate-vector-search.md` |
| 011 | Chunking strategy | `decisions/ADR-011-chunking-strategy.md` |
| 012 | Metadata filtering & isolation | `decisions/ADR-012-metadata-filtering-isolation.md` |
| 013 | MongoDB + PostgreSQL dual DB | `decisions/ADR-013-mongo-postgres-dual.md` |
| 014 | Ingestion location (Express-side V1) | `decisions/ADR-014-ingestion-location.md` |
| 015 | Synchronous vs async indexing | `decisions/ADR-015-sync-vs-async-indexing.md` |
| 016 | Evidence score (not confidence) | `decisions/ADR-016-evidence-score.md` |
| 017 | Abstention / grounding threshold | `decisions/ADR-017-abstention-threshold.md` |
| 018 | Citation architecture | `decisions/ADR-018-citation-architecture.md` |
| 019 | Query rewriting (context-dependent only) | `decisions/ADR-019-query-rewriting.md` |
| 020 | Redis caching (multi-level) | `decisions/ADR-020-redis-caching.md` |
| 021 | Cache invalidation (indexVersion) | `decisions/ADR-021-cache-invalidation.md` |
| 022 | Evaluation strategy | `decisions/ADR-022-evaluation-strategy.md` |
| 023 | LLM-as-judge (optional) | `decisions/ADR-023-llm-as-judge.md` |
| 024 | Testing strategy | `decisions/ADR-024-testing-strategy.md` |
| 025 | Docker architecture | `decisions/ADR-025-docker-architecture.md` |
| 026 | Internal endpoint security | `decisions/ADR-026-internal-endpoint-security.md` |
| 027 | Observability | `decisions/ADR-027-observability.md` |
| 028 | Healthcare safety boundary | `decisions/ADR-028-healthcare-safety-boundary.md` |

## Decision Evolution (evidence-driven)
Several values are **initial defaults validated by experiment** (see `../experiments/`): chunk size/overlap, `EVIDENCE_THRESHOLD`, CrossEncoder model id, `indexVersion` storage, ConversationStore backend. When an experiment changes a decision, the ADR is updated with an "Evolution" note and the result is recorded.

## Quick Answers
- **Why RAG as a subsystem?** Reuses auth, records, and the LLM fallback; one access-control boundary. (ADR-001)
- **Why FastAPI?** The retrieval stack (sentence-transformers, pgvector) is mature in Python. (ADR-003)
- **Why PostgreSQL+pgvector?** Vector + SQL filtering + FTS in one store; Mongo stays the source of truth. (ADR-009/013)
- **Why hybrid + RRF?** Medical terms/values need exact match; RRF avoids score-scale mismatch. (ADR-008)
- **Why Express owns generation?** Reuse LLaMA→Gemini fallback (single source of truth). (ADR-004)
- **How is cross-user leakage prevented?** Mandatory `user_id` filter, tested. (ADR-012)
- **Why evidenceScore not confidence?** Relevance signal, not clinical certainty. (ADR-016)
