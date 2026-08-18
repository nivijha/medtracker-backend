# ADR-003: FastAPI for the RAG Service

## Status
Accepted

## Context
The RAG retrieval/reranking/embedding pipeline is ML-heavy. Should it be Python (FastAPI), Node (Express), or another framework?

## Decision
Implement the RAG service in **Python + FastAPI**.

## Alternatives Considered
- **A. Python FastAPI** — chosen.
- **B. Node.js/Express RAG** — reuse existing backend language.
- **C. Another framework** (e.g., Flask, Quart) — not selected.

## Why We Chose This
The ML ecosystem we depend on — `sentence-transformers` (embeddings + CrossEncoder reranking), `pgvector` Python drivers, scientific tooling — is first-class in Python and awkward/immature in Node. FastAPI gives async I/O, Pydantic validation, and clean testability (TestClient). The existing Node backend remains the API/auth gateway; RAG is a focused ML service behind it.

## Trade-offs
### Advantages
- Direct access to sentence-transformers, CrossEncoder, HuggingFace, pgvector.
- Pydantic schemas for request/response validation.
- Independent process/language boundary (clear service seam).

### Disadvantages
- A second runtime/language in the project.
- More operational surface (Python deps, image).

## Consequences
- Easier: ML experimentation, evaluation, reranking.
- Harder: two runtimes to build/run; cross-language contract (HTTP/JSON).

## Risks
- Python image size / cold-start; model download latency.

## Mitigation
- Lazy model loading; pin versions; document required models; cache models in image build.

## When We Would Reconsider
- If we standardized the whole backend on one runtime, or if a Node embedding/reranking lib matched quality — unlikely given the ecosystem gap.

## Interview Explanation
"We used FastAPI because the retrieval stack — sentence-transformers embeddings, CrossEncoder reranking, pgvector — is mature in Python and immature in Node. The existing Express backend stays the auth gateway; FastAPI is a focused ML service behind it, communicating over HTTP with Pydantic-validated schemas."
