---
name: credit-agreement-review-checklist
description: Review credit agreements clause by clause when a credit-agreement review matter arrives, producing risk-rated findings with suggested actions, sanctions and AML flags, and jurisdiction flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/credit-agreement-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Credit Agreement Review Checklist

Use this skill to run a structured, clause-by-clause review of a credit agreement from the client's side. The output is a risk-rated findings table the operator or responsible attorney can act on row by row.

## Review Steps

1. Scope intake. Record the agreement and version under review, the client's side (borrower, lender, guarantor, or agent), facility type and size, and any sections the operator excluded. If the agreement text or the client's side is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Trace the definitions that drive economics and capacity — indebtedness, liens, restricted payments, permitted acquisitions, change of control, material adverse effect, and the earnings-based terms used in covenant calculations — before rating any clause that uses them.
3. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - Conditions precedent to closing and to each borrowing
   - Representations and warranties, including sanctions, anti-money-laundering, and anti-corruption representations
   - Affirmative covenants (reporting, notices, compliance, insurance)
   - Negative covenants and their baskets — debt, liens, investments, restricted payments, asset sales, affiliate transactions — including basket sizes, builders, and carve-outs
   - Financial covenants, testing dates, and cure rights
   - Mandatory prepayments and sweeps (asset sales, casualty, excess cash flow, change of control) and prepayment premiums
   - Events of default, grace periods, and cross-default versus cross-acceleration
   - Transferability: assignments, participations, consent rights, and disqualified-lender provisions
   - Guarantees and security references, including further-assurances obligations
   - Amendments, waivers, set-off, pro-rata sharing, and governing law
4. Rate each finding `High`, `Medium`, or `Low` with a one-line rationale:
   - `High`: a term that can accelerate the facility, trap the client, or remove flexibility the client expects under realistic facts — for example a basket smaller than disclosed plans require, a payment default with no grace period, or an undisclosed sweep.
   - `Medium`: ambiguous, off market-standard, or dependent on a definition that cuts against the client.
   - `Low`: stylistic, minor clarity, or completeness issues.
5. Screen the sanctions and AML representations against the party facts supplied in the issue. Flag gaps, unusually broad formulations, and any supplied fact inconsistent with a representation. Screening is flag-only: never clear a party against a sanctions or other government list — route confirmation to the operator or responsible compliance professional.
6. Flag jurisdiction dependence. Where enforceability or effect turns on jurisdiction, state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible attorney. Do not resolve jurisdiction-specific questions in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested action |
|---|---|---|---|
| Clause name and section cite | High / Medium / Low | One- or two-sentence issue statement quoting the operative language | Concrete negotiation ask, confirmation request, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested action. Append jurisdiction flags, sanctions and AML flags, and missing inventory items as their own rows, each marked in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level, plus counts of jurisdiction flags and sanctions and AML flags.
- Missing clauses from the inventory and whether each matters for the client's side.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not opine on enforceability, predict how a court or regulator would rule, or give jurisdiction-specific advice as settled.
- Never clear a party against a sanctions or other government list; screen and flag only.
- Do not compute the client's final financial exposure under any clause; organize the inputs and flag the computation for the operator or responsible professional.
- Do not redline or rewrite the agreement, and do not transmit the review or the agreement to any external party or system; deliver findings and suggested actions for operator decision.
