# Experiments

> Experiments convert **Assumptions** into **Results** and drive **Decisions**.
> Rule: **never present an assumption as a measured result, and never fabricate numbers.**
> If an experiment has not been run, mark it **Not yet evaluated**.

## How to add an experiment
Create `experiments/EXP-XXX-title.md` with:
```
# Experiment XXX — <title>
## Hypothesis
## Variables
## Baseline
## Method
## Metrics
## Results  (or: Not yet evaluated.)
## Interpretation
## Decision
## Follow-up
```

## Planned / Tracked Experiments

| ID | Topic | Status |
| --- | --- | --- |
| EXP-001 | Chunk size / overlap comparison (retrieval quality) | Not yet evaluated |
| EXP-002 | Embedding model: MiniLM vs alternative (recall/MRR) | Not yet evaluated |
| EXP-003 | Vector-only vs Hybrid retrieval | Not yet evaluated |
| EXP-004 | Hybrid vs Hybrid + CrossEncoder reranking | Not yet evaluated |
| EXP-005 | Reranker latency vs candidate-set size | Not yet evaluated |
| EXP-006 | Evidence threshold tuning (faithfulness vs abstention rate) | Not yet evaluated |
| EXP-007 | Cache effectiveness (hit rate, latency saved) | Not yet evaluated |
| EXP-008 | Exact vs approximate vector index (latency at scale) | Not yet evaluated |
| EXP-009 | Query-rewrite necessity (dependency classifier accuracy) | Not yet evaluated |

## Decision evolution log
- **Initial hypothesis**: vector-only retrieval is sufficient.
- **Expected after EXP-003**: hybrid outperforms on terminology-heavy medical queries → adopt hybrid (ADR-008 already assumes this; EXP-003 confirms).
- **Initial hypothesis**: no reranking needed.
- **Expected after EXP-004**: CrossEncoder improves top-K relevance → adopt reranking (ADR-007).
- **Initial default**: `EVIDENCE_THRESHOLD` value TBD.
- **After EXP-006**: threshold set from faithfulness/abstention trade-off.

All thresholds and model choices marked "initial default" in the ADRs are owned by these experiments.
