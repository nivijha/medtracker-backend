# ADR-019: Query Rewriting — Only When Context-Dependent

## Status
Accepted (per user MODIFY #4)

## Context
Follow-up questions ("What about 2024?") need conversation context to become standalone queries. Should we rewrite every query?

## Decision
**Rewrite only when the query depends on conversation history.** A lightweight "needs-rewrite" check (deictic/pronoun/short-follow-up heuristics, e.g., "what about 2024?", "and the other one?") gates the rewriter. Default = **no rewrite** (use the query as-is).

## Alternatives Considered
- **A. No rewriting.**
- **B. Rewrite every query** (always call LLM to expand).
- **C. Rewrite only context-dependent follow-ups** — chosen.

## Why We Chose This
Rewriting is an LLM call with latency/cost. Most first-turn queries are already standalone ("Compare my cholesterol over two years"). Forcing a rewrite on every query wastes time and can even inject errors. Gating on dependency keeps follow-ups working while avoiding unnecessary calls.

## Trade-offs
### Advantages
- Lower latency/cost; fewer LLM-introduced errors; still supports follow-ups.

### Disadvantages
- Heuristic may miss some ambiguous queries (false negative → weaker retrieval).

## Consequences
- Easier: cheaper queries; keeps conversation support.

## Risks
- Missed rewrites for subtle context dependence.

## Mitigation
- Heuristic is conservative + the rewriter prompt includes prior turns; can be upgraded to an LLM classifier later behind the same interface.

## When We Would Reconsider
- If users frequently ask ambiguous follow-ups that retrieval mishandles → upgrade to an LLM-based dependency classifier.

## Interview Explanation
"We only rewrite queries that actually depend on conversation history, using a lightweight check first. Most queries are already standalone, so rewriting everything would just add latency and a chance of introducing errors for no benefit — we spend the LLM call only when it's needed."
