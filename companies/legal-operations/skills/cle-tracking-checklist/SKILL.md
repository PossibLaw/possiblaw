---
name: cle-tracking-checklist
description: Build or update attorney CLE compliance tables when a CLE-tracking matter arrives, producing per-attorney tables of jurisdiction, cycle, required and completed hours by category, remaining hours, deadlines, and lead-time flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/cle-tracking-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# CLE Tracking Checklist

Use this skill to build or update continuing-legal-education compliance tables for the firm's attorneys. The output is a structured table set with lead-time flags and operator follow-ups. The tables organize and flag; they never certify compliance to any bar or regulator.

## Tracking Steps

1. Scope intake. Record the attorneys in scope, each attorney's admission jurisdictions, the reporting cycle for each jurisdiction as supplied, the required hours by category as supplied (total, ethics, and any specialty categories), completed courses with provider, date, credit hours, and category, and the operator's lead-time threshold. If no attorney roster is supplied at all and no acceptable default applies, gate with `missing-info-gate`.
2. Record requirements as evidenced. Take required hours, category rules, carryover rules, and deadlines from the supplied sources or operator statements, with a source note for every value. Where a jurisdiction's requirement is not stated in the sources, record it as `[REQUIREMENT NOT SUPPLIED]` and list it in the gap list — never fill in a jurisdiction's CLE rules from memory as settled.
3. Tally completed hours. Sum completed credits per attorney, per jurisdiction, per category, counting each course only once per jurisdiction unless the sources state reciprocal-credit treatment. Flag courses missing a date, credit amount, or category rather than guessing.
4. Compute remaining hours. For each attorney-jurisdiction-category row, subtract completed from required and record the remainder. Apply carryover only when the sources state the carryover rule and the eligible amount.
5. Apply lead-time flags to every row with a deadline:
   - `OVERDUE`: the deadline has passed with hours still remaining.
   - `DUE <= 30 DAYS`: deadline within 30 days.
   - `DUE <= 90 DAYS`: deadline within 90 days.
   - `ON TRACK`: requirement met or deadline more than 90 days out.
   Use the operator's threshold instead of 30/90 days when one is supplied.
6. Produce the compliance table, gap list, and operator follow-ups in the format below.

## Compliance Table Format

| Attorney | Jurisdiction | Cycle | Category | Required | Completed | Remaining | Deadline | Flag |
|---|---|---|---|---|---|---|---|---|
| Attorney name | Admission jurisdiction | Cycle start–end as supplied | Total / Ethics / specialty category | Hours required per sources | Hours completed per records | Required minus completed | Reporting deadline as supplied | OVERDUE / DUE <= 30 DAYS / DUE <= 90 DAYS / ON TRACK |

Mark unsupplied values `[NOT PROVIDED]` or `[REQUIREMENT NOT SUPPLIED]`; never leave a cell blank.

## Gap List and Operator Follow-Ups

Close the work product with:

- Gap list: every missing requirement, cycle, deadline, or course detail, why it matters, and who can supply it.
- Operator follow-ups: every `OVERDUE` and `DUE <= 30 DAYS` row framed as an action for the operator or the named attorney — completing hours, confirming a requirement, or reporting to the bar — ordered by flag severity.
- A count of rows by flag.

## Boundaries

- Do not certify, attest, or report compliance to any bar, court, or regulator, and do not state that an attorney is compliant; report hours, deadlines, and flags only.
- Do not assert a jurisdiction's CLE requirements from memory as settled; record what the sources supply and flag the rest as gaps.
- Do not submit, file, or transmit anything to an external system; the tables are a work product pending operator approval.
