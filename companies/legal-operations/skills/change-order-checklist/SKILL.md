---
name: change-order-checklist
description: Build or update a structured change-order log when a change-order tracking matter arrives, producing a log table with cumulative-impact lines, discrepancy flags, and operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/change-order-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Change Order Checklist

Use this skill to turn operator-supplied change-order documents into a structured change-order log. Record values exactly as the documents state them, carry cumulative totals as labeled arithmetic, and surface discrepancies as cited observations. The log carries no opinions on entitlement, delay-claim merit, or amounts owed.

## Logging Steps

1. Scope intake. Record the project, the baseline contract price and contract time as stated in the issue or contract documents, the change-order documents supplied, and any prior log on the issue. If no change-order documents or no baseline contract price is supplied and no acceptable default applies, gate with `missing-info-gate`.
2. Inventory the documents. List each change order, proposed change order, construction change directive, and amendment received, noting any document the set references but does not include.
3. Build or update the log. Enter one row per change order in the format below, capturing numbers, dates, scope descriptions, amounts, day counts, and approval signatures exactly as the documents state them. Mark absent values `[NOT PROVIDED]` and give every value a source cite. When updating an existing log, preserve prior rows and mark changed values with the source of the update.
4. Compute the cumulative-impact line. Sum recorded cost impacts and schedule impacts as running totals, labeled as arithmetic on stated amounts. Where party logs or pay applications state different totals, record both statements and log the mismatch as a discrepancy flag, not a conclusion.
5. Apply the cumulative-impact flags. Flag, as cited observations: cumulative cost impact exceeding a stated authorization limit, contingency, or approval threshold; cumulative schedule impact exceeding a stated milestone or completion-date allowance; and any document's own statement that a cumulative limit is reached or exceeded.
6. Scan for discrepancy signals. Record each signal from the list below verbatim with its citation; do not score or characterize it.
7. Build the gap list and operator follow-ups in the format below.

## Change-Order Log Format

| CO number | Date | Scope delta as stated | Cost impact as stated | Schedule impact as stated | Approval status | Source |
|---|---|---|---|---|---|---|
| Number exactly as stated | Date as stated | Scope description as stated | Amount as stated | Day count as stated | Signatures and approvals as stated, or `Unsigned as supplied` | Document and page or section cite |

Close the table with the cumulative-impact line: running cost and schedule totals labeled `Arithmetic on stated amounts`, followed by any cumulative-impact flags.

## Discrepancy Signals

- Numbering gaps in the change-order sequence.
- Amount mismatches between a change order and a pay application, party log, or correspondence.
- Unsigned or unapproved change orders, or approvals by a signer the documents identify as outside a stated authorization limit.
- Attachments or exhibits a change order references but the supplied set does not include.
- Stated authorization-limit or contingency overruns, including those flagged by the cumulative-impact line.

Record each signal as a cited observation only; never characterize a signal as a breach, waiver, or claim.

## Gap List and Operator Follow-Up Format

| Gap or follow-up | Why it matters | Who can supply or resolve it |
|---|---|---|
| Missing or ambiguous item, or an action to commission (for example obtaining a missing signature page or reconciling a pay application) | One-line statement of what turns on it | Operator, a named party, or responsible counsel |

Frame every action item as an operator follow-up; never perform or promise the follow-up.

## Boundaries

- Do not opine on entitlement to a change, the merit of a delay claim, contract interpretation, or final amounts owed.
- Do not paraphrase or normalize stated numbers, dates, or scope language; fidelity to the documents outranks readability.
- Do not transmit the log or any underlying change order to any external party or system; the log is a work product pending operator approval.
