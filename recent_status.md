# Project Status — MedTracker RAG Subsystem

Last updated: 2026-08-20

## Goal
Evidence-grounded RAG subsystem inside `medtracker-backend/rag-service` (FastAPI +
pgvector), reusing the existing LLaMA→Gemini fallback in Express. MongoDB stays
source of truth; RAG index is rebuildable.

## Phase 1 — Implemented
- FastAPI ingestion (chunk + embed + pgvector), hybrid retrieval (vector + Postgres
  FTS + RRF), mandatory `user_id` filter, `/rag/health`, `/rag/documents/index`,
  `/rag/query`.
- Express `services/ragClient.js`, `controllers/ragController.js`,
  `routes/ragRoutes.js`, upload hook, `scripts/backfillRag.js`.
- Embeddings/rerank: local sentence-transformers (`requirements.txt`); MiniLM 384-dim.
- Tests: Python 13 (+ new) passing via `.venv`; Node suite green.
- Docs: `docs/architecture/*` (28 ADRs + data-flow, tradeoff-matrix, failure-modes,
  security, scalability, why-not, experiments, interview Q&A).

## Phase 2 — Implemented
- `rag-service/app/rerank.py`: `Reranker` protocol, `CrossEncoderReranker`
  (lazy import of sentence-transformers) + `LexicalReranker` (offline/test fallback).
- `rag-service/app/generation.py`: `GenerationClient` protocol,
  `ExpressGenerationClient` (in-process HTTP to Express `/api/ai/generate`, secret-guarded),
  `MockGenerationClient` (tests).
- `rag-service/app/grounding.py`: `compute_evidence_score` (uses rerank_score sigmoid
  or RRF ramp) + `should_abstain` (below `evidence_threshold`).
- `rag-service/app/prompts.py`: `GROUNDING_SYSTEM_PROMPT` + `build_user_prompt`.
- `rag-service/app/api/query.py`: pipeline rerank → ground → generate → citations.
  Returns `grounded`, `evidenceScore`, `answer`, `sources[]`, `candidates[]`.
  Abstains ("Insufficient evidence...") when score below threshold OR generation fails.
- `rag-service/app/schemas.py`: added `SourceOut`, `grounded`, `evidenceScore`,
  `answer`, `sources` to `QueryResponse`.
- `rag-service/app/config.py`: added `reranker_model`, `rerank_top_n`, `evidence_threshold`.
- `rag-service/app/main.py`: dependency overrides for store/embedder/reranker/generation.
- Express `services/llmGenerationService.js`: generic `generateText(system, user)`
  reusing `config/llama_chat.js` with `generateGeminiText` fallback (added to
  `config/gemini.js`). `controllers/aiController.js` + `routes/aiRoutes.js`
  expose INTERNAL `/api/ai/generate` (requires `RAG_SERVICE_SECRET` when set), mounted
  in `index.js`.
- Docs already cover these: `docs/architecture/decisions/ADR-026-internal-endpoint-security.md`
  (Express `/api/ai/generate` internal + secret) and
  `ADR-027-observability.md` (structured JSON logging of grounding/latency/PHI exclusion).

## Tests
- Python (`.venv/Scripts/python -m pytest tests -q`): all pass.
- Node (`npm test`): 25 passed. `npm run check`: syntax check passed.

## Phase 3 — Implemented (cache + rewrite)
- `rag-service/app/cache.py`: `CacheStore` protocol, `InMemoryCache` (offline/test + memoized default), `RedisCache` (lazy `redis` import), `make_cache_key` (`rag:{userId}:{indexVersion}:{queryHash}`), `get_default_cache()` (singleton; Redis if `REDIS_URL` set else in-memory).
- `rag-service/app/api/query.py`: cache lookup before retrieval, store after generation; `cache_hit` in structured logs; caches only the synthesized response (no PHI). `index_version` bump invalidates (set via `INDEX_VERSION`).
- `rag-service/app/rewrite.py` + `previousQuery` on `QueryRequest`: rewrite ONLY when query is context-dependent (anaphoric markers) AND a previous turn is provided; otherwise pass-through (MODIFY #4). `rewrittenQuery` returned on the response.
- Config: `rag_cache_ttl` (env `RAG_CACHE_TTL`), `index_version` (env `INDEX_VERSION`).
- `.env.example`: added `RAG_CACHE_TTL`, `INDEX_VERSION` (`REDIS_URL` already present and maps to rag-service `redis_url`).
- Tests: `test_cache.py` (key format, cache hit skips regeneration, per-user isolation, rewrite propagation), `test_rewrite.py`. All Python tests pass (30).

## Phase 4 — Implemented (eval harness)
- `rag-service/eval/metrics.py`: deterministic retrieval metrics (Recall@K, Precision@K, MRR, NDCG@K) + heuristic faithfulness proxy.
- `rag-service/eval/embed.py`: `BagOfWordsEmbedder` — offline TF-vector stand-in so vector-only vs hybrid is measurable without sentence-transformers.
- `rag-service/eval/gold.py`: 4-doc, 4-query gold set (medical snippets).
- `rag-service/eval/run.py`: indexes gold via real chunker + BoW embedder, runs vector-only and hybrid retrieval, prints metrics JSON.
- `tests/test_eval.py`: 5 pure metric tests.
- Results on gold set: vector-only and hybrid both achieve Recall@3=1.0, MRR=0.875; faithfulness_proxy=1.0 (trivial on this set).

## Not yet started
- Approximate vector index (IVFFlat/HNSW) after recall benchmark.
- LLM-as-judge faithfulness / answer-relevance (ADR-023).
- Frontend `/assistant` (separate PR).

## Next concrete steps
1. Docker: ensure `requirements.txt` installs `sentence-transformers` + `redis`; set `RAG_SERVICE_SECRET` identically in Express + rag-service; wire `PG_RAG_DATABASE_URL` (now preferred by `get_default_store`).
2. Decide on approximate index after benchmark.
3. Wire LLM-as-judge into eval harness when online.

## Critical context / gotchas
- Run Python tests with the venv (`rag-service/.venv`); global `python` lacks deps.
- `filters_to_dict` lives in `app/retrieval.py` (not ingestion).
- `app/api/*` modules use `..` relative imports (they are subpackage of `app`).
- `sentence_transformers` imported lazily inside `CrossEncoderReranker._ensure` so
  offline/tests don't need the model.
- Express `/api/ai/generate` is INTERNAL ONLY (never browser-exposed); FastAPI calls it
  with `X-Rag-Service-Secret`.
- Generation failure must NEVER fabricate: it abstsains with the standard message.
