---
name: financial-disclosure-checklist
description: Organize family-law financial-disclosure inputs when a disclosure matter arrives, producing structured income, asset, debt, and expense tables with source citations, a document inventory, a discrepancy log, and a flagged gap list.
metadata:
  sources:
    - path: companies/legal-operations/skills/financial-disclosure-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Financial Disclosure Checklist

Use this skill to organize a party's financial-disclosure inputs into structured tables the operator or responsible attorney can review, complete, and verify. The output records values exactly as stated, cites the supporting document for every value, and flags every gap. It never certifies completeness. Disclosure inputs are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged` — and family-law disclosures are confidential by default — run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## Organization Steps

1. Scope intake. Record the disclosing party, the matter, the jurisdiction or required disclosure form if stated (placeholder otherwise), the reporting date or period, and the materials provided. If no financial inputs are identified at all and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the document inventory. List every supporting document provided — pay stubs, tax returns, W-2s/1099s, bank statements, brokerage and retirement statements, loan statements, credit-card statements, appraisals, business records — with one row per document and the categories it supports. Note expected document types that are absent.
3. Organize income. One row per income source: employment wages, self-employment or business income, bonuses and commissions, investment income, rental income, benefits, and other income — with amount and frequency exactly as stated and a source cite.
4. Organize assets. One row per asset across: real property, bank and cash accounts, brokerage and investment accounts, retirement accounts, business interests, vehicles, and significant personal property — with description, titled owner as stated, value or balance as stated with its as-of date, and a source cite.
5. Organize debts. One row per debt across: mortgages and secured loans, vehicle loans, credit cards, student loans, personal loans, and taxes owed — with creditor, balance as stated with its as-of date, and a source cite.
6. Organize monthly expenses. One row per expense category as the inputs state them — housing, utilities, food, transportation, insurance, childcare and education, medical, debt service, other — with the stated amount and a source cite or `[AS STATED BY PARTY]` where no document supports it.
7. Flag gaps and discrepancies. Mark absent values `[NOT PROVIDED]` and values lacking a supporting document `[UNSUPPORTED — DOCUMENT NEEDED]`. Where two sources state different values for the same item, record both with citations in the discrepancy log; do not pick one. Carry every flag into the gap list with who can supply the missing item.
8. Produce the tables, discrepancy log, gap list, and operator follow-ups in the format below.

## Table Formats

Document inventory:

| Document | Period / as-of date | Categories supported | Notes |
|---|---|---|---|

Income, asset, debt, and expense tables (one table per category):

| Item | Description as stated | Value / amount as stated | As-of date | Source document | Flags |
|---|---|---|---|---|---|

Use `[NOT PROVIDED]` and `[UNSUPPORTED — DOCUMENT NEEDED]` in the Flags column; never leave a gap blank.

## Gap List and Operator Follow-Ups

Close the work product with:

- Counts of items per category and of flags by type.
- The discrepancy log: each conflicting value with both versions and citations, no resolution proposed.
- Every missing or ambiguous item, why it matters for disclosure, and who can supply it.
- A short ordered list of operator follow-ups, starting with missing categories and unsupported values.

## Boundaries

- Do not certify that the disclosure is complete or accurate, or state that any disclosure obligation is satisfied; completeness is an operator and responsible-attorney determination.
- Do not value or appraise assets, characterize property as marital or separate, or compute net worth, support, or tax figures; record values as stated and flag gaps only.
- Do not request documents from any party or transmit the tables or any underlying document to any external party or system; the work product is internal pending operator approval.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
