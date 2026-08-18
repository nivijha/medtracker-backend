# ADR-002: rag-service Inside the Backend Repository

## Status
Accepted

## Context
Where should the FastAPI RAG service live: inside `medtracker-backend` or in a standalone `medtracker-rag` repo?

## Decision
`rag-service/` is a sibling directory inside `medtracker-backend/`.

## Alternatives Considered
- **A. Inside `medtracker-backend`** — chosen.
- **B. Separate `medtracker-rag` repository.**

## Why We Chose This
Both repos change together for every RAG feature (Express client + FastAPI service). Co-locating them simplifies cross-cutting PRs, shared env config, and a single docker-compose. The user confirmed this layout.

## Trade-offs
### Advantages
- One PR can touch Express proxy + FastAPI service.
- Shared `.env.example`, single CI workflow can test both.
- Simple local compose referencing both.

### Disadvantages
- Backend repo owns two languages (Node + Python).
- Less independence for the RAG team.

## Consequences
- Easier: ownership, versioning, CI, local dev.
- Harder: independent release cadence of RAG.

## Risks
- Python dependency surface pollutes the Node repo's tooling expectations.

## Mitigation
- `rag-service/` has its own `requirements.txt`, `Dockerfile`, and pytest config; Node tooling ignores it.

## When We Would Reconsider
- If RAG is productized for external tenants, or release cadence diverges significantly → extract to its own repo with an OAuth client (ADR-001).

## Interview Explanation
"We put rag-service inside the backend repo because every RAG feature touches both the Express proxy and the FastAPI service, so co-locating them keeps changes atomic. It's still independently containerizable via its own Dockerfile — repo layout is not the same as deployment boundary."
