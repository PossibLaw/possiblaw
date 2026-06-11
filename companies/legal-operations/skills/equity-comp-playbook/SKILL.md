---
name: equity-comp-playbook
description: Draft option and RSU grant-paperwork skeletons when an equity-compensation matter arrives, producing a markdown grant package with defaults, placeholders, and flagged tax-election and valuation questions.
metadata:
  sources:
    - path: companies/legal-operations/skills/equity-comp-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Equity Comp Playbook

Use this skill to draft an option or RSU grant-paperwork skeleton — grant notice, award agreement, and vesting schedule exhibit. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, mark missing facts with bracket placeholders, and flag — never decide — every tax-election and valuation question. Every grant is drafted subject to board approval and the governing equity plan documents.

## When To Invoke

- The issue requests grant paperwork for a stock option or RSU award to a named or placeholder grantee.
- The issue requests revisions to an existing PossibLaw-drafted grant package; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for equity-plan drafting, cap-table work, or benefits-plan review; those belong to other specialists or operator escalations.

## Drafting Steps

1. Gather facts from the issue: company, governing equity plan, grantee, award type, share or unit count, grant date, board approval date, exercise price (options), vesting schedule, vesting commencement date, and any special terms. If the award type, the grantee, or the governing equity plan cannot be defaulted or placeholdered and no acceptable default applies, gate with `missing-info-gate`.
2. Choose the package type. Default to a stock option; draft an RSU package only when the issue requests one.
3. Draft the grant notice: company, plan reference, grantee, award type, share or unit count, grant date marked subject to board approval, exercise price placeholder (options), vesting summary, and an acceptance-instructions placeholder.
4. Draft the award agreement skeleton in order: grant of award; vesting terms; exercise mechanics placeholders (options) or settlement terms (RSUs); termination-of-service treatment placeholders; transfer restrictions; a plan-controls clause stating the plan documents govern over the agreement; governing law; and signature blocks.
5. Build the vesting schedule exhibit: a table of vesting dates or tranches from the operator-supplied terms or the default schedule in the drafting agent's instructions.
6. Flag tax-election and valuation questions as operator follow-ups; placeholder them and never decide or recommend an answer:
   - Section 83(b): `[SECTION 83(b) ELECTION — operator follow-up for responsible counsel or advisors; deadline-sensitive]` wherever early exercise or restricted property is involved.
   - Section 409A: `[EXERCISE PRICE — pending 409A valuation, operator to confirm]` for every option exercise price.
   - Never invent share counts, exercise prices, or valuation figures; use bracket placeholders when the issue does not supply them.
7. Apply the remaining defaults from the drafting agent's instructions and record each default used.
8. Build the `Assumptions and open items` section listing every placeholder, default used, and operator follow-up — including the tax-election and valuation flags — and produce the output in the format below.

## Output Format

- A single well-structured markdown grant package, never a fragment or outline, in this order:
  1. `Assumptions and open items`.
  2. Grant notice.
  3. Award agreement skeleton.
  4. Vesting schedule exhibit table.
- State in the draft that the grant is subject to board approval and to the governing equity plan documents.
- Preserve operator-specified counts, prices, dates, and special terms exactly as given; defaults are placeholders only.

## Boundaries

- Do not decide, recommend, or compute a tax election, a valuation, or a tax liability; flag each as an operator follow-up for responsible counsel or advisors.
- Do not give tax, securities, or accounting advice in the deliverable.
- Do not transmit grant paperwork to a grantee, a board portal, a cap-table system, or any external party or system; the package is a work product pending operator approval.
