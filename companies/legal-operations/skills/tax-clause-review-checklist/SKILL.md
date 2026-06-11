---
name: tax-clause-review-checklist
description: Review the tax provisions of a contract clause by clause when a tax-clause review matter arrives, producing risk-rated findings with suggested rewrites and jurisdiction flags for withholding, gross-up, transfer-tax, indemnity, sales-tax, and tax-documentation language.
metadata:
  sources:
    - path: companies/legal-operations/skills/tax-clause-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Tax Clause Review Checklist

Use this skill to run a structured, clause-by-clause review of the tax provisions in an operator-supplied contract. The output is a findings table the operator or responsible tax professional can act on row by row. The review organizes exposure and allocation; it never decides what tax applies or computes an amount.

## Review Steps

1. Scope intake. Record the contract under review, the parties and which party's position the review takes if stated, the governing law and jurisdictions as stated, the transaction type, and any sections the operator excluded. If the contract is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the tax-clause inventory. Locate and list each of the following, noting any that are absent:
   - Withholding provisions — who may withhold, on what payments, and what happens to withheld amounts
   - Gross-up obligations — whether payments are grossed up for withholding and any exceptions
   - Transfer taxes — which party bears stamp, documentary, recording, and similar transfer taxes
   - Tax indemnities — scope, covered periods, procedural conditions, and interplay with liability caps
   - Sales and use tax responsibility — whether prices are tax-inclusive or tax-exclusive and who remits
   - Tax documentation mechanics — FATCA provisions, W-8 series and W-9 delivery obligations, residency certificates, and update-on-change requirements
   - Tax cooperation and contest provisions — audit cooperation, contest control, and refund handling
   - Tax treatment statements — recitals or covenants stating an intended characterization or treatment
3. Rate each clause. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: the contract is silent or contradictory on who bears a tax, an indemnity or gross-up is unbounded, or documentation mechanics cannot operate as written.
   - `Medium`: allocation is ambiguous, materially off market-standard positions, or missing the mechanics needed to enforce it.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Check silences. For each inventory item with no matching language, record a `[NOT FOUND]` row stating which party the silence favors by default, without deciding whether that default is correct in any jurisdiction.
5. Flag jurisdiction dependence. Where the effect of a clause turns on jurisdiction — withholding rates and treaty relief, transfer-tax allocation customs, sales-tax nexus and exemptions, characterization rules — state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible tax professional. Do not resolve jurisdiction-specific questions in the findings.
6. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Clause name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business or tax-position choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append jurisdiction flags and `[NOT FOUND]` items as their own rows with `Jurisdiction flag` or `[NOT FOUND]` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of jurisdiction flags.
- Missing tax provisions from the inventory and whether each should be added.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not compute withholding, gross-up, transfer-tax, or any other tax amounts; organize the exposure and flag computations for the operator or responsible tax professional.
- Do not give jurisdiction-specific tax advice as settled or predict how a court or taxing authority would rule.
- Do not rewrite the source contract directly; deliver findings and suggested rewrites for operator decision.
- Do not transmit the contract or the review to any external party or system; the review is a work product pending operator approval.
