# ADR-008: Hybrid Retrieval + Reciprocal Rank Fusion

## Status
Accepted

## Context
Should retrieval be vector-only, keyword-only, or a combination? And how should we combine signals?

## Decision
Use **semantic vector search + PostgreSQL full-text (BM25-style) keyword search**, combined with **Reciprocal Rank Fusion (RRF)**.

## Alternatives Considered
- **A. Vector-only retrieval.**
- **B. Keyword-only retrieval.**
- **C. Simple weighted score fusion** (e.g., `a*cos + b*rank`).
- **D. Reciprocal Rank Fusion** — chosen.

## Why We Chose This
Medical records are full of **exact terminology and numeric values** that semantic search alone mishandles: `HbA1c`, `LDL`, `HDL`, medication names, lab values (`142 mg/dL`), and dates (`2024-03`). Vector search paraphrases meaning but can blur exact matches; BM25 nails exact terms. RRF is preferred over weighted addition because the two systems produce **scores on different, non-comparable scales** — summing them requires fragile hand-tuned weights. RRF only uses each system's *rank order*, which is robust and weight-free.

## Trade-offs
### Advantages
- Captures both meaning and exact terminology; no fragile score scaling.

### Disadvantages
- Two retrievers to maintain; slightly more latency; fusion is rank-based (loses some score magnitude).

## Consequences
- Easier: robust combination; better recall on terminology-heavy queries.

## Risks
- If one retriever is much noisier, RRF can still surface weak candidates (mitigated by reranking after fusion).

## Mitigation
- Always follow fusion with CrossEncoder reranking (ADR-007).

## When We Would Reconsider
- If evaluation shows vector or keyword alone meets quality targets at lower cost (unlikely for medical terminology).

## Interview Explanation
"Hybrid retrieval matters for medical text because patients ask about exact terms like LDL or HbA1c that semantic search can blur. We fuse vector and BM25 with Reciprocal Rank Fusion rather than weighted sums because the two score distributions aren't comparable — RRF uses only rank order, so it needs no fragile tuning."
