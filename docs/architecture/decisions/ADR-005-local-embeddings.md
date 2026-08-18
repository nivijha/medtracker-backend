# ADR-005: Local Embeddings (sentence-transformers MiniLM)

## Status
Accepted (initial default — model choice validated by experiment)

## Context
How should we embed chunks? Options: local models vs hosted APIs.

## Decision
Use **local** `sentence-transformers/all-MiniLM-L6-v2` (384-dim) inside the FastAPI service.

## Alternatives Considered
- **A. Local sentence-transformers** — chosen.
- **B. Hosted OpenAI embeddings.**
- **C. Hosted NVIDIA embeddings.**
- **D. Other hosted providers (Cohere, Voyage, etc.).**

## Why We Chose This
- **Privacy**: medical text never leaves our process to a third-party API.
- **Cost**: no per-token embedding billing.
- **Reproducibility**: "locally hosted and reproducible under a fixed model/runtime configuration" — same model + pinned versions yield stable embeddings for evaluation.
- **No network dependency** at query time for embedding.
- **Control**: we can swap the model behind the `EmbeddingProvider` interface without changing retrieval code.

## Trade-offs
### Advantages
- No external cost/latency; PHI stays in-process; reproducible evals.

### Disadvantages
- CPU/RAM usage; larger image; model load time; throughput bounded by local hardware.

## Consequences
- Easier: compliance, eval stability, offline operation.
- Harder: scaling embedding throughput (mitigated by async/batch + future workers).

## Risks
- Local models are **not automatically deterministic** across hardware/threading; we pin versions and document the config.

## Mitigation
- Pin `sentence-transformers` + model versions; document hardware assumptions; benchmark in `docs/experiments/`.

## When We Would Reconsider
- If we need a stronger embedding model that is only available hosted, or if embedding throughput becomes a bottleneck at scale — then evaluate hosted APIs behind the same interface.

## Interview Explanation
"We chose local MiniLM embeddings so medical text never leaves our process, there's no per-token cost, and evaluation is reproducible under a fixed model/runtime. The trade-off is CPU/RAM and image size, which is acceptable at our scale and behind a swappable EmbeddingProvider interface."
