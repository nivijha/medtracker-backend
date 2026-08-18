# ADR-015: Synchronous vs Asynchronous Indexing

## Status
Accepted — **synchronous indexing for V1; worker/queue is a future option**

## Context
When a report is uploaded, should we index it immediately (inline) or queue it for background processing?

## Decision
**V1: index synchronously** during/after the upload request (Express extracts text, calls FastAPI `/rag/documents/index`). 

## Alternatives Considered
- **A. Synchronous index on upload** — chosen for V1.
- **B. Upload → queue → background worker.**

## Why We Chose This
The existing upload flow is synchronous and our document volumes are low (per-user medical reports). Synchronous indexing keeps the system simpler, gives immediate consistency (a just-uploaded report is immediately queryable), and avoids standing up a broker/worker. This aligns with the "no premature complexity" principle (§42).

## Trade-offs
### Advantages
- Immediate availability; simplest architecture; no broker/worker infra.

### Disadvantages
- User waits for extraction+embedding during upload; a failure can block the upload response.

## Consequences
- Easier: no queue; consistent state.

## Risks
- Slow/large PDFs lengthen upload latency; indexing failure could fail the upload.

## Mitigation
- FastAPI indexing is wrapped so extraction/embedding failures are caught and surfaced as a warning (report still saved); a backfill script re-indexes any missed documents. Indexing can be moved off the request path later without API changes.

## When We Would Reconsider
- At higher volume or with large documents → introduce a queue + worker (extraction moves with it, per ADR-014).

## Interview Explanation
"V1 indexes synchronously on upload because volumes are low and we want new reports immediately queryable without a message broker. If volume or document size grows, we move indexing to a background worker — the API contract doesn't change, just the trigger."
