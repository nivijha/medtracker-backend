# ADR-006: EmbeddingProvider Interface

## Status
Accepted

## Context
Embedding logic is used across ingestion and retrieval. Hard-coding a model makes testing and experimentation painful.

## Decision
Embeddings are abstracted behind an `EmbeddingProvider` interface with two implementations: `SentenceTransformerEmbedder` (local MiniLM) and `FakeEmbedder` (deterministic, for tests).

## Alternatives Considered
- Inline calls to sentence-transformers throughout retrieval/ingestion code.

## Why We Chose This
- **Dependency inversion**: retrieval code depends on an interface, not a model.
- **Testing**: `FakeEmbedder` gives deterministic vectors so retrieval/rerank/citation tests don't need a real model or GPU.
- **Experimentation**: swapping local↔hosted or MiniLM↔another model is a one-line change.

## Trade-offs
### Advantages
- Testable without heavy models; easy model swaps; clean separation.

### Disadvantages
- Slight indirection; need to keep interface minimal and honest.

## Consequences
- Easier: unit tests, model experiments, local↔hosted migration.

## Risks
- FakeEmbedder must preserve the *shape* (dimension) of real embeddings so tests stay meaningful.

## Mitigation
- `FakeEmbedder` emits fixed-dimension normalized vectors; dimension is configurable and asserted in tests.

## When We Would Reconsider
- Not expected; the interface is low-cost and high-value.

## Interview Explanation
"We put embeddings behind an EmbeddingProvider interface with a real MiniLM implementation and a FakeEmbedder for tests. That lets us unit-test retrieval, reranking, and citations without loading a model or needing a GPU, and swap embedding models without touching retrieval logic."
