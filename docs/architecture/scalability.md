# Scalability

> We distinguish **Current architecture** (what we build now) from the **Future scaling path** (what changes at scale). We do not over-engineer the current system (§42).

## Current Architecture (now)
- **Corpus per user**: hundreds to low-thousands of chunks (a patient's lifetime reports).
- **Vector search**: exact cosine (`<=>`) on `vector(384)` — correct, no index tuning (ADR-010).
- **Retrieval**: hybrid (vector + Postgres FTS) → RRF → CrossEncoder rerank over top-N candidates.
- **Generation**: FastAPI → Express `/api/ai/generate` (LLaMA→Gemini).
- **Cache**: Redis multi-level, user-scoped, `indexVersion`-invalidated.
- **Models**: local MiniLM embedder + local CrossEncoder, lazy-loaded.
- **Deployment**: one FastAPI container; horizontally scalable behind a load balancer (stateless except PG/Redis).

## Scaling Path (future options, not implemented)

### 10,000 chunks
- Current design handles this comfortably. Exact scan latency still small. No change needed. **Experiment pending** to confirm p95.

### 100,000 chunks
- Exact scan cost grows linearly. **Consider**: add `hnsw` (preferred for query-heavy) or `ivfflat` index on `embedding` with documented `lists`/`m` and a measured recall/latency trade-off (ADR-010).
- Embedding throughput for indexing may need **batching**.

### 1,000,000 chunks
- **Vector DB reconsideration**: benchmark pgvector vs Qdrant/Pinecone while keeping Postgres for metadata/relational (ADR-009). The `VectorStore` interface makes this a swap, not a rewrite.
- **Asynchronous ingestion**: move indexing to a queue + worker; extraction colocates with the worker (ADR-014, ADR-015).
- **Model loading**: consider a shared model server or GPU inference for embedder/reranker if CPU becomes the bottleneck.
- **PostgreSQL scaling**: read replicas, connection pooling, partitioning by `user_id`/tenant if needed.

### 10,000,000+ chunks
- **Database partitioning / sharding** by tenant or time; dedicated vector store; distributed reranking.
- Horizontal FastAPI scaling with shared Redis + PG; consider pre-computing embeddings offline.
- Revisit local vs hosted embeddings if local throughput caps ingestion SLA (ADR-005).

## What We Would Change First
1. **Approximate vector index** (hnsw) — only after a latency benchmark justifies it.
2. **Async ingestion worker** — when upload latency or volume grows.
3. **Dedicated vector store** — only if pgvector latency/scale limits are measured, not assumed.

## Bottlenecks (current, by analysis)
- Generation latency (LLM call over internal network).
- Reranker CPU per query (bounded by top-N).
- Embedding CPU during bulk indexing.
- Cross-service hops (Express ↔ FastAPI ↔ Express) — mitigated by caching and timeouts.

## Principle
Add scaling tech **when a measured problem exists**. The current system is correct and simple; the scaling path is documented so we don't redesign prematurely.
