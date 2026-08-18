# Trade-off Matrix

> Each row records a decision, the chosen option, the main alternative, why it was chosen, and its main cost. Adjusted to the actual implementation.

| # | Decision | Chosen | Main Alternative | Why Chosen | Main Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | RAG location | Subsystem of MedTracker | Separate product | Reuse auth/records/fallback; one access-control boundary | Less independence |
| 2 | Repo layout | `rag-service/` in backend | Separate `medtracker-rag` repo | Atomic cross-cutting PRs; one compose | Two languages in one repo |
| 3 | RAG framework | FastAPI (Python) | Express RAG | Python ML ecosystem (sentence-transformers, pgvector) | Second runtime |
| 4 | Generation | Express proxy (`/api/ai/generate`) | FastAPI → LLM direct | Reuse LLaMA→Gemini fallback (single source of truth) | Runtime coupling to Express |
| 5 | Embeddings | Local MiniLM (384) | Hosted API | Privacy, cost, reproducible evals | CPU/RAM, image size |
| 6 | Embedding abstraction | `EmbeddingProvider` interface | Inline model calls | Testability, swappable models | Slight indirection |
| 7 | Reranking | Local CrossEncoder | Lexical only / hosted | Better relevance on candidate set | CPU latency, image size |
| 8 | Retrieval | Hybrid (vector + FTS) | Vector-only | Exact terminology (LDL/HbA1c/dates) | More components |
| 9 | Fusion | Reciprocal Rank Fusion | Weighted score sum | Avoids non-comparable score scales | Rank-only (loses magnitude) |
| 10 | Vector DB | PostgreSQL + pgvector | Qdrant / Pinecone | Vector + SQL filter + FTS in one store | Extra DB to operate |
| 11 | Vector index | Exact cosine (V1) | ivfflat / hnsw | Correctness first; no premature tuning | O(n) scan at scale |
| 12 | Chunking | Section/page-aware + overlap | Fixed-size | Coherent, citable chunks | Needs tuning (experiment) |
| 13 | Isolation | Mandatory `user_id` filter | App-layer filter only | Structural cross-user safety | Caller must supply userId |
| 14 | Dual DB | Mongo (truth) + Postgres (index) | Mongo-only / Postgres-only | Right tool; index is rebuildable | Two DBs; sync risk |
| 15 | Ingestion | Express-side extraction (V1) | FastAPI extraction | Reuse existing service | Larger text payload |
| 16 | Indexing | Synchronous (V1) | Queue + worker | Immediate consistency; simpler | Upload wait time |
| 17 | Evidence metric | `evidenceScore` | `confidence` | Honest semantics (not clinical certainty) | Less familiar term |
| 18 | Grounding | Abstain when insufficient | Always answer | Prevent medical hallucination | Possible false negatives |
| 19 | Citations | Chunk/page/section | Document-level | Verifiability | More metadata |
| 20 | Query rewrite | Only if context-dependent | Rewrite every query | Lower latency/cost; still supports follow-ups | Heuristic may miss cases |
| 21 | Cache | Multi-level Redis | No cache | Latency/cost for repeats | Invalidation complexity |
| 22 | Invalidation | `userId+indexVersion+queryHash` | Enumerate & delete | Safe, no key hunting | Old keys linger to TTL |
| 23 | Evaluation | Recall@K/MRR/Prec@K/faithfulness/answer-rel | Measure-all | Focused + reproducible | Narrower than full bench |
| 24 | LLM-judge | Optional | Primary judge | Avoid bias/cost/repro risk | Less semantic signal by default |
| 25 | Testing | Fakes + real pgvector | E2E only | Speed + real isolation proof | CI needs pgvector service |
| 26 | Docker | Separate containers + compose | Single container | Clear boundaries; local dev | More moving parts |
| 27 | Internal endpoint | `RAG_SERVICE_SECRET` + private net | Public endpoint | No public LLM surface | Secret management |
| 28 | Observability | Structured, no PHI | Full-text logs | Diagnosable + compliant | Can't see text in logs |
| 29 | Safety boundary | Retrieval/summ/compare only | Diagnostic scope | Safety + scope clarity | Won't advise treatment |

**Principle (§42):** optimize for correctness, security, retrieval quality, grounding, maintainability, observability, reproducibility, performance, scalability — in that priority order. Add tech only when a concrete problem exists.
