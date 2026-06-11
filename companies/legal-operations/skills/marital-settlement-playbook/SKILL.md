---
name: marital-settlement-playbook
description: Draft marital-settlement-agreement skeletons when a divorce-settlement matter arrives, producing a markdown work product with property-division, support-placeholder, debt-allocation, and release sections plus defaults and jurisdiction flags for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/marital-settlement-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Marital Settlement Playbook

Use this skill to draft a marital-settlement-agreement skeleton or to update an existing draft agreement. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary instructions, and mark missing facts with bracket placeholders. Family-law matters are sensitive: when the matter's `metadata.possiblaw.privacyTier` is `confidential` or `privileged` — and family matters are confidential by default — run the `privacy-encoder` flow before any cloud-capable call and decode the final output before posting.

## When To Invoke

- The issue requests a marital settlement agreement, separation agreement, property-division schedule, debt-allocation schedule, support placeholder sections, or mutual releases between spouses.
- The issue requests an update to an existing draft agreement's schedules or sections.
- Do not invoke for parenting plans or custody schedules (parenting-plan work), for financial-disclosure organization, or for computing support amounts. Support figures are jurisdiction-formula-dependent determinations for the operator or responsible attorney, not this skill.

## Drafting Steps

1. Gather facts from the issue: spouse names, dates of marriage and separation, jurisdiction, the asset and debt picture as stated, agreed divisions, support intentions, children if any, and the requested scope.
2. Record agreed terms exactly. Where the issue states divisions or terms the spouses have already agreed to, carry them into the draft verbatim; do not value, rebalance, or net positions.
3. Draft the agreement sections in order:
   - Title and parties block: agreement title, spouse identification or `[SPOUSE A]` / `[SPOUSE B]`, `[DATE OF MARRIAGE]` and `[DATE OF SEPARATION]` lines, and the jurisdiction or `[JURISDICTION]` placeholder.
   - Recitals: marriage, separation, and intent-to-settle statements with placeholders; include a recital that each party has made financial disclosure, marked `[OPERATOR TO CONFIRM]`.
   - Real-property schedule: one row per property with description, titled owner as stated, and disposition or `[OPERATOR TO COMPLETE]`.
   - Financial-accounts and retirement schedule: one row per account with institution, account type, and disposition or `[OPERATOR TO COMPLETE]`; flag any retirement division as requiring a qualified domestic relations order (`QDRO flag`) for the operator or responsible attorney.
   - Personal-property and vehicles schedule: one row per item or category with disposition or `[OPERATOR TO COMPLETE]`.
   - Debt-allocation schedule: one row per debt with creditor, balance as stated, and allocation or `[OPERATOR TO COMPLETE]`.
   - Child-support section: a placeholder section stating that child support is determined under the governing jurisdiction's formula, with `[CHILD SUPPORT — JURISDICTION FORMULA; OPERATOR/ATTORNEY TO DETERMINE]`; never insert a computed amount.
   - Spousal-support section: a placeholder section with `[SPOUSAL SUPPORT — JURISDICTION-DEPENDENT; OPERATOR/ATTORNEY TO DETERMINE]`, including waiver language only if the issue states a waiver was agreed, marked `[OPERATOR TO CONFIRM]`.
   - Mutual releases and waiver section: a mutual general-release skeleton marked `[OPERATOR DECISION]`, with a carve-out placeholder for obligations created by the agreement itself.
   - General provisions: disclosure acknowledgment, modification, severability, and governing-law placeholders.
   - Signature block placeholders with date and notary lines.
4. Flag support dependence. Both support sections are jurisdiction-formula-dependent; mark each as a flag for the operator or responsible attorney and never compute, propose, or confirm an amount, even when income figures are present.
5. Flag jurisdiction dependence. Property-characterization regimes, disclosure requirements, support formulas, and execution formalities vary by jurisdiction; mark each as a `Jurisdiction flag` and route the determination to the operator or responsible attorney.
6. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
7. Produce the output in the format below.

## Output Format

- A single well-structured markdown document: title and parties block, then the body sections and schedules in the order above, then the signature block placeholders.
- A short `Assumptions and open items` section immediately after the parties block listing every placeholder, default used, support flag, QDRO flag, and jurisdiction flag.
- Preserve operator-specified names, dates, asset descriptions, balances, and agreed terms exactly as given.

## Escalation Triggers

- The issue mentions a prenuptial or postnuptial agreement: record it as an open item and flag for the operator and responsible attorney; do not draft terms that assume its enforceability.
- The asset picture includes a business interest, stock options, or other hard-to-value assets: flag valuation as an operator follow-up; never estimate a value.
- The issue suggests undisclosed assets or disputed disclosures: flag for `chief-counsel` and the operator; do not draft a disclosure acknowledgment as confirmed.
- The operator asks what a court would approve, what support amount applies, or how property would be characterized: route to the operator or responsible attorney as a legal determination.

## Boundaries

- Do not compute, propose, or confirm child-support or spousal-support amounts; support placeholders are flagged for the operator or responsible attorney.
- Do not value assets, characterize property as marital or separate, or net positions; record the picture as stated and flag gaps.
- Do not file, serve, or transmit the agreement to any court, party, or external system; the draft is a work product pending operator approval.
- For confidential or privileged matters, never send unencoded matter content to a cloud-capable model; the privacy-encoder flow is mandatory.
