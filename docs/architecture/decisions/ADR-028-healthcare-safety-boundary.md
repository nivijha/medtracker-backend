# ADR-028: Healthcare Safety Boundary

## Status
Accepted

## Context
What is the product allowed to do? This is both a safety and an architectural decision.

## Decision
The RAG assistant supports only: **retrieval, summarization, longitudinal comparison, locating information in records, and evidence-backed record questions**. It does **not** perform autonomous diagnosis, treatment recommendations, or medication recommendations.

## Alternatives Considered
- Broaden to diagnostic/treatment suggestions (rejected: safety + scope).
- Narrow to retrieval only (rejected: comparison/summarization are safe and valuable).

## Why We Chose This
Narrowing the problem is deliberate: it reduces harm, simplifies the prompt/contract, and matches the legal/ethical envelope of a personal health-record tool. The system is explicitly an **information retrieval/summarization** assistant, not a clinician. The boundary is enforced by system prompt and a UI disclaimer.

## Trade-offs
### Advantages
- Lower liability; clearer UX; easier to validate grounding.

### Disadvantages
- Won't answer "what should I take for X" (by design).

## Consequences
- Easier: safer defaults; defensible scope.

## Risks
- Users may still ask diagnostic questions; mitigated by prompt refusal + UI disclaimer.

## Mitigation
- System prompt instructs refusal of diagnosis/treatment; responses stay evidence-grounded; UI shows a non-diagnostic disclaimer.

## When We Would Reconsider
- Only with clinical governance, disclaimers, and likely human-in-the-loop review — out of scope for this project.

## Interview Explanation
"We deliberately bounded the assistant to retrieval, summarization, and comparison — never diagnosis or treatment advice. That's both a safety decision and an architectural one: it shrinks the prompt's responsibilities, keeps grounding honest, and keeps us inside the envelope of a personal health-record tool rather than a clinical system."
