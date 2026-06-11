---
name: proof-of-claim-playbook
description: Assemble proof-of-claim packages when a bankruptcy claim matter arrives, producing a markdown package with a claim basis narrative, itemized amount breakdown, supporting-document checklist, and the bar date flagged prominently.
metadata:
  sources:
    - path: companies/legal-operations/skills/proof-of-claim-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Proof of Claim Playbook

Use this skill to assemble a proof-of-claim package for a creditor in a bankruptcy case. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary instructions, mark missing facts with bracket placeholders, and keep the bar date at the top of the package at all times.

## When To Invoke

- The issue requests a proof-of-claim package, a claim narrative, an amount breakdown, or a supporting-document checklist for a claim against a debtor in a bankruptcy case.
- The issue requests revisions to an existing PossibLaw-drafted claim package; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for claims-register analysis or forbearance-agreement review; those belong to other specialists in the restructuring practice.

## Drafting Steps

1. Gather facts from the issue: creditor name, debtor name, case caption and number, court or claims agent, bar date, the basis of the claim (contract, goods or services, lease, judgment, or other), the amount components, any collateral or security claimed, and the supporting documents available.
2. Surface the bar date first. Place the bar date — or `[BAR DATE — CONFIRM]` when unknown — in a banner at the top of the package. A known bar date is the most time-critical fact in the package; never leave it to body text.
3. Draft the claim basis narrative: the relationship between creditor and debtor, the obligation and its source document, the default or trigger event, and the relevant dates, with each assertion citing a supporting-document checklist item.
4. Build the amount breakdown. Itemize the claim into principal, interest, fees, and other components with the basis for each; use `[CONTRACT RATE]` and component placeholders rather than invented figures, and never assert a single unexplained total. Organize the figures; do not compute final liability.
5. State the asserted classification. Record the secured or unsecured status and any priority asserted, each marked `[OPERATOR / COUNSEL]` for confirmation; describe claimed collateral exactly as the source documents do.
6. Build the supporting-document checklist: one row per document supporting the narrative or the amounts, marking each `In hand` or `Missing` with its source. List missing documents as operator follow-ups.
7. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
8. Produce the output in the format below.

## Output Format

- A single well-structured markdown package: bar-date banner with court and case caption, an `Assumptions and open items` section, the claim basis narrative, the amount breakdown table (`Component`, `Amount ($)`, `Basis`, plus a total row), the classification block with its counsel flags, the supporting-document checklist (`Document`, `In hand / Missing`, `Source`), and a signature block with signatory placeholders.
- Repeat the bar date in the closing line of the package.
- Preserve operator-specified names, amounts, dates, and case details exactly as given.

## Boundaries

- Do not file the package with any court, trustee, or claims agent, and do not serve or transmit it to any external party or system; the package is a work product pending operator approval.
- Do not opine on claim allowance, priority entitlement, or how a court would treat the claim; flag those determinations for the operator or responsible attorney.
- Do not compute final liability, interest accruals beyond stated contract terms, or tax consequences; organize the components and flag open calculations.
- Do not invent amounts, dates, or document titles; use placeholders and list the gaps as operator follow-ups.
