# ADR-020: Redis Caching (Multi-level RAG Cache)

## Status
Accepted (per user MODIFY context)

## Context
Should we cache anything in the RAG path, and at what levels?

## Decision
Cache three things in Redis, all **user-scoped**:
1. **Query embeddings** (avoid re-embedding identical queries).
2. **Retrieval results** (fused/reranked candidate sets for a query+filters).
3. **Final grounded responses** (the full answer+sources for a query+filters).

## Alternatives Considered
- **A. No cache.**
- **B. Query-level response cache only.**
- **C. Multi-level RAG cache** — chosen.

## Why We Chose This
Identical questions from the same user (e.g., "what's my latest HbA1c?") are common and expensive (embed + retrieve + rerank + generate). Caching at multiple levels cuts latency and LLM cost. The existing `summaryCacheService` pattern in Node demonstrates Redis usage we mirror in FastAPI.

## Trade-offs
### Advantages
- Lower latency & cost for repeat queries; layered hit rates.

### Disadvantages
- More cache state to keep correct; invalidation complexity (see ADR-021).

## Consequences
- Easier: faster repeat queries; cheaper generation.

## Risks
- Stale answers if the user's records change and cache isn't invalidated.

## Mitigation
- Every key includes `userId` + `indexVersion` + `queryHash` (ADR-021); TTL as backstop; never serve one user's cache to another.

## When We Would Reconsider
- If cache hit rates are low and complexity high → collapse to final-response cache only.

## Interview Explanation
"We cache query embeddings, retrieval results, and final answers in Redis — all scoped to the user. Repeat medical questions are common and expensive, so multi-level caching cuts latency and LLM cost. The hard part is invalidation, which we handle with a per-user index version rather than hunting stale keys."
