# ADR-009: PostgreSQL + pgvector

## Status
Accepted

## Context
We need vector search plus strong metadata filtering and lexical search. Where should the RAG index live?

## Decision
Introduce **PostgreSQL + pgvector** specifically for the RAG retrieval/index store.

## Alternatives Considered
- **A. PostgreSQL + pgvector** — chosen.
- **B. MongoDB Atlas Vector Search.**
- **C. Qdrant.**
- **D. Pinecone / managed vector DB.**

## Why We Chose This (specific to MedTracker)
- **One additional datastore gives three capabilities**: vector similarity (`<=>`) via pgvector, relational **metadata filtering** (user_id, type, date, section), and **lexical search** via Postgres FTS (`tsvector`/`ts_rank`). This avoids standing up a separate vector DB *and* a separate search engine.
- **Local/dev friendly**: runs in Docker (`pgvector/pgvector` image) with no managed-service account.
- **Operationally simpler** than adding Qdrant/Pinecone for our scale (student/project scale, not billions of vectors).
- MongoDB remains the app source of truth (ADR-013); we are not replacing it.

## Trade-offs
### Advantages
- Vector + SQL filtering + FTS in one store; free/self-hosted; familiar Ops.

### Disadvantages
- An extra database to run and back up; Postgres is not a dedicated vector engine at extreme scale.

## Consequences
- Easier: unified retrieval+filtering+lexical; local compose.

## Risks
- Postgres scaling limits at very large corpora (see ADR-013/scalability).

## Mitigation
- Keep RAG index **derived/rebuildable**; benchmark before adding approximate indexes (ADR-010).

## When We Would Reconsider
- At 10M+ chunks with strict latency SLOs → evaluate Qdrant/Pinecone while keeping Postgres for metadata/relational needs.

## Interview Explanation
"We used PostgreSQL + pgvector because a single store gives us vector search, SQL metadata filtering, and full-text lexical search — exactly what hybrid RAG needs — without a managed vector DB. MongoDB stays the source of truth; Postgres is just the derived retrieval index we can rebuild anytime."
