# ADR-027: Observability

## Status
Accepted

## Context
What should we log for a medical RAG system?

## Decision
Structured (JSON) logs in FastAPI include: `query_id`, `user_id`, `retrieval_latency_ms`, `num_candidates`, `rerank_latency_ms`, `generation_latency_ms`, `cache_hit`, `num_sources`, `grounded`/`abstained`. **Raw chunk text, full documents, and other PHI must never be logged.**

## Alternatives Considered
- Log full retrieved text for debugging (rejected: PHI leak).
- No structured fields (rejected: can't diagnose).

## Why We Chose This
We need to diagnose latency, cache effectiveness, and grounding outcomes without exposing patient data. Logging metadata (counts, latencies, ids) gives operational visibility while keeping PHI out of logs. This is a compliance and safety requirement, not a nice-to-have.

## Trade-offs
### Advantages
- Debuggable + PHI-safe; supports SLO/latency analysis.

### Disadvantages
- Can't see exact text in logs (acceptable; use redaction/truncation if ever needed).

## Consequences
- Easier: incident diagnosis; safe audits.

## Risks
- Accidental PHI log via exception stack traces (mitigated: logger excludes payloads).

## Mitigation
- Logging helper rejects document/chunk text fields; only ids/metrics/counts logged.

## When We Would Reconsider
- Never log PHI; if deep debugging is needed, use a separate redacted/trace mechanism.

## Interview Explanation
"We log query id, user id, latencies, candidate counts, cache hits, source counts, and grounded/abstained — but never the retrieved text or documents. That gives us full operational visibility to diagnose latency and grounding while keeping patient data out of logs, which is a hard compliance requirement."
