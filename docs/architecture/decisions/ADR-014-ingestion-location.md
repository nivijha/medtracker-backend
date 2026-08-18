# ADR-014: Document Ingestion Location (Express-side extraction for V1)

## Status
Accepted for V1 — **future migration path documented**

## Context
Who extracts text from the uploaded PDF: Express or FastAPI?

## Decision
**V1: Extract text in Express** using the existing `services/pdfExtractionService.js`, then send the extracted text (plus metadata) to FastAPI for chunking/embedding/indexing.

## Alternatives Considered
- **A. Extract in Express** — chosen for V1.
- **B. Extract in FastAPI** (send raw PDF).
- **C. Dedicated async ingestion worker.**

## Why We Chose This (V1)
We already have a working, tested PDF extraction service in Node. Reusing it means no new parser dependency in Python and no change to the upload controller's responsibilities for V1. The FastAPI service receives clean text + metadata and focuses on retrieval concerns.

## Trade-offs
### Advantages
- Code reuse; faster to ship; one fewer parser to maintain now.

### Disadvantages
- Express ships potentially large **text payloads** (and, if we later sent bytes, large PDFs) over HTTP to FastAPI.

## Consequences
- Easier: reuse; V1 velocity.

## Risks
- Large documents increase inter-service payload; extraction logic lives outside the RAG service.

## Mitigation / Future
- **Migration path**: move extraction into FastAPI (or a dedicated worker) to avoid sending large raw documents and to colocate parsing with chunking. This becomes attractive when documents are large or ingestion is asynchronous (ADR-015). Until then, V1 reuses Express extraction by decision.

## When We Would Reconsider
- When documents are large, or ingestion moves to a background worker/queue — extraction should colocate with the ingestion pipeline.

## Interview Explanation
"For V1 we extract text in Express with the service we already have, then hand clean text and metadata to FastAPI. It's the fastest correct path. The documented future is to move extraction into the RAG service or a worker so we stop shipping large document payloads across the network — but we don't need that complexity yet."
