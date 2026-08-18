# ADR-026: Internal Generation Endpoint Security

## Status
Accepted

## Context
FastAPI calls Express to generate text. How is that endpoint protected and scoped?

## Decision
Express exposes `POST /api/ai/generate` as an **internal-only** endpoint, protected by `RAG_SERVICE_SECRET` (header), reachable only on the private Docker network. It is **not** a public, general-purpose LLM endpoint and never receives a browser directly.

## Alternatives Considered
- Public `/api/ai/generate` (rejected: abuse/abuse of LLM spend).
- No auth (rejected: any caller could use the fallback).

## Why We Chose This
Generation is a privileged internal capability (it spends LLM quota and reuses the fallback). Restricting it to the secret + private network keeps the browser out, centralizes auth responsibility in Express (which already owns user auth), and prevents the endpoint from becoming a public chatbot API.

## Trade-offs
### Advantages
- No public LLM surface; single auth boundary; quota control.

### Disadvantages
- FastAPI must hold the secret; secret rotation needed.

## Consequences
- Easier: clear trust boundary; auditability.

## Risks
- Secret leak → internal LLM abuse (mitigated: private network + rotation + rate limits).

## Mitigation
- Secret via env only (never hardcoded); rate-limited; timeouts/retries in FastAPI; not exposed through ingress.

## When We Would Reconsider
- If RAG needs its own model set distinct from the summary fallback, generation may move into FastAPI behind its own auth (ADR-004).

## Interview Explanation
"The generate endpoint is internal-only, guarded by a service secret and only reachable on the private network — the browser never touches it. That keeps a single auth boundary in Express, prevents it becoming a public LLM endpoint, and centralizes LLM-quota control."
