---
name: trademark-portfolio-checklist
description: Maintain the trademark portfolio table when a portfolio-tracking matter arrives, producing one row per mark-jurisdiction pair with registration, status, renewal-window, and use-evidence fields plus deadline flags, a gap list, and a change log.
metadata:
  sources:
    - path: companies/legal-operations/skills/trademark-portfolio-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Trademark Portfolio Checklist

Use this skill to build and maintain the trademark portfolio table from operator-supplied inputs. Record every value exactly as the source states it, flag every approaching or unstated deadline for operator confirmation, and log every change. This is mechanical tracking: nothing is filed, renewed, or assessed.

## Tracking Steps

1. Record the field list for each mark-jurisdiction pair, with `[NOT PROVIDED]` marking gaps and a source cite for every value:
   - Mark (word, design, or composite, as the source describes it).
   - Jurisdiction, as the source names it; do not normalize jurisdiction names.
   - Class or classes, exactly as stated; do not assign classification numbers yourself.
   - Application or registration number, verbatim.
   - Status (applied, published, registered, opposed, lapsed, abandoned), exactly as the source states it; do not infer a status.
   - Key dates as stated (filing, registration, last renewal), recorded verbatim.
   - Renewal window, as the source states it.
   - Use-evidence status: specimens and declarations of use as reported.
   - Owner of record, as stated.
2. Apply the deadline-flag rules. Renewal deadlines, maintenance-filing windows, and grace periods are jurisdiction-dependent: record dates the source states as stated, and mark every derived or unstated deadline `[DEADLINE — operator or counsel to confirm]`. Never compute a deadline as settled.
3. Track use evidence. Record specimens and declarations of use as reported, and flag missing or stale use evidence for operator follow-up without assessing its sufficiency.
4. Compile the deadline-flag list: every renewal window, maintenance filing, or use-evidence item needing operator attention, ordered soonest first by the dates the source states, each carrying its confirmation flag.
5. Compile the gap list: every missing or ambiguous field, what is needed, and who can supply it.
6. Update the existing portfolio table rather than starting a new one, and record every change in the change log with a date.

## Output: Portfolio Table

| Mark | Jurisdiction | Class | Registration no. | Status | Renewal window | Use evidence | Source |
|---|---|---|---|---|---|---|---|

One row per mark-jurisdiction pair, with `[NOT PROVIDED]` marking gaps.

## Output: Deadline-Flag List

- One line per renewal window, maintenance filing, or use-evidence item needing operator attention, ordered soonest first, each marked `[DEADLINE — operator or counsel to confirm]` where the date is derived or unstated.

## Output: Gap List

- Each missing or ambiguous field, what is needed, and who can supply it (operator, outside counsel, prior records).

## Output: Change Log

| Date | Change | Reason | Source |
|---|---|---|---|

One row per change made in this update.

## Boundaries

- Never file, renew, submit, post, or transmit anything to any trademark office, registry, or other external party or system; the table is a work product pending operator action.
- Do not assess registrability, likelihood of confusion, or use-evidence sufficiency, and do not determine any statutory deadline; those questions belong to the operator and responsible counsel.
- Work from operator-supplied inputs only; never query a registry or any other external source on your own initiative.
