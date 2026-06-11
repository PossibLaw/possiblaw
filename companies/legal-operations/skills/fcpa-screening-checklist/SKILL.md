---
name: fcpa-screening-checklist
description: Screen third-party relationships and transactions for corruption red flags when a screening matter arrives, producing flag-only, risk-rated findings with operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/fcpa-screening-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# FCPA Screening Checklist

Use this skill to screen a third-party relationship or transaction for corruption red flags. The output is flags only: it never concludes that a violation occurred, never clears a party, and never makes a compliance determination. Everything routes to the operator or responsible counsel.

## Screening Steps

1. Scope intake. Record the third party or transaction screened, the relationship description, the materials supplied, the screening scope, and any areas the operator excluded. If the third party, the relationship description, or the scope is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Work the red-flag inventory below in order, one category at a time. Do not skip a category because the relationship appears routine; a category with nothing to assess is recorded as a gap, not a clean result.
3. Base every flag on facts stated in the issue or its documents, with a one-line cited basis pointing at the source. Never flag from inference alone, and never treat the absence of information as the absence of risk.
4. Rate each flag using the definitions below, with a one-line rationale.
5. Pair every flag with a concrete operator follow-up — a question to ask, a document to request, or a diligence step to commission — rather than a conclusion.
6. Produce the findings table and summary in the formats below.

## Red-Flag Inventory

Work these categories in order:

1. **Government touchpoints** — government customers, approvals, permits, or licenses in the relationship; owners, officers, or close relatives who are government officials; state-owned or state-controlled counterparties; pending government decisions the third party could influence.
2. **Intermediaries** — agents, consultants, brokers, or resellers positioned between the company and a government decision; vague or undocumented service descriptions; compensation disproportionate to the services described; a party added at the request of a customer or official.
3. **Payment terms** — unusual commissions or success fees, requests for cash, payments to entities or accounts in other names or other countries, offshore structures without a stated business rationale, split or restructured invoices, and political or charitable contributions requested in connection with the business.
4. **Jurisdiction signals** — operations, intermediaries, or payment routing through locations the operator or the materials identify as higher-risk. Treat jurisdiction risk as a flag for operator assessment; never characterize a country's corruption risk as established fact.
5. **Due-diligence posture** — refusal to complete diligence questionnaires or compliance certifications, missing beneficial-ownership information, resistance to compliance terms or audit rights, and prior allegations or investigations stated in the materials.

## Risk-Rating Definitions

- `High`: facts stated in the materials directly connect a payment, benefit, or intermediary to a government official or pending government decision, or multiple reinforcing signals appear in one category.
- `Medium`: a signal is present but could be explained by facts not yet in the materials; a targeted follow-up could resolve it.
- `Low`: an isolated signal with a plausible stated rationale, recorded for completeness.

## Findings Table Format

| Category | Flag | Risk | Cited basis | Operator follow-up |
|---|---|---|---|---|
| Inventory category | One-sentence statement of the red flag | High / Medium / Low | The stated fact and its source in the materials | The question, document request, or diligence step for the operator |

One row per flag. When a category yields no flags from the materials provided, record `No red flags identified from the materials provided` for that category — never `cleared`, `approved`, or any compliance determination.

## Summary and Next Actions

Close the screening with:

- Flag counts by risk level and the categories with no flags identified from the materials provided.
- Gaps in the materials and what could not be assessed.
- A short ordered list of operator follow-ups, starting with `High` flags.

## Boundaries

- Flags only. Never conclude that a violation occurred or did not occur, that conduct is lawful, or that a relationship is approved; findings route to the operator or responsible counsel.
- Never clear a party against any government, sanctions, or debarment list; list checks are operator follow-ups.
- Do not contact the third party, references, banks, regulators, or any authority; screen only from the materials in the issue.
- Do not transmit the findings to any external party or system; the screening is a work product pending operator approval.
