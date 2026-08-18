# Data Flow

> Fact/Decision/Assumption/Experiment/Result/Future option labels apply.

## 1. Upload & Indexing Flow

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Next.js
    participant EX as Express (protect)
    participant MON as MongoDB
    participant CL as Cloudinary
    participant PDF as pdfExtractionService
    participant FA as FastAPI RAG
    participant PG as PostgreSQL+pgvector
    participant RD as Redis

    U->>FE: Upload report (multipart)
    FE->>EX: POST /api/reports/upload (JWT)
    EX->>MON: Create Report(user,type,reportDate,fileUrl)
    EX->>CL: Store PDF (raw)
    EX->>PDF: extractTextFromPdf(buffer)
    EX->>FA: POST /rag/documents/index (RAG_SERVICE_SECRET, userId, metadata, text)
    FA->>FA: chunk (section/page-aware) + attach metadata
    FA->>FA: embed via EmbeddingProvider
    FA->>PG: upsert document + chunks + embeddings (idempotent by document_id)
    FA->>RD: bump indexVersion(userId)
    FA-->>EX: {indexed: true, chunkCount}
    EX-->>FE: {report, indexed}
```

Notes:
- Extraction is **Express-side** in V1 (ADR-014). Text (not raw PDF) crosses to FastAPI.
- Indexing is **synchronous** in V1 (ADR-015).
- Idempotent by `document_id` → re-uploads replace chunks.

## 2. Query Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Next.js /assistant
    participant EX as Express (protect → userId)
    participant FA as FastAPI RAG
    participant RD as Redis
    participant PG as PostgreSQL+pgvector
    participant GEN as Express /api/ai/generate
    participant LLM as LLaMA→Gemini

    U->>FE: Ask question (+conversationId)
    FE->>EX: POST /api/rag/query (JWT)
    EX->>FA: /rag/query (RAG_SERVICE_SECRET, userId, query, filters, conversationId)
    FA->>FA: needs-rewrite? → rewrite (context-dependent only, ADR-019)
    FA->>RD: get(rag:{userId}:{indexVersion}:{queryHash}:embed/retrieve)
    alt cache miss
        FA->>PG: vector search (exact cosine) + FTS keyword
        FA->>FA: RRF fusion → candidate set
        FA->>FA: CrossEncoder rerank (top-N)
        FA->>FA: grounding → evidenceScore
    end
    alt evidenceScore >= threshold
        FA->>GEN: generate(question, evidence, metadata, context)
        GEN->>LLM: LLaMA → Gemini fallback
        LLM-->>GEN: answer text
        GEN-->>FA: answer
        FA->>FA: attach citations (docId, page, section, score)
    else insufficient evidence
        FA->>FA: grounded:false, empty sources
    end
    FA->>RD: set(final response, TTL)
    FA-->>EX: {answer, grounded, evidenceScore, sources}
    EX-->>FE: response
    FE->>FE: render answer + Retrieved Evidence + sources
```

## 3. Delete Flow

```mermaid
sequenceDiagram
    participant U as User
    participant EX as Express (protect + ownership)
    participant MON as MongoDB
    participant CL as Cloudinary
    participant FA as FastAPI RAG
    participant RD as Redis

    U->>EX: DELETE /api/reports/:id
    EX->>EX: ownership check (report.user == req.user.id)
    EX->>CL: delete file
    EX->>MON: delete Report
    EX->>FA: DELETE /rag/documents/:documentId (RAG_SERVICE_SECRET, userId)
    FA->>PG: delete chunks where document_id + user_id
    FA->>RD: bump indexVersion(userId)
    EX-->>U: {deleted}
```

Security: deletion is owner-scoped in Express **and** FastAPI enforces `user_id` on the delete (ADR-012).

## 4. Re-index Flow (backfill / edit)

- Trigger: backfill script, or report edit/metadata change.
- Steps: fetch source PDF from Cloudinary → extract (Express) or (future) FastAPI → chunk → embed → **replace** old chunks for `document_id` (idempotent) → bump `indexVersion`.

## 5. Evaluation Flow

- Load synthetic de-identified dataset (`evaluation/dataset.json`).
- For each strategy (vector-only / hybrid / hybrid+rerank): run retrieval, compute Recall@K/MRR/Precision@K; run generation, compute faithfulness/answer relevance.
- Emit reproducible report (JSON + markdown) with **measured** numbers only.

## 6. Pending / Future

- Async ingestion worker (ADR-015) and FastAPI-side extraction (ADR-014) are **future options**, not current flows.
