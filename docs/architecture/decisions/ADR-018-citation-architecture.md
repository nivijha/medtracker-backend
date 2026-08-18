# ADR-018: Citation Architecture

## Status
Accepted

## Context
Should generated answers carry source references, and at what granularity?

## Decision
Every grounded answer exposes **citations** including: `documentId`, document name (`source_filename`), `page` (when available), `section` (when available), and the relevant retrieval/rerank `score`. Citations point to **chunk/page/section**, not just the whole document.

## Alternatives Considered
- **A. No citations.**
- **B. Document-level citations only.**
- **C. Chunk/page/section citations** — chosen.

## Why We Chose This
Source traceability is core to a medical RAG: a user (or clinician) must be able to verify a claim against the exact page/section it came from. Document-level citations are too coarse to verify a specific value; chunk/page/section citations let the frontend open the source PDF at the right place (via the existing `/api/reports/:id/pdf` stream).

## Trade-offs
### Advantages
- Verifiability; trust; enables deep-linking to source.

### Disadvantages
- More metadata to carry; frontend must render sources distinctly from chat.

## Consequences
- Easier: auditable answers; better UX trust signals.

## Risks
- Stale citations if index drifts (mitigated by re-index on edit/delete).

## Mitigation
- Citations are generated from the same chunk records used for grounding; `documentId` ties back to the owning `Report`.

## When We Would Reconsider
- Never remove citations; may add snippet text to citations later.

## Interview Explanation
"Every answer cites the specific chunk, page, and section it came from, not just the document. For medical records that verifiability is essential — a user can open the exact page and check the value themselves, which is what makes the system trustworthy."
