# ADR-012: Metadata Filtering & User Isolation

## Status
Accepted

## Context
Retrieval must be scoped to the right patient and, optionally, to type/date/section/document. Why is this a security requirement?

## Decision
**Every retrieval operation filters by `user_id` first**, before any vector/keyword search. Optional filters: `document_type`, `date_range`, `section`, `document_id`. `user_id` is mandatory — the service rejects requests lacking it.

## Alternatives Considered
- Treat filtering as a pure relevance optimization (no isolation guarantee).
- Filter only at the application layer after retrieval.

## Why We Chose This
This is **not merely retrieval tuning — it is an access-control boundary**. User A must never retrieve User B's medical records. Because `user_id` is the first predicate in the SQL/vector query, cross-user leakage is structurally impossible even if downstream logic changes.

## Trade-offs
### Advantages
- Strong, verifiable isolation; enables date/type/section scoping for better answers.

### Disadvantages
- Slightly more query construction; requires the caller to always supply `userId` (Express does, from `protect`).

## Consequences
- Easier: safe multi-tenant retrieval; supports "last two years" style queries.

## Risks
- A missing `userId` would broaden the query — mitigated by a hard reject.

## Mitigation
- FastAPI validates `user_id` presence (Pydantic + service-layer guard); tests assert User A ≠ User B (see testing ADR-024).

## When We Would Reconsider
- Never relax the mandatory `user_id` filter.

## Interview Explanation
"Metadata filtering is a security control, not just a relevance tweak. Every retrieval query starts with a mandatory user_id predicate, so cross-user medical-record leakage is structurally impossible regardless of what the vector search returns. That's tested explicitly: User A can never see User B's chunks."
