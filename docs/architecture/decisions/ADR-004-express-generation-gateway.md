# ADR-004: Express as the Generation Gateway

## Status
Accepted

## Context
Grounded generation must run somewhere. The existing LLaMA→Gemini fallback lives in Node (`reportSummaryService`, `llama_chat`, `gemini`). Where should FastAPI generate text?

## Decision
FastAPI calls a new **internal** Express endpoint `POST /api/ai/generate`, which wraps the existing LLaMA→Gemini fallback. FastAPI never calls LLaMA/Gemini directly.

## Alternatives Considered
- **A. FastAPI → Express `/api/ai/generate`** — chosen.
- **B. FastAPI → LLaMA/Gemini directly.**
- **C. Move all generation into FastAPI.**

## Why We Chose This
The fallback logic (LLaMA first, Gemini on failure) is already implemented, tested, and configured in Node with `NVIDIA_API_KEY`/`HF_TOKEN`/`GEMINI_API_KEY`. Reusing it keeps a **single source of truth** for provider config and fallback behavior, and avoids duplicating provider clients in Python. The RAG `GenerationClient` is an interface, so it can be mocked in tests and swapped later.

## Trade-offs
### Advantages
- No duplicated LLM client/fallback code.
- Provider keys stay in one place (Node env).
- RAG tests mock the HTTP client — fully testable.

### Disadvantages
- **FastAPI depends on Express being available for generation** (runtime coupling).

## Consequences
- Easier: fallback consistency, ops, testing.
- Harder: one more network hop per generation; Express is now on the RAG critical path.

## Risks
- If Express `/api/ai/generate` is down, RAG generation fails even if retrieval succeeded.

## Mitigation
- Internal endpoint on the private Docker network; `RAG_SERVICE_SECRET`; FastAPI applies its own timeout + retries; if generation fails after retries, RAG still returns retrieved evidence with `grounded:false`/abstention (see ADR-017).

## When We Would Reconsider
- If generation latency/coupling becomes a bottleneck, or if we want RAG to use a different model set than the summary pipeline → move generation into FastAPI behind the same `GenerationClient` interface.

## Interview Explanation
"FastAPI delegates generation back to Express so we reuse the existing LLaMA→Gemini fallback instead of duplicating it in Python. The trade-off is a runtime dependency on Express, but it's on a private network with a secret, and if generation fails we still return retrieved evidence with an abstention rather than a blank answer."
