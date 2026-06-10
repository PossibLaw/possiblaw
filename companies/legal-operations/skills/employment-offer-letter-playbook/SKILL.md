---
name: employment-offer-letter-playbook
description: Draft complete offer letters or employment agreements when an employment hiring matter arrives, producing a markdown work product with defaults and placeholders for missing facts.
metadata:
  sources:
    - path: companies/legal-operations/skills/employment-offer-letter-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Offer Letter and Employment Agreement Playbook

Use this skill to draft a professional offer letter or employment agreement. Apply the defaults below when the operator has not provided contrary instructions, and mark missing legal or business facts with bracket placeholders.

## When To Invoke

- The issue requests a new offer letter, employment agreement, or compensation-terms document for a named or placeholder candidate.
- The issue requests revisions to an existing PossibLaw-drafted offer; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for policy or handbook work, separation work, or hiring-compliance screens; those belong to other specialists in the employment practice.

## Drafting Steps

1. Gather facts from the issue: candidate name, role title, reporting line, start date, work location or remote status, base salary, bonus, equity, benefits notes, jurisdiction, contingencies, and acceptance deadline.
2. Choose the document form. Default to an offer letter. Draft a full employment agreement only when the issue requests one or describes terms that exceed letter scope, such as fixed term, severance commitments, or detailed restrictive covenants.
3. Draft the required sections in order:
   - Position and duties: role title, reporting line, work location, and a short duties summary.
   - Compensation: base salary as an annualized figure, payment cadence per the company's standard payroll schedule, and bonus terms or a `[BONUS TERMS]` placeholder.
   - Equity: `[EQUITY GRANT]` placeholder stating the grant is subject to board approval and the company's standard plan documents; never invent share counts or vesting terms.
   - Benefits summary: a short paragraph referencing the company's standard benefit plans, with a `[BENEFITS SUMMARY]` placeholder for plan-specific detail.
   - Employment relationship: at-will language by default, or term language when drafting a fixed-term agreement; add `[JURISDICTION: confirm at-will framing]` where the jurisdiction is unconfirmed or may limit at-will framing.
   - Contingencies: background check, reference check, and proof of work authorization, each as a bracketed line the operator can strike.
   - Confidentiality and IP assignment pointer: a clause stating the offer is conditioned on signing the company's standard confidentiality and IP assignment agreement, referenced as `[CONFIDENTIALITY AND IP ASSIGNMENT AGREEMENT]`; do not draft that agreement inside the letter.
   - Governing law: `[GOVERNING LAW]` placeholder unless the operator specifies a jurisdiction.
   - Acceptance deadline and signature block: a stated acceptance date or `[ACCEPTANCE DEADLINE]` placeholder, plus signature lines for the company signatory and the candidate with name, title, and date.
4. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions, and list each default used.
5. Produce the output in the format below.

## Output Format

- A single well-structured markdown document: title, date line, candidate address block with placeholders, body sections in the order above, and signature block.
- A short `Assumptions and open items` section before the letter body listing every placeholder, default, and operator follow-up.
- Preserve operator-specified names, figures, dates, and special terms exactly as given.

## Boundaries

- Do not provide tax, immigration, or benefits advice; flag those topics as operator follow-ups when they surface.
- Do not negotiate or anticipate counteroffers; draft the terms as instructed.
- Do not transmit the document to the candidate or any external party or system; the draft is a work product pending operator approval.
