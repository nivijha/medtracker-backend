# ADR-001: RAG as a MedTracker Subsystem (not a separate product)

## Status
Accepted

## Context
We need evidence-grounded, cross-document Q&A over a patient's medical records. The question is whether this becomes a new standalone AI product or an extension of MedTracker.

## Decision
RAG is implemented as a **subsystem** of MedTracker: a FastAPI service behind the existing Express API, reusing its auth, MongoDB records, and LLM fallback.

## Alternatives Considered
- **A. Separate AI application** — its own auth, DB, frontend.
- **B. Subsystem of MedTracker** — chosen.

## Why We Chose This
Medical-record retrieval is meaningless without the patient identity, document ownership, and access control that MedTracker already enforces. A separate app would have to reimplement auth, user/record linkage, and the LLM fallback, duplicating logic and creating two sources of truth for access control.

## Trade-offs
### Advantages
- Reuses `protect` auth and `req.user.id` — no second auth system.
- Reuses `Report` metadata and the LLaMA→Gemini fallback.
- Single deployment boundary for access control (Express owns it).

### Disadvantages
- Couples RAG lifecycle to the MedTracker backend repo/CI.
- RAG can't be sold/run independently without MedTracker.

## Consequences
- Easier: access control, user linkage, operations.
- Harder: independent scaling/release of RAG (mitigated by containerization).

## Risks
- A RAG bug could affect the main backend process boundaries (mitigated: separate container/process).

## Mitigation
- FastAPI runs as its own container; Express talks to it over the network only.

## When We Would Reconsider
- If RAG outgrows MedTracker (e.g., offered as a platform to other apps), split into a standalone service with its own auth (OAuth client) — see ADR-002.

## Interview Explanation
"We kept RAG inside MedTracker because it's fundamentally tied to patient identity and access control we already enforce in Express. Building it standalone would have meant reimplementing auth and record ownership, creating two places where a cross-user leak could happen."
