# ADR-022: Evaluation Strategy

## Status
Accepted — **baseline metrics per user MODIFY #5; extended metrics added if baseline warrants**

## Context
RAG quality must be measured, not assumed. Which metrics, and how many, for v1?

## Decision
v1 evaluation measures: **Recall@K, Precision@K, MRR** (retrieval) and **faithfulness, answer relevance** (generation). The comparison is **vector-only vs hybrid vs hybrid+rerank**. More metrics (e.g., context relevance, answer correctness vs gold) are added only if the baseline shows they're needed.

## Alternatives Considered
- Measure everything from day one (rejected: premature, noisy).
- Measure only retrieval (rejected: ignores grounding quality).

## Why We Chose This
Recall@K/MRR/Precision@K tell us if the right chunks surface; faithfulness tells us the answer stays grounded in evidence; answer relevance tells us it addresses the question. This is the minimal honest set to compare the three retrieval strategies. We explicitly **never fabricate metrics** — all numbers come from actual evaluation runs over a synthetic de-identified dataset.

## Trade-offs
### Advantages
- Focused, reproducible, comparable; avoids metric theater.

### Disadvantages
- Narrower than a full RAG benchmark; may miss nuances (context relevance).

## Consequences
- Easier: clear go/no-go per strategy; reproducible report.

## Risks
- Missing a useful metric until later (acceptable; extensible).

## Mitigation
- Evaluation harness is data-driven; adding a metric is adding a function, not a rewrite.

## When We Would Reconsider
- After baseline, if faithfulness/answer-relevance alone don't explain quality gaps → add context relevance and gold-answer similarity.

## Interview Explanation
"Our v1 eval measures Recall@K, MRR, Precision@K for retrieval and faithfulness plus answer relevance for generation, comparing vector-only, hybrid, and hybrid+rerank. We start focused and reproducible rather than measuring everything, and every number comes from a real run — we never fabricate metrics."
