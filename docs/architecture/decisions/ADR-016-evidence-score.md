# ADR-016: Evidence Score (not "confidence")

## Status
Accepted — **terminology decision (per user MODIFY #1)**

## Context
We need a number conveying how well the retrieved evidence supports an answer. Call it "confidence"?

## Decision
Use **`evidenceScore`** (and a related `groundingScore`/grounded flag) — **not** `confidence`. The score is explicitly **not a calibrated probability or a medical-confidence estimate**.

## Alternatives Considered
- `confidence` (rejected as misleading).
- `evidenceScore` / `groundingScore` (chosen).

## Why We Chose This
In healthcare, "confidence" implies clinical certainty. A retrieval/rerank score is a **relevance signal**, not a statement about medical truth. Calling it `evidenceScore` keeps the semantics honest: it reflects how strongly the retrieved passages bear on the question, not whether the answer is clinically correct. It must never be presented to users as a diagnostic confidence.

## Trade-offs
### Advantages
- Honest semantics; avoids implying clinical certainty; safer in a medical UI.

### Disadvantages
- Slightly less familiar term than "confidence".

## Consequences
- Easier: defensible UI language; clear metric meaning.

## Risks
- Frontend/consumers might still misinterpret; mitigated by schema docs + UI labeling.

## Mitigation
- Response schema documents the field as "retrieval/rerank relevance, not a probability". UI shows it as an evidence indicator, not a percentage-certainty.

## When We Would Reconsider
- Never rename to "confidence"; if we ever produce a true calibrated estimate, it would be a separate, clearly-labeled field.

## Interview Explanation
"We deliberately call it evidenceScore, not confidence. A reranker score is a relevance signal, not clinical certainty. In a medical product, the word confidence implies diagnostic assurance we are explicitly not making — so the naming keeps the semantics honest and the UI safe."
