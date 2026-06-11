---
name: construction-contract-checklist
description: Review construction contracts clause by clause when a construction-contract review matter arrives, producing risk-rated findings with suggested rewrites and jurisdiction flags across scope, schedule, payment, indemnity, insurance, lien-waiver, and dispute-resolution terms.
metadata:
  sources:
    - path: companies/legal-operations/skills/construction-contract-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Construction Contract Checklist

Use this skill to run a structured, clause-by-clause review of a construction contract — owner/contractor agreements, subcontracts, supply agreements, and their incorporated documents. The output is a findings table the operator or responsible attorney can act on row by row.

## Review Steps

1. Scope intake. Record the contract under review, the client's project role (owner, general contractor, subcontractor, supplier), the counterparties, the project name and location, the contract price and pricing model (lump sum, cost-plus, unit price, GMP), the governing jurisdiction, and any sections the operator excluded. If the contract or the client's project role is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - Scope of work and incorporated documents (drawings, specifications, exhibits, order of precedence)
   - Schedule, milestones, substantial-completion definition, and time-of-the-essence language
   - Delay, extension-of-time, and notice-of-delay provisions
   - Liquidated damages and damage caps
   - Force majeure and excusable-delay provisions
   - Payment terms: schedule of values, pay applications, payment timing, and retainage
   - Conditional payment clauses (pay-if-paid, pay-when-paid)
   - Change-order and construction-change-directive procedures, including authorization limits
   - Indemnity and consequential-damage waivers
   - Insurance requirements (commercial general liability, builder's risk, additional-insured status) and payment and performance bonds
   - Lien waivers and lien-rights provisions
   - Warranty and correction-of-work obligations
   - Termination for cause, termination for convenience, and suspension of work
   - Dispute resolution: claim-notice requirements, mediation or arbitration, venue, and prevailing-party fees
3. Rate each clause. Assign `High`, `Medium`, or `Low` risk with a one-line rationale, read from the client's project role:
   - `High`: shifts a major project risk to the client without a corresponding control, is internally contradictory with the incorporated documents, or strips a payment or lien right.
   - `Medium`: ambiguous, missing a standard protection, or materially off market-standard positions for the client's role.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Cross-check stated figures. Compare the schedule, liquidated-damages rate, retainage percentage, and payment timeline against facts stated in the issue; where the contract and the issue disagree, record both statements as a finding.
5. Flag jurisdiction dependence. Where enforceability turns on jurisdiction — for example pay-if-paid clauses are unenforceable in some jurisdictions, several jurisdictions mandate statutory lien-waiver forms, anti-indemnity statutes limit broad-form indemnity, and liquidated-damages treatment varies — state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible attorney. Do not resolve jurisdiction-specific questions in the findings.
6. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Clause name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append jurisdiction flags as their own rows with `Jurisdiction flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of jurisdiction flags.
- Missing clauses from the inventory and whether each should be added.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not assert that any clause is enforceable, give jurisdiction-specific legal advice as settled, or predict how a court or arbitrator would rule.
- Do not rewrite the source contract directly; deliver findings and suggested rewrites for operator decision.
- Do not advise whether to sign; signing is an operator business decision informed by the findings.
- Do not transmit the contract or the review to any external party or system; the review is a work product pending operator approval.
