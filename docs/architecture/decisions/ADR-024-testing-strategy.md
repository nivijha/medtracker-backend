# ADR-024: Testing Strategy

## Status
Accepted

## Context
How do we test a system with ML components, a vector DB, Redis, and a cross-service call?

## Decision
Four test layers with deliberate isolation:
- **Unit tests** (fast, isolated): use `FakeEmbedder`, `MockGenerationClient`, lexical reranker, `fakeredis`. No real models/DBs.
- **Integration tests** (real behavior): real PostgreSQL+pgvector (CI service container) for vector/keyword/hybrid retrieval, reranking, patient isolation, grounding, citations, API endpoints via FastAPI `TestClient`.
- **Evaluation** (`docs/experiments/`): retrieval/generation quality over synthetic data.
- **Security tests**: explicit User A ≠ User B isolation; cache never crosses users.

## Alternatives Considered
- Only end-to-end tests (too slow/fragile).
- Only mocks (doesn't exercise pgvector).

## Why We Chose This
We need both speed (mock ML) and truth (real pgvector). Fakes let us test logic without GPUs; real pgvector tests prove the actual retrieval math and, critically, the mandatory `user_id` isolation. This mirrors the existing backend pattern (vitest + mongodb-memory-server + mocks).

## Trade-offs
### Advantages
- Fast feedback + real-DB confidence; clear separation of concerns.

### Disadvantages
- Two test modes; CI needs a pgvector Postgres service.

## Consequences
- Easier: confident refactors; catches cross-user bugs.

## Risks
- Integration tests flaky if DB not provisioned (mitigated by CI service container).

## Mitigation
- CI spins `pgvector/pgvector` Postgres; integration tests gated behind a flag when no DB is available.

## When We Would Reconsider
- If pgvector tests prove too heavy in CI → use a second, lighter vector backend behind the same interface for tests (acceptable only if behavior matches).

## Interview Explanation
"We separate fast unit tests that mock the ML pieces — fake embedder, mock generation client, fakeredis — from integration tests against a real pgvector Postgres that prove the actual retrieval and, most importantly, the user-isolation guarantee. That gives us speed without sacrificing the security-critical behaviors."
