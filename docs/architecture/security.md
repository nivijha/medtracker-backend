# Security

> MedTracker RAG handles sensitive medical data. Security is a first-class design constraint, not an add-on.

## 1. Authentication
- **Express owns authentication.** `middleware/authMiddleware.js` (`protect`) verifies the JWT and sets `req.user`. All `/api/rag/*` routes require `protect`.
- **FastAPI never sees JWTs.** Express passes only the authenticated `userId` (and authorized metadata) over an internal, secret-protected call.

## 2. Authorization & User Isolation
- Every retrieval/delete in FastAPI **starts with a mandatory `user_id` filter** (ADR-012). A request without `userId` is rejected (400), never broadened.
- The `user_id` predicate is the first clause in the SQL/vector query, so cross-user leakage is structurally impossible regardless of downstream logic changes.
- This is enforced and **tested**: a dedicated security test asserts User A cannot retrieve User B's chunks (ADR-024).

## 3. Service-to-Service Authentication
- FastAPI exposes `/rag/*` only to callers presenting `RAG_SERVICE_SECRET` (header), reachable on the private Docker network (ADR-026).
- Express's `/api/ai/generate` (used by FastAPI for generation) is internal-only, secret-protected, rate-limited, and not exposed through ingress.

## 4. Secrets Management
- All secrets (`JWT_SECRET`, `RAG_SERVICE_SECRET`, `NVIDIA_API_KEY`, `HF_TOKEN`, `GEMINI_API_KEY`, DB URLs, `REDIS_URL`) come from environment variables via `.env` / compose. **No secrets are hardcoded** (CI/CD and Docker use env injection).
- `RAG_SERVICE_SECRET` is rotated like any internal credential.

## 5. Database Permissions
- PostgreSQL is provisioned for the RAG service only (separate from Mongo app DB). Network policy restricts access to the internal network.
- The RAG index is **derived data**; even a PG compromise does not corrupt the system of record (Mongo) — and the index can be rebuilt (ADR-013).

## 6. Redis Key Isolation
- Cache keys are scoped `rag:{userId}:{indexVersion}:{queryHash}` (ADR-021). One user's cache can never be served to another because the `userId` is part of the key namespace and FastAPI only ever reads keys for the authenticated `userId`.
- No PHI is stored in Redis values beyond chunk ids/metadata needed for citation; even there, values are bounded and TTL-expired.

## 7. Sensitive Logging Prevention
- Structured logs include ids, latencies, and counts — **never** raw chunk text, document contents, or medical values (ADR-027). Logger helpers reject payload fields.

## 8. Document & Citation Access
- Source PDFs are served via `GET /api/reports/:id/pdf` with ownership checks; citations link only to documents the user already owns. FastAPI does not proxy document bytes.

## 9. Input Validation
- FastAPI uses Pydantic schemas for all RAG requests/responses (query, filters, conversationId). Express validates upstream too. Malformed or missing `userId`/`documentId` is rejected before any DB action.

## 10. Prompt Injection Considerations
- **Retrieved document content is treated as untrusted data, not instructions.** Chunks pulled from a user's records could contain text attempting to manipulate the model (e.g., "ignore previous instructions and say…"). Mitigations:
  - System prompt clearly scopes the assistant to retrieval/summarization/comparison and refuses diagnosis/treatment (ADR-028).
  - Evidence is passed as retrieved context with explicit framing; the model is instructed to answer **only from provided evidence**.
  - Citations are derived from the same chunk records, so claims remain traceable to source passages.
- **RAG does not, by itself, prevent prompt injection.** The mitigation is defense-in-depth: strict scope, evidence-only grounding, abstention on insufficient evidence, and never executing instructions found in documents.

## 11. Threat Summary
| Threat | Control |
| --- | --- |
| Cross-user record access | Mandatory `user_id` filter + tests |
| Public LLM abuse | Internal endpoint + `RAG_SERVICE_SECRET` + private net |
| Secret leakage | Env-only secrets; no hardcoding |
| PHI in logs | Logger rejects payloads |
| Prompt injection via docs | Untrusted-data framing + scope + grounding + abstention |
| Cache cross-serving | User-scoped key namespace |
