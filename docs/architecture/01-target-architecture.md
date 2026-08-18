# 01 — Target Architecture

> **Fact / Decision / Assumption / Experiment / Result / Future option** labeling applies.

---

## 1. Why RAG Is Being Introduced (Decision + Fact)

The existing system can **store, list, summarize, and chat about actions** on medical records, but it cannot **answer evidence-grounded questions across a patient's longitudinal history** (e.g., "Compare my LDL over the last three years"). That requires:

- semantic + keyword search across many documents,
- metadata-aware filtering (owner, type, date, section),
- reranking to pick the most relevant evidence,
- grounding so the model answers **only from retrieved evidence**, with citations,
- abstention when evidence is insufficient.

This is a **retrieval / summarization / comparison** problem, explicitly **not** diagnosis or treatment recommendation.

## 2. What RAG Solves (Decision)

- Cross-document, longitudinal medical-record Q&A.
- Source traceability (citations to document/page/section).
- Hallucination reduction via evidence threshold + abstention.

## 3. What RAG Does NOT Solve (Decision + boundary)

- Autonomous diagnosis.
- Medication / treatment recommendations.
- Anything outside the user's own records.

These are enforced by system prompt and UI disclaimer (see ADR-028).

## 4. Components That Remain Unchanged (Fact)

- MongoDB remains the **application source of truth** (users, reports, appointments, meds).
- Redis remains a cache (summary cache today; RAG cache later, isolated).
- Express remains the **main API + auth gateway**.
- The existing LLaMA→Gemini fallback is **reused**, not replaced.
- Frontend remains Next.js; only a new route/component is added (separate PR).

## 5. New Components Introduced (Decision)

- **`rag-service/`** (FastAPI, Python) — ingestion, hybrid retrieval, reranking, grounding, citations, evaluation.
- **PostgreSQL + pgvector** — RAG retrieval/index store (derived data).
- **Express `/api/rag/*` + `ragClient`** — authenticated proxy to FastAPI.
- **Express `/api/ai/generate`** — internal generation endpoint reusing the fallback.

## 6. Target Data Flow (Decision)

```mermaid
flowchart TD
    FE[Next.js /assistant] -->|Bearer JWT| EX[Express API]
    EX -->|protect → userId| RC[ragController / ragClient]
    RC -->|RAG_SERVICE_SECRET| FA[FastAPI RAG Service]

    subgraph RAG[FastAPI RAG Service]
        QW[Query Rewriter\n(conditional)] --> MF[Metadata Filter\n(user_id enforced)]
        MF --> VS[Vector Search\npgvector exact cosine]
        MF --> KS[Keyword Search\nPostgres FTS]
        VS --> FU[RRF Fusion]
        KS --> FU
        FU --> RR[Reranker\nCrossEncoder]
        RR --> GR[Grounding\nevidenceScore + abstention]
    end

    GR -->|evidence + prompt| GEN[GenerationClient → Express /api/ai/generate]
    GEN -->|LLaMA → Gemini fallback| LLM[(Existing LLM infra)]
    LLM -->|grounded answer + citations| FE
```

## 7. How the New Architecture Integrates With the Old (Decision)

- **Auth**: Express authenticates; FastAPI never sees JWTs — it receives `userId` over an internal, secret-protected call.
- **Storage**: MongoDB keeps the report; PostgreSQL keeps chunk embeddings (rebuildable from Mongo + source file).
- **Generation**: FastAPI delegates generation back to Express, preserving the single LLaMA→Gemini fallback (ADR-004).
- **Isolation**: every retrieval path filters by `user_id`; caches are user-scoped (ADR-012, ADR-021).

## 8. Component Responsibilities (Decision)

| Component | Owns |
| --- | --- |
| Next.js | RAG UI, conversation display, source links |
| Express | Auth, routing, `ragClient`, `/api/ai/generate` |
| FastAPI | Ingestion, hybrid retrieval, reranking, grounding, eval |
| PostgreSQL+pgvector | Chunks, embeddings, lexical index |
| MongoDB | Application records (source of truth) |
| Redis | Summary cache (existing) + RAG cache (new, user-scoped) |
| LLaMA/Gemini | Grounded generation (via Express) |

## 9. Open / Pending Items (Decision Pending → tracked as experiments)

- Exact chunk size / overlap — **Experiment pending**.
- Numeric `EVIDENCE_THRESHOLD` — **initial default, validated by experiment**.
- CrossEncoder model id — **initial default, validated by experiment**.
- `indexVersion` storage location (Postgres vs Redis) — **initial default**.
- ConversationStore backend (Redis vs in-memory) — **initial default**.
