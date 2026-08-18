# ADR-013: MongoDB + PostgreSQL Dual Database

## Status
Accepted

## Context
We now have two databases. Isn't that contradictory? Why not put everything in one?

## Decision
- **MongoDB** = application source of truth (users, reports, appointments, meds).
- **PostgreSQL + pgvector** = RAG retrieval/index store (derived data).

## Alternatives Considered
- Move everything to Postgres.
- Move vectors into MongoDB Atlas Vector Search.
- Keep only Mongo and add a separate vector DB.

## Why We Chose This
The two stores serve different jobs. MongoDB already owns transactional app data and is well-integrated with the Express models/auth. PostgreSQL+pgvector owns retrieval (vector + FTS + relational filtering) — a workload Mongo isn't optimized for. Critically, the RAG index is **derived data**: it can be **rebuilt from MongoDB + the source documents** (Cloudinary PDFs). That means we accept duplication because the duplicate is reproducible and rebuildable, avoiding a risky migration of the system of record.

## Trade-offs
### Advantages
- Right tool per job; no migration of source of truth; RAG index is disposable/rebuildable.

### Disadvantages
- Two databases to operate; index can drift from source if sync fails.

## Consequences
- Easier: independent scaling of retrieval vs app; safe to wipe/rebuild RAG index.

## Risks
- Inconsistency if a report is edited/deleted but the RAG index isn't updated.

## Mitigation
- Indexing is triggered on upload; deletion/re-index triggers remove/replace chunks and bump `indexVersion` (ADR-021); a backfill script rebuilds from Mongo.

## When We Would Reconsider
- If we adopted Mongo Vector Search and dropped the operational burden — only if retrieval quality/FTS needs are met there (evaluated, not assumed).

## Interview Explanation
"We run Mongo as the system of record and Postgres+pgvector as a derived retrieval index. The key insight is that the RAG index is rebuildable from Mongo and the source PDFs, so duplication is acceptable — we get the right tool for each job without migrating our source of truth or risking a split-brain record store."
