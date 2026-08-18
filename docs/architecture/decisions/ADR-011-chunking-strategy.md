# ADR-011: Chunking Strategy

## Status
Accepted — **initial default; chunk size validated by experiment**

## Context
How do we split extracted report text into retrievable chunks while preserving context and traceability?

## Decision
**Section/page-aware chunking** with overlap: split on detected sections/headings where possible, attach `page` and `section` metadata, and keep a small token overlap between adjacent chunks. (Exact size/overlap are **initial defaults** to be tuned via experiment.)

## Alternatives Considered
- **A. Fixed-size chunks** (N tokens, no structure awareness).
- **B. Sentence-based chunks.**
- **C. Section-aware chunks** — chosen baseline.
- **D. Semantic chunking** (model-based boundary detection).

## Why We Chose This
Medical reports have natural structure (Lipid Profile, CBC, Impression). Splitting on sections keeps each chunk **topically coherent** and preserves `section` for filtering/citations. Page numbers come from the PDF parser so citations can point to "page 2, Lipid Profile". Overlap prevents splitting a relevant sentence across chunk boundaries.

## Trade-offs
### Advantages
- Better retrieval precision; rich metadata; precise citations.

### Disadvantages
- Small chunks → less surrounding context; large chunks → noisier retrieval & bigger LLM context.

## Consequences
- Easier: precise citations; section filtering.

## Risks
- Wrong chunk size hurts either precision or context (mitigated by experiment).

## Mitigation
- Overlap mitigates boundary loss; chunk size/overlap tuned in `docs/experiments/`.

## When We Would Reconsider
- If semantic chunking yields better retrieval metrics at acceptable cost; or if reports are too unstructured for section detection (fallback to fixed-size).

## Interview Explanation
"We chunk on report sections with page metadata and a small overlap, because medical reports are structured and we want each chunk to be topically coherent and precisely citable. Chunk size is an initial default we'll tune with the evaluation benchmark rather than guess."
