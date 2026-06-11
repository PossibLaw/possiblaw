---
name: estate-inventory-checklist
description: Organize operator-supplied asset and liability information when an estate-inventory matter arrives, producing structured inventory tables with titling, beneficiary-designation, value, and document-location fields and gap flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/estate-inventory-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Estate Inventory Checklist

Use this skill to organize operator-supplied asset and liability information into structured inventory tables. Record every value exactly as supplied, mark every undocumented assertion with a gap flag, and frame every missing item as an operator follow-up. The inventory carries no valuations, no entitlement conclusions, and no advice.

## Organization Steps

1. Scope intake. Record the person or estate the inventory covers, the source materials supplied (statements, deeds, titles, beneficiary-designation forms, policy documents, operator lists), and any prior inventory on the issue. If no source materials are supplied or the inventory scope is ambiguous and no acceptable default applies, gate with `missing-info-gate`.
2. Work through the asset categories. For each category below, record every asset the materials identify; record `None identified` for categories the materials do not touch rather than silently skipping them:
   - Real property.
   - Bank and cash accounts.
   - Brokerage and investment accounts.
   - Retirement accounts.
   - Life insurance and annuities.
   - Business interests.
   - Vehicles and other titled personal property.
   - Tangible personal property.
   - Digital assets and accounts.
   - Receivables and other assets.
3. Complete the fields for each asset row, applying the field definitions below and recording every value exactly as supplied with its source document and as-of date.
4. Build the liability inventory: one row per mortgage, secured loan, unsecured debt, or other liability, with creditor, balance as supplied, source, and gap flags.
5. Apply the gap-flag conventions below to every row missing a value, titling record, beneficiary confirmation, or document location.
6. Build the gap list: every flagged gap, why it matters, and who can supply the missing item, framed as operator follow-ups.

## Field Definitions

- `Asset` — the asset described as the source materials describe it.
- `Titling` — ownership form only as the source documents state it (for example individual, joint with right of survivorship, tenants in common, trust-titled, payable-on-death or transfer-on-death); undocumented assertions get `[TITLING NOT DOCUMENTED]`, not acceptance as confirmed.
- `Beneficiary designation` — the designation only as a designation form or plan record states it; assertions without a record get `[BENEFICIARY NOT CONFIRMED]`.
- `Value as supplied` — the figure exactly as supplied, labeled `as supplied`, with its as-of date; never estimate, appraise, or adjust a value.
- `Source` — the document and date the row's values came from.
- `Document location` — where the governing document or original is, as described by the operator or source materials; note where originals have not been located.

## Gap-Flag Conventions

- `[VALUE MISSING]` — no value supplied for the asset or liability.
- `[AS-OF DATE MISSING]` — a value supplied without a date.
- `[TITLING NOT DOCUMENTED]` — titling asserted but no source document supplied.
- `[BENEFICIARY NOT CONFIRMED]` — designation asserted but no designation record supplied.
- `[DOCUMENT NOT LOCATED]` — governing document or original not located.

## Table Formats

Asset inventory:

| Asset | Titling | Beneficiary designation | Value as supplied | Source | Document location | Gap flags |
|---|---|---|---|---|---|---|

Liability inventory:

| Liability | Creditor | Balance as supplied | Source | Gap flags |
|---|---|---|---|---|

Gap list:

| Gap | Why it matters | Who can supply it |
|---|---|---|
| Flagged gap by row and flag | One-line statement of what turns on it | Operator, institution, or responsible attorney |

## Boundaries

- Do not value assets authoritatively, compute estate or inheritance tax, or state how an asset will pass or who is entitled to it; organize and flag only, and route those questions to the operator or responsible attorney.
- Do not accept undocumented assertions as confirmed; record them with the matching gap flag.
- Do not transmit the inventory or any underlying document to any external party or system — including courts, financial institutions, or family members; the inventory is a work product pending operator approval.
- Treat all matter content as sensitive personal and financial data under the organizing agent's privacy rules.
