# ADR-007: CrossEncoder Reranking

## Status
Accepted (initial default — reranker model validated by experiment)

## Context
Hybrid retrieval returns a candidate set, but raw vector+keyword fusion scores don't perfectly rank by answer-relevance. How do we re-rank?

## Decision
Apply a **local CrossEncoder** (MiniLM / MS MARCO class) reranker over the smaller candidate set, behind a `Reranker` interface. A deterministic **lexical reranker** is retained as a test/offline fallback.

## Alternatives Considered
- **A. CrossEncoder reranker** — chosen.
- **B. Lexical reranking only** (keyword-overlap score).
- **C. Hosted reranker API.**
- **D. No reranking** (send fused candidates straight to LLM).

## Why We Chose This
A CrossEncoder scores `(query, passage)` jointly, capturing relevance that independent vector/BM25 scores miss. We apply it only to the **top-N candidates** (e.g., 50–100), so the extra compute is bounded. Vector+BM25 alone is insufficient because cosine similarity and term frequency are noisy signals; reranking concentrates the best evidence before generation. Lexical-only is a weak proxy; hosted APIs add cost/latency and send text off-process.

## Trade-offs
### Advantages
- Better answer-relevance ranking; bounded compute (candidate-set only).

### Disadvantages
- Extra CPU/latency per query; larger image; model load time.

## Consequences
- Easier: higher-quality top-K evidence; testable via lexical fallback.

## Risks
- Reranker latency under load; model availability.

## Mitigation
- Rerank only top-N; lazy-load; lexical fallback if model fails; measured in `docs/experiments/`.

## When We Would Reconsider
- If a hosted reranker materially beats local quality at acceptable cost, or if CPU becomes a scaling bottleneck → evaluate hosted behind the same interface.

## Interview Explanation
"We rerank the top-N hybrid candidates with a local CrossEncoder because vector and BM25 scores are noisy relevance proxies. Applying it only to a small candidate set keeps latency bounded, and we keep a lexical reranker as a testable fallback so the pipeline never hard-depends on the model."
