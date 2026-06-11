---
name: lien-notice-playbook
description: Draft preliminary-notice and mechanic's-lien claim skeletons when a lien-notice matter arrives, producing a markdown work product with defaults, jurisdiction-dependent deadline flags, and an operator follow-up table.
metadata:
  sources:
    - path: companies/legal-operations/skills/lien-notice-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Lien Notice Playbook

Use this skill to draft a preliminary-notice or mechanic's-lien claim skeleton for a construction project. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, mark missing facts with bracket placeholders, and treat every deadline as jurisdiction-dependent. The skeleton is a work product; nothing drafted under this skill is recorded or served.

## When To Invoke

- The issue requests a preliminary notice (also styled a pre-lien notice or notice to owner) for a claimant on a construction project.
- The issue requests a mechanic's-lien claim skeleton for unpaid labor, services, equipment, or materials.
- Do not invoke for change-order tracking, construction-contract review, or payment-claim correspondence; those belong to other specialists in the construction practice.

## Drafting Steps

1. Gather facts from the issue: claimant name and project tier (general contractor, subcontractor, or supplier), property owner, general contractor, construction lender, street address and legal description of the property, description of the labor or materials furnished, first and last furnishing dates, claim amount, and which document type is requested. If the claimant's tier or the document type is absent and no acceptable default applies, gate with `missing-info-gate`; required notice content varies with tier.
2. Choose the skeleton. Draft a preliminary notice when the issue concerns preserving lien rights near the start of furnishing; draft a mechanic's-lien claim when the issue concerns asserting a lien for amounts unpaid. If the issue requests both, draft both as separate skeletons.
3. Draft the preliminary-notice skeleton sections in order:
   - Document title and jurisdiction line: `PRELIMINARY NOTICE` with a `[JURISDICTION]` placeholder and a note that the required title and statutory legend vary by jurisdiction.
   - Claimant block: claimant name, address, and project tier, plus the party who contracted with the claimant.
   - Recipient blocks: property owner, general contractor (when the claimant is a subcontractor or supplier), and construction lender, each with an address placeholder.
   - Property description: street address plus legal description placeholder.
   - Description of labor or materials: what has been or will be furnished, exactly as the issue states it.
   - Estimate or value statement: the stated amount or an `[ESTIMATED VALUE]` placeholder; do not compute it.
   - Statutory-statement placeholder: `[STATUTORY NOTICE LANGUAGE — jurisdiction-dependent; operator or responsible attorney to supply]`.
   - Date, signature, and title lines as placeholders.
4. Draft the mechanic's-lien claim skeleton sections in order:
   - Document title and jurisdiction line, as above, styled `MECHANIC'S LIEN CLAIM`.
   - Claimant block: claimant name, address, tier, and the party who contracted with the claimant.
   - Party blocks: property owner of record, general contractor, and construction lender, each with address placeholders.
   - Property description: street address plus legal description placeholder.
   - Description of labor or materials furnished, exactly as the issue states it.
   - Furnishing dates: first and last furnishing dates exactly as stated, or placeholders; never infer them from invoices.
   - Claim amount: the stated amount or a `[CLAIM AMOUNT]` placeholder, with a note that retainage, offsets, and credits are operator determinations.
   - Verification block: a verification or affidavit placeholder with signature, capacity, and notarization lines, flagged `[VERIFICATION FORM — jurisdiction-dependent]`.
5. Flag deadlines. Build the deadline-flag table below with one row per notice, recording, and enforcement deadline relevant to the document type. Enter every deadline as `[JURISDICTION-DEPENDENT DEADLINE]`; never state a number of days or a date as settled.
6. Apply defaults. Fill every remaining gap from the defaults table in the drafting agent's instructions and record each default used.
7. Assemble the output in the format below, including the `Assumptions and open items` section and the operator follow-up table.

## Deadline-Flag Table Format

| Deadline | Applies to | Placeholder | Responsible-party follow-up |
|---|---|---|---|
| Deadline name (for example preliminary-notice service, lien recording, enforcement action) | Document or step it governs | `[JURISDICTION-DEPENDENT DEADLINE]` | Operator or responsible attorney to confirm the deadline and the service or recording method for the project's jurisdiction |

Include a row for the service or recording method itself: `[SERVICE/RECORDING METHOD — OPERATOR TO CONFIRM PER JURISDICTION]`.

## Operator Follow-Up Table Format

| Open item | Why it matters | Who resolves it |
|---|---|---|
| Placeholder, default, or deadline flag | One-line statement of what turns on it | Operator or responsible attorney |

## Output Format

- A single well-structured markdown document per requested skeleton, never a fragment or outline.
- Open with `Assumptions and open items`: every placeholder, default used, deadline flag, and the operator follow-up table.
- Follow with the skeleton body in the section order above for the requested document type.
- Close with the deadline-flag table.
- Preserve operator-specified names, dates, amounts, and descriptions exactly as given.

## Boundaries

- Do not record the document with any recorder's office, serve it on any party, or transmit it to any external party or system; the skeleton is a work product pending operator approval.
- Do not compute, confirm, or estimate any statutory deadline, and do not present any jurisdiction's requirements as settled.
- Do not opine on lien validity, priority, or perfection, and do not compute the claim amount or net retainage or offsets; flag those determinations for the operator or responsible attorney.
