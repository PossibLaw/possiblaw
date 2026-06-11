---
name: public-disclosure-review-checklist
description: Review 10-K, 10-Q, 8-K, and press-release drafts section by section when a disclosure-review matter arrives, producing risk-rated findings on consistency, risk-factor gaps, stale disclosures, and forward-looking-statement hygiene with materiality flags routed to counsel.
metadata:
  sources:
    - path: companies/legal-operations/skills/public-disclosure-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Public Disclosure Review Checklist

Use this skill to run a structured, section-by-section review of a 10-K, 10-Q, or 8-K draft or a related press release. The output is a findings table the operator or responsible securities counsel can act on row by row.

## Review Steps

1. Scope intake. Record the document under review, the filing type and period covered, the comparison documents available (prior filings, the press release a filing describes, or the filing a press release describes), and any sections the operator excluded. If the draft or the filing type is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the disclosure inventory. Locate and list each of the following, noting any that are absent from the draft:
   - Risk factors
   - Management's discussion and analysis or equivalent narrative
   - Business description and recent developments
   - Legal proceedings
   - Subsequent events
   - Forward-looking-statement safe-harbor legend
   - Headline claims and figures (press releases)
3. Run consistency checks. Compare every figure, date, and claim that appears in more than one place — within the draft, between the draft and prior filings, and between a press release and the filing it describes. Record each mismatch with both locations.
4. Check for risk-factor gaps. List the events, developments, and dependencies the draft describes elsewhere and confirm a risk factor addresses each; record developments no risk factor covers.
5. Check for stale disclosures. Flag passages that repeat prior-period language without reflecting intervening developments the draft itself describes, and references to dates, facts, or proceedings that have since changed.
6. Check forward-looking-statement hygiene. Confirm the safe-harbor legend is present and covers the statements made, cautionary language accompanies forward-looking statements, and projections state their assumptions; record each gap.
7. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: an internal contradiction, a development with no risk-factor coverage, or a projection with no stated basis.
   - `Medium`: stale language, an incomplete safe-harbor legend, or an inconsistency between the draft and a comparison document.
   - `Low`: stylistic, minor clarity, or completeness issues.
8. Flag materiality questions. Where a finding turns on whether an item is material — for example whether a development requires disclosure at all — state the question, mark the row `Materiality flag`, and route the determination to the operator or responsible securities counsel. Do not resolve materiality in the findings.
9. Produce the findings table and summary in the format below.

## Findings Table Format

| Section | Risk | Issue | Suggested action |
|---|---|---|---|
| Section name and location reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete suggested action or `[OPERATOR / SECURITIES COUNSEL]` where the fix requires a materiality or legal determination |

Every `High` and `Medium` row must include a specific suggested action. Append materiality flags as their own rows with `Materiality flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of materiality flags.
- Inventory items absent from the draft and whether each absence needs operator attention.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not determine whether any item is material or what the company is legally required to disclose; route those determinations to the operator or responsible securities counsel.
- Do not opine on how a regulator would treat the disclosure or predict enforcement outcomes.
- Do not rewrite the draft directly; deliver findings and suggested actions for operator decision.
- Do not transmit the draft or the review to any external party or system; the review is a work product pending operator approval.
