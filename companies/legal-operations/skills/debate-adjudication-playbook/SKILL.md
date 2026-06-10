---
name: debate-adjudication-playbook
description: Adjudicate conflicting specialist positions into a structured memo with a reasoned recommendation, then merge the surviving positions into one consolidated work product after the operator decides.
metadata:
  sources:
    - path: companies/legal-operations/skills/debate-adjudication-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Debate Adjudication and Reconciliation Playbook

Use this skill in two stages. The adjudication stage (used by `debate-judge`) turns two conflicting specialist work products or positions into a structured memo the operator can decide from. The reconciliation stage (used by `reconciler`) merges the surviving positions into one clean consolidated work product after the operator has decided. The operator decides between the stages; the skill never does.

## Fair-Restatement Rules

Before judging anything, restate each position so its author would say "yes, that is my position":

- Restate each position in its strongest form, including its best evidence, before noting any weakness.
- Use each author's own key terms and quoted language; do not relabel a position with loaded words its author did not use.
- Keep restatements symmetric in depth and tone; if one position gets three paragraphs of steelmanning, so does the other.
- If a position is ambiguous on a load-bearing point, record the ambiguity and the readings it permits rather than picking one silently.

## Disagreement Taxonomy

Classify every point of conflict before weighing it:

- **Factual** — the positions assert different facts (a date, a clause's text, what a document says). Resolvable by checking the source; the memo cites the check, it does not arbitrate.
- **Interpretive** — the positions read the same material differently (what a clause permits, how terms interact). This is where reasoned adjudication applies.
- **Preference** — the positions weight business priorities differently (risk appetite, speed versus protection). These belong to the operator; the memo states the tradeoff and stops.

Separately mark apparent conflicts that are actually **misunderstandings** — positions that answer different questions or rest on different unshared assumptions. A misunderstanding is dissolved by stating both questions, not adjudicated.

## Adjudication Memo Structure

Produce the memo in this order:

1. **Matter and conflict statement** — one paragraph: the work products in conflict, their authors, and the decision the conflict blocks.
2. **Position A, restated fairly** — per the fair-restatement rules, with the evidence it cites.
3. **Position B, restated fairly** — same depth and structure.
4. **Points of genuine disagreement** — each classified factual, interpretive, or preference, with the evidence each side cites on that point.
5. **Misunderstandings dissolved** — apparent conflicts that vanish once assumptions are stated, with the clarifying statement.
6. **Recommendation with reasoning** — per the format below.
7. **Decision request** — the specific question or questions the operator must answer, with the options enumerated.

## Recommendation-With-Reasoning Format

Every recommendation must carry its reasoning on its face:

- State the recommended resolution for each genuine disagreement point by point; never issue a global "Position A wins."
- For each point, give the reasoning chain: the evidence relied on, why it outweighs the other side's evidence, and what new fact would change the conclusion.
- For preference-class disagreements, recommend nothing; present the tradeoff and route the choice to the operator.
- State confidence plainly per point (`high`, `moderate`, or `low`) with one line on why.

## Operator-Decides Boundary

- The memo recommends; the operator decides. Never present the recommendation as a ruling, verdict, or final disposition.
- Never instruct the primary specialists to change their work products; changes happen only after the operator's decision, in the reconciliation stage.
- If the operator's decision differs from the recommendation, the decision controls; record it without re-arguing.

## Reconciliation: Merge Procedure

Run reconciliation only after the operator has resolved the conflict, directly or by adopting the adjudication recommendation:

1. Confirm the decision record — which position survives on each contested point. If any contested point lacks a decision, stop and gate; do not infer the operator's intent.
2. Choose the base document — default to the more complete surviving work product and record the choice in the change log.
3. Apply the surviving positions point by point, taking language verbatim from the winning input wherever possible.
4. Make only the connective edits the merged document needs to read as one coherent work product (numbering, defined terms, cross-references), and log every one.
5. Verify against the no-new-substance rule below, then produce the consolidated work product with its change log.

## Reconciliation: Change-Log Format

Append a change log to the consolidated work product with one row per merged element:

| Element | Taken from | Decision basis | Edits made |
|---|---|---|---|
| Section or clause name | Input A, Input B, or both (specify) | Operator decision, adjudication recommendation adopted, or no-conflict carryover | Verbatim, or the exact connective edit made |

The log must account for every substantive element of the consolidated document; an element with no row is a defect.

## No-New-Substance Rule

- The consolidated work product may contain only content present in the inputs and the operator's recorded decisions.
- Connective edits (renumbering, conforming defined terms, fixing cross-references) are permitted and must be logged; new clauses, new terms, and new factual claims are not.
- If the surviving positions cannot be merged without new substantive language, stop, state exactly what is missing, and route the gap to the operator instead of drafting it.

## Boundaries

- Do not give legal advice or predict how a court would resolve any contested point.
- Do not let stylistic persuasiveness, length, or the author's seniority stand in for evidence when weighing positions.
- Do not transmit the memo or the consolidated work product to any external party or system; both are work products pending operator approval.
