# Why Not?

> Each alternative below is **valid in some context**. We explain why it was *not selected for MedTracker*, not that it is "bad".

## Why not a generic "chat with PDF" app?
A generic chatbot indexes arbitrary documents and answers freely. MedTracker is **patient-scoped, longitudinal, and medically sensitive**. We need user isolation, metadata filtering, citations to specific pages, and abstention — none of which a generic ChatGPT-with-PDF wrapper provides by default.

## Why not a separate RAG repository?
Co-locating `rag-service/` in the backend repo keeps every RAG feature (Express proxy + FastAPI) in one atomic PR, with one compose and shared env. A separate repo adds cross-repo coordination cost we don't need yet (ADR-002). *Future option*: split if RAG is productized.

## Why not Express-only RAG?
The retrieval stack — sentence-transformers embeddings, CrossEncoder reranking, pgvector drivers — is mature in Python and immature in Node. Reimplementing it in Express would mean weaker ML tooling or heavy native deps (ADR-003).

## Why not call the LLM directly from FastAPI?
That would duplicate the existing LLaMA→Gemini fallback and its provider config. Reusing Express's `/api/ai/generate` keeps a single source of truth for generation (ADR-004). Trade-off accepted: runtime coupling to Express.

## Why not hosted embeddings?
Hosted embeddings add per-token cost, network dependency at query time, and send medical text to a third party. Local MiniLM keeps PHI in-process, is free to run, and yields reproducible evaluations (ADR-005). Hosted is a future option if a stronger model is only available there.

## Why not a hosted reranker?
Same reasoning: cost, latency, and off-process text. A local CrossEncoder over a small candidate set is sufficient and keeps data in-process (ADR-007).

## Why not vector-only search?
Medical questions hinge on exact terms and values — `HbA1c`, `LDL 142`, `2024-03`. Vector search paraphrases meaning and can blur these. BM25 captures exact terminology; hybrid captures both (ADR-008).

## Why not keyword-only search?
Keyword search misses semantically equivalent phrasing ("bad cholesterol" vs "LDL") and cross-concept queries ("trend of my lipids"). Vector search covers that gap.

## Why not MongoDB-only vector search?
Mongo Atlas Vector Search would avoid a second DB, but we also need strong relational metadata filtering and full-text lexical search in one place. PostgreSQL+pgvector delivers all three locally without a managed service (ADR-009). *(If we were already on Atlas, this would be reconsidered.)*

## Why not Pinecone / Qdrant (managed vector DB)?
They are excellent vector engines, but for our scale they add a managed-service dependency, cost, and another system to operate — for capabilities Postgres+pgvector already covers (vector + SQL filter + FTS). Revisit at 1M+ chunks (scalability.md).

## Why not skip reranking?
Sending all fused candidates to the LLM wastes context and lowers answer quality. Reranking concentrates the best evidence into top-K. Cost is bounded because it runs only on the candidate set (ADR-007).

## Why not always-answer generation?
For medical records, a fabricated value is harmful. Abstention on insufficient evidence is safer and auditable (ADR-017).

## Why not skip evaluation?
Without measurement we'd be guessing about retrieval/generation quality. Evaluation is part of the system, comparing vector-only vs hybrid vs hybrid+rerank with real, non-fabricated metrics (ADR-022).

## Why not skip citations?
Citations let users verify claims against the exact page/section — essential for trust in medical answers (ADR-018).

## Why not synchronous indexing forever?
Synchronous indexing is simplest and gives immediate consistency, which suits current low volume. We document the async-worker migration as a future option for higher volume/large documents (ADR-015).

## Why not multiple AI agents?
The system is a deterministic RAG pipeline; agents would add nondeterminism, cost, and complexity without solving a concrete problem here. We avoid unnecessary abstractions (§22, §42).
