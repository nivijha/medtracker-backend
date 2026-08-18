# 00 — Existing System Analysis

> **Labeling convention used throughout this document set:**
> - **Fact** — verified from the actual repository.
> - **Decision** — intentionally chosen by the project.
> - **Assumption** — believed but not yet verified.
> - **Experiment** — currently being tested.
> - **Result** — measured.
> - **Future option** — may be considered later.

---

## 1. Current Architecture (Fact)

MedTracker is a full-stack healthcare-record management application. It is split across **two separate git repositories**:

- `medtracker-backend` — Node.js / Express REST API (this repo).
- `medtracker-frontend` — Next.js 16 (App Router) client (separate repo).

The backend is the application database owner and the integration point for all AI features.

### 1.1 Backend stack (Fact)

| Concern | Implementation | Source |
| --- | --- | --- |
| Runtime / framework | Node.js, Express 5, ESM (`"type": "module"`) | `package.json`, `index.js` |
| Primary database | MongoDB via Mongoose | `config/db.js`, `models/*` |
| Auth | JWT (`protect` middleware, Bearer or cookie) + Google OAuth | `middleware/authMiddleware.js`, `models/User.js` |
| File storage | Cloudinary (raw upload for PDF/doc) | `config/cloudinary.js`, `middleware/uploadMiddleware.js` |
| Cache | Redis (generic get/set/del + summary cache) | `config/redis.js`, `services/summaryCacheService.js` |
| PDF text extraction | `pdf-parse` (via `createRequire`) | `services/pdfExtractionService.js` |
| LLM — chat/intent | NVIDIA OpenAI-compatible API, `meta/llama-3.1-70b-instruct` | `config/llama_chat.js` |
| LLM — summary (primary) | HuggingFace Inference, `meta-llama/Llama-3.1-8B-Instruct:novita` | `config/llama_summary.js` |
| LLM — summary (fallback) | Google `gemini-2.5-flash` | `config/gemini.js` |
| Fallback orchestration | LLaMA → Gemini | `services/reportSummaryService.js` |
| Structured logging | Winston (JSON file + console) | `utils/logger.js` |
| Security middleware | helmet, cors, express-rate-limit, morgan | `index.js` |
| Tests | vitest + supertest + mongodb-memory-server | `package.json`, `tests/` |
| CI | GitHub Actions (Node 22, mongo-memory, Render deploy hook) | `.github/workflows/ci.yml` |

### 1.2 Data models (Fact)

Mongoose models: `User`, `Report`, `Appointment`, `Medication`, `Test`, `Healthmetric`, `ContactMessage`.

`Report` (the model most relevant to RAG) — `models/Report.js`:

- `user` — ObjectId ref User (required)
- `type` — enum `lab | imaging | pathology | cardiology | other` (required)
- `fileUrl` — Cloudinary URL (required)
- `cloudinaryId` — Cloudinary public id (required)
- `description`, `doctorName` — optional strings
- `reportDate` — Date (required)
- `summary`, `summaryGeneratedAt` — AI summary + timestamp
- index: `{ user: 1, createdAt: -1 }`

### 1.3 Report upload & analysis flow (Fact)

1. `POST /api/reports/upload` (`routes/reportRoutes.js`) → `protect` → `upload.single("file")` (Cloudinary raw) → `reportController.uploadReport` creates a `Report`.
2. `GET /api/reports/:id/analyze` → fetches PDF bytes from `fileUrl`, runs `extractTextFromPdf`, calls `generateReportSummary` (LLaMA→Gemini), persists `summary` to Mongo, caches in Redis (`report:summary:${id}`, 30-day TTL).
3. `GET /api/reports/:id/pdf` streams the PDF from Cloudinary through the backend (auth + ownership check).

### 1.4 Chatbot (Fact)

`POST /api/chatbot/chat` → `chatbotController.chatWithAI`:
- Calls LLaMA (`llama_chat`) for **intent classification** (JSON-only prompt).
- Maps intent → DB action (view/cancel appointments, add/remove meds, view reports).
- Treats anything outside appointments/medications/reports as `out_of_scope`.
- This is an **action-oriented** assistant, not a document-QA system.

### 1.5 Frontend (Fact, separate repo)

- Next.js 16 App Router, Tailwind, lucide-react, axios.
- `src/lib/utils.js` exports an axios `API` instance (`NEXT_PUBLIC_API_URL`, `withCredentials`, Bearer token cookie interceptor) plus per-domain helpers.
- `AuthContext` reads `/api/auth/me`; navbar (`LoggedInNavbar.jsx`) links: Dashboard, Appointments, Medications, Reports.
- Floating `ChatBot.jsx` posts to `/api/chatbot/chat`.
- Protected routes live under `src/app/(protected)/`.

---

## 2. Major Components (Fact)

- **Auth layer** — JWT issue/verify + Google OAuth; `protect` sets `req.user`.
- **Report domain** — upload, list, delete, analyze, PDF stream.
- **AI summary pipeline** — PDF extraction → LLaMA→Gemini fallback → cache.
- **Chatbot** — intent routing to CRUD operations.
- **Redis cache** — report summaries (extends to RAG later).
- **Existing tests + CI** — must remain green after RAG work.

---

## 3. Data Flow (Fact, today)

```
Browser → Next.js → Express (/api/*)
                       ├─ auth (JWT)
                       ├─ MongoDB (Mongoose)
                       ├─ Cloudinary (file storage)
                       ├─ Redis (summary cache)
                       ├─ LLaMA (NVIDIA) ─┐
                       ├─ Gemini (fallback) ┘  via reportSummaryService
                       └─ pdf-parse (extraction)
```

---

## 4. Current Strengths (Fact / Assessment)

- Clear, additive REST design; auth already centralized via `protect`.
- AI fallback (LLaMA→Gemini) already exists and is reusable.
- Report metadata (`user`, `type`, `reportDate`) is exactly what RAG metadata filtering needs.
- Test harness (vitest + mongo-memory + mocks) is mature and easy to extend.
- PDF extraction service already isolates parsing from controllers.

---

## 5. Current Limitations (Fact / Assessment)

- **No semantic search.** Reports are only listed/summarized; there is no cross-document retrieval.
- **No vector store.** MongoDB holds reports but no embeddings.
- **No grounding/abstention.** Summaries are single-document and not evidence-cited across records.
- **No conversation memory** for follow-up medical-record questions.
- **No evaluation harness** for retrieval/generation quality.
- **No Docker / compose** in either repo.
- RAG-specific concerns (pgvector, FastAPI, reranking, citations) do not exist yet.

---

## 6. Integration Points for RAG (Fact → planned)

| Existing asset | How RAG reuses it |
| --- | --- |
| `protect` / `req.user.id` | Gate all `/api/rag/*`; pass `userId` to FastAPI |
| `models/Report.js` | Source of chunk metadata (`user`, `type`, `reportDate`, `fileUrl`) |
| `services/pdfExtractionService.js` | Extract text server-side before indexing (V1) |
| `config/llama_chat.js`, `config/gemini.js`, `services/reportSummaryService.js` | Back the new internal `/api/ai/generate` fallback |
| `config/redis.js` | Pattern reference; FastAPI implements its own Redis cache |
| `tests/` mocks | Template for RAG client / generation mocks |

---

## 7. What This Analysis Does NOT Claim

- It does **not** assume a frontend RAG UI exists (it does not yet).
- It does **not** assume Docker/compose exists (it does not yet).
- It does **not** assume any pgvector/FastAPI code exists (none does).
- It does **not** assume a specific chunk size, embedding model id, or threshold — these are **initial defaults validated by experiment** (see `docs/experiments/`).
