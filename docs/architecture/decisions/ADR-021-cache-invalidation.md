# ADR-021: Cache Invalidation via `userId + indexVersion + queryHash`

## Status
Accepted (per user MODIFY #3)

## Context
When a user uploads/deletes/re-indexes a report, cached RAG answers become stale. How do we invalidate safely?

## Decision
Cache key shape: `rag:{userId}:{indexVersion}:{queryHash}` (plus a sub-key per cache level). Each user has an **`indexVersion`** counter, bumped on any index/delete/re-index for that user. Old-version keys are simply orphaned and expire via TTL; we do **not** attempt to enumerate and delete every affected query cache.

## Alternatives Considered
- **A. Delete every affected query cache on change** (tag-scan / prefix delete).
- **B. Time-based TTL only** (risk serving stale answers for the whole TTL).
- **C. Versioned keys (`userId + indexVersion + queryHash`)** — chosen.

## Why We Chose This
Scanning/deleting all query caches for a user is fragile (you must know every key, across levels) and can miss entries. Bumping `indexVersion` makes all prior keys logically invalid at once; new queries use the new version, and old keys die via TTL without manual enumeration. This is safer than "discover every stale cache."

## Trade-offs
### Advantages
- Safe, simple invalidation; no key enumeration; no cross-user leakage.

### Disadvantages
- Old keys linger until TTL (bounded; acceptable); needs version storage.

## Consequences
- Easier: correct cache isolation; low operational risk.

## Risks
- Version store outage → can't invalidate (mitigated: bump on every mutation; fallback to TTL).

## Mitigation
- `indexVersion` stored durably (Postgres or Redis); bumped atomically on index/delete; documented TTL per level.

## When We Would Reconsider
- If TTL-window staleness is unacceptable → also explicitly delete the user's key prefix on version bump (defense in depth).

## Interview Explanation
"Instead of hunting down every stale query cache when a record changes, we bump a per-user indexVersion and include it in the cache key. All old keys become logically invalid at once and expire via TTL — safer than trying to enumerate and delete keys we might miss, and it inherently prevents serving one user's cache to another."
