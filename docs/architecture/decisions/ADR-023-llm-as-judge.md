# ADR-023: LLM-as-Judge (Optional)

## Status
Proposed / Optional — **not the primary evaluator**

## Context
Some generation metrics (faithfulness, answer relevance) could be scored by an LLM judge instead of heuristics.

## Decision
LLM-as-judge is an **optional, secondary** evaluator behind a flag. The primary faithfulness/answer-relevance checks are deterministic/heuristic; the LLM judge, when enabled, provides a semantic cross-check.

## Alternatives Considered
- Make LLM-as-judge the only evaluator (rejected).
- No LLM judge at all (acceptable baseline).

## Why We Chose This (as optional)
LLM judges scale well for semantic evaluation but carry **judge bias, model dependence, cost, and reproducibility concerns**. They are not ground truth. Keeping them optional protects reproducibility and cost while allowing a richer signal when needed.

## Trade-offs
### Advantages
- Semantic nuance; scalable labeling.

### Disadvantages
- Bias, cost, non-determinism, reproducibility risk.

## Consequences
- Easier: optional richer signal.

## Risks
- Treating judge output as truth; cost creep.

## Mitigation
- Judge runs only when explicitly enabled; results labeled as judge-based; primary metrics remain heuristic/deterministic.

## When We Would Reconsider
- If heuristic faithfulness proves too coarse, promote a calibrated judge with fixed model+prompt and versioned results.

## Interview Explanation
"We treat LLM-as-judge as an optional secondary signal, not ground truth. It's useful for semantic nuance but brings bias, cost, and reproducibility risk, so our primary faithfulness and answer-relevance checks stay deterministic and the judge is opt-in."
