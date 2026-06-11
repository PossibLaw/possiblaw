---
name: engagement-letter-playbook
description: Draft an engagement-letter skeleton when a new client or matter engagement arrives, producing a markdown document with scope, fee, retainer, termination, and file-retention sections plus a defaults table of placeholders for operator completion.
metadata:
  sources:
    - path: companies/legal-operations/skills/engagement-letter-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Engagement Letter Playbook

Use this skill to draft an engagement-letter skeleton for a new client or matter. The output is a markdown document skeleton with bracketed placeholders and a defaults table the operator or responsible attorney completes before any client sees it. The skeleton is never sent to a client.

## Drafting Steps

1. Scope intake. Record the client name, the matter description, the responsible attorney, the fee arrangement type, the jurisdiction, the retainer amount, and any firm-standard terms supplied with the issue. If the client identity or the matter description is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing; every other gap takes a bracketed placeholder from the defaults table.
2. Draft the scope of representation. State what the firm is engaged to do in one or two sentences from the matter description, then add an express exclusions paragraph (`This engagement does not include [EXCLUDED SERVICES — OPERATOR TO CONFIRM]`) so scope limits are a deliberate operator decision, not an omission.
3. Draft the fees and rates section. Use the supplied fee arrangement; otherwise default to hourly billing with a rate-schedule placeholder. Include billing frequency, expense and cost pass-through language, and a statement that rates may change with written notice.
4. Draft the retainer terms. Cover the initial retainer amount, deposit to the client trust account, application against invoices, replenishment trigger, and refund of any unearned balance at the end of the engagement.
5. Draft the termination section. Cover the client's right to terminate at any time, the firm's withdrawal subject to applicable professional-conduct rules, and payment for work performed through the termination date.
6. Draft the file-retention notice. State the retention period placeholder, the client's right to request the file, and the disposition method after the retention period, marked for operator confirmation against the governing jurisdiction's rules.
7. Add the closing blocks. Governing-law placeholder, an instruction line that the letter takes effect on countersignature, and signature blocks for the responsible attorney and the client.
8. Produce the skeleton and defaults table in the format below, listing every placeholder used.

## Output Format

Deliver one markdown document with these sections in order:

1. Letterhead block: `[LAW FIRM NAME]`, `[FIRM ADDRESS]`, date placeholder.
2. Addressee block: client name and address placeholders, matter reference.
3. Scope of representation, including the express exclusions paragraph.
4. Fees and rates, with the rate-schedule placeholder or supplied arrangement.
5. Costs and expenses.
6. Retainer and trust-deposit terms.
7. Billing and payment terms.
8. Termination and withdrawal.
9. File retention and return of client property.
10. Governing law and effective-date instruction.
11. Signature blocks for the responsible attorney and the client.
12. Defaults table: `| Field | Value used | Source |` with one row per placeholder or default applied, marking each `Supplied`, `Default`, or `[OPERATOR TO COMPLETE]`.

## Boundaries

- Do not send, transmit, or deliver the letter to the client or any external party; the skeleton is a work product pending operator approval.
- Do not set final fees, rates, or retainer amounts; supplied figures are recorded as supplied, and everything else stays a placeholder for the operator.
- Do not state jurisdiction-specific professional-conduct or file-retention rules as settled; mark them for confirmation by the operator or responsible attorney.
- Do not opine on the enforceability of any term; flag questionable terms for the responsible attorney.
