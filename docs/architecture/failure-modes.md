# Failure Modes

> For each failure: Detection → Behavior → Recovery. We prefer graceful degradation over blanket HTTP 500.

| Failure | Detection | Behavior | Recovery |
| --- | --- | --- | --- |
| MongoDB unavailable | Express DB connection error | Upload/list/delete fail; return 5xx with clear message | Reconnect; existing requests fail safely |
| Redis unavailable | Client `error` event / get returns null | RAG cache disabled; queries proceed without cache | Auto-reconnect; cache resumes on recovery |
| PostgreSQL/pgvector unavailable | Connection/query error in FastAPI | `/rag/query` returns 503; Express returns safe error to UI | Restart PG; re-run query |
| pgvector retrieval fails | Exception in vector query | Fall back to keyword-only retrieval; if both fail → 503 | Investigate PG; keyword path keeps partial function |
| BM25/FTS fails | Exception in FTS query | Fall back to vector-only retrieval | Investigate PG index |
| Reranker model fails to load | Lazy-load error | Use lexical reranker fallback; log warning | Fix model/image; rerank quality degrades gracefully |
| Embedding model fails | EmbeddingProvider error | Return 503 for indexing/query (embedding is mandatory) | Fix model/image; retry |
| FastAPI unavailable | Express `ragClient` connection error/timeout | RAG query returns safe error; existing non-RAG APIs unaffected | Restart FastAPI; retry with backoff |
| Express `/api/ai/generate` unavailable | GenerationClient timeout/error | RAG returns retrieved evidence with `grounded:false`/abstention (no blank answer) | Restart Express; retry with backoff |
| LLaMA fails | `llama_chat`/summary error | Fallback to Gemini (existing behavior) | Gemini continues |
| Gemini fails | `gemini` error after LLaMA fail | Generation error → RAG abstains (grounded:false) | Fix keys; retry |
| Document extraction fails | `extractTextFromPdf` throws/empty | Report saved; indexing skipped with warning; backfill later | Fix PDF; re-run backfill |
| Indexing fails | FastAPI index error | Report saved; not indexed; user notified softly; backfill later | Re-index via backfill |
| Evidence insufficient | `evidenceScore < EVIDENCE_THRESHOLD` | Return structured abstention (`grounded:false`, empty sources) | N/A (by design) |
| Stale cache | `indexVersion` bumped on mutation | Old keys orphaned; new queries use new version; TTL cleans up | N/A (by design) |
| User ID missing | Service-layer guard / Pydantic validation | Reject retrieval with 400; never query without `user_id` | Fix caller (Express always supplies) |

## Design notes
- **No silent cross-user leakage** even on partial failure: the `user_id` filter is applied before retrieval and on delete.
- **No fabricated answers on LLM failure**: generation errors degrade to abstention with evidence, not to an empty or invented response.
- **Partial retrieval resilience**: vector↔keyword fallback keeps the system useful if one retriever degrades.
- **Index is rebuildable** (ADR-013): any indexing gap is recoverable via backfill from Mongo + source PDFs.
