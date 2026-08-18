# ADR-017: Abstention / Grounding Threshold

## Status
Accepted — **threshold is an initial default, validated by experiment**

## Context
What should the system do when retrieval returns weak or irrelevant evidence?

## Decision
If the aggregated **`evidenceScore`** falls below `EVIDENCE_THRESHOLD`, the system **abstains** and returns a structured "insufficient evidence" response (`grounded: false`, `answer` stating evidence was insufficient, empty `sources`) rather than generating a fabricated answer.

## Alternatives Considered
- **A. Always answer** (send whatever to the LLM).
- **B. Answer only with sufficient evidence** — chosen.

## Why We Chose This
Hallucination is especially dangerous with medical records: inventing a lab value or a non-existent medication is harmful and erodes trust. Abstention converts "I don't know from your records" into a safe, explicit, structured outcome. This is an **information retrieval/summarization** system, not a diagnostic one (ADR-028).

## Trade-offs
### Advantages
- Strong hallucination guard; predictable safe behavior; clear UX.

### Disadvantages
- Risk of false negatives (abstaining when evidence existed but scored low).

## Consequences
- Easier: safe defaults; auditable responses.

## Risks
- Threshold too high → over-abstention; too low → unsafe answers.

## Mitigation
- `EVIDENCE_THRESHOLD` is configurable; tuned via the evaluation benchmark (faithfulness vs abstention rate); reranker + fusion quality feed the score.

## When We Would Reconsider
- If eval shows high false-negative rates, raise threshold or improve retrieval; never remove abstention.

## Interview Explanation
"We abstain when evidenceScore is below a tuned threshold, returning a structured 'insufficient evidence' answer instead of letting the model invent values. For medical records, a fabricated LDL number is far worse than saying we couldn't find it — so safe abstention beats a confident hallucination."
