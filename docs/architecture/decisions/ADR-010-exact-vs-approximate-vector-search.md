# ADR-010: Exact vs Approximate Vector Search

## Status
Accepted — **exact cosine search for V1; approximate indexing deferred**

## Context
pgvector supports exact cosine (`<=>` with no index) and approximate indexes (ivfflat, hnsw). Should we add an approximate index from day one?

## Decision
V1 uses **exact cosine similarity** on an unindexed `vector(384)` column (or a plain index only if Postgres requires one for correctness—none needed for exact scan). We **do not** introduce ivfflat/hnsw prematurely.

## Alternatives Considered
- **A. Exact search (no approximate index)** — chosen for V1.
- **B. ivfflat** (centroid-based approximate).
- **C. hnsw** (graph-based approximate).

## Why We Chose This
- **Expected initial corpus is small** (a patient's records: hundreds to low-thousands of chunks). Exact search is correct, trivial to reason about, and fast enough at this size.
- Approximate indexes add **index build/maintenance, tuning (lists/m), and recall trade-offs** we can't yet justify without data.
- The architecture principle (§42) is to add tech only when a concrete problem exists. The problem (latency) is **not yet measured**.

## Trade-offs
### Advantages
- Correct results; zero index tuning; simplest mental model.

### Disadvantages
- Linear scan cost grows with chunk count (O(n) per query).

## Consequences
- Easier: correctness first; no premature optimization.

## Risks
- Latency rises as a user's corpus grows into the hundreds of thousands of chunks.

## Mitigation
- Benchmark in `docs/experiments/`; only then add an approximate index with documented `lists`/`m` and expected recall/latency.

## When We Would Reconsider
- When p95 retrieval latency exceeds SLO at realistic corpus sizes → add **hnsw** (preferred for query-heavy workloads) with a recorded experiment justifying config.

## Interview Explanation
"We start with exact cosine search because our corpus per user is small and correctness matters more than shaving milliseconds we haven't measured. Adding an ivfflat or hnsw index is a real tuning decision with recall trade-offs, so we'll only do it once a benchmark shows the latency actually warrants it."
