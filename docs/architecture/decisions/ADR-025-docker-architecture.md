# ADR-025: Docker Architecture

## Status
Accepted

## Context
How are the services containerized and networked?

## Decision
A root `docker-compose.yml` (in `medtracker-backend`) defines: `frontend` (build `../medtracker-frontend`), `backend` (build `.`), `mongo`, `redis`, `rag-service` (build `./rag-service`), `postgres` (`pgvector/pgvector`). Env via `.env`. RAG talks to Express over the internal network using `RAG_SERVICE_SECRET`.

## Alternatives Considered
- Single mega-container (rejected: no isolation).
- Kubernetes-only (overkill for this scale).

## Why We Chose This
Each concern is its own container with clear boundaries; Postgres/Redis/Mongo are standard images; the RAG service has its own `Dockerfile`. This matches the subsystem design (ADR-001) and keeps local dev one command.

## Trade-offs
### Advantages
- Clear boundaries; reproducible local env; independent scaling later.

### Disadvantages
- More moving parts; compose references a sibling frontend path.

## Consequences
- Easier: local full-stack run; production-shaped topology.

## Risks
- The compose file depends on `../medtracker-frontend` existing (local-dev convenience, not canonical prod).

## Mitigation
- Documented: the sibling-frontend reference is a **local development convenience**, not the production deployment model (prod may deploy frontend separately). Backend+rag do not depend on the sibling path for their own function.

## When We Would Reconsider
- In production, deploy each service via its own pipeline; compose is for local dev only.

## Interview Explanation
"Each service is its own container — frontend, backend, mongo, redis, the FastAPI RAG service, and a pgvector Postgres — wired on an internal network. The compose file referencing the sibling frontend repo is a local-dev convenience, not the production model; in prod each deploys independently."
