---
name: tax-filing-calendar-checklist
description: Build or update an entity tax-filing calendar when a calendar matter arrives, producing a structured table of income, franchise, sales/use, and estimated-payment obligations with an owner and due date on every row.
metadata:
  sources:
    - path: companies/legal-operations/skills/tax-filing-calendar-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Tax Filing Calendar Checklist

Use this skill to convert operator-supplied entity and filing facts into a structured tax-filing calendar, or to update an existing one. The calendar organizes who must do what by when; it carries no positions, no amounts, and no judgments about whether an obligation legally exists.

## Calendar Steps

1. Scope intake. Record the entities in scope with their types and fiscal year ends, the jurisdictions stated for each, the filing categories requested, and whether this is a new calendar or an update to an existing one. If no entity list is supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the filing inventory. For each entity-jurisdiction pair, work through every category and record what the issue states:
   - Income tax filings — returns and extensions
   - Franchise taxes and annual reports
   - Sales and use tax — registrations and periodic returns
   - Estimated payment dates — each installment as its own row
   Record additional categories (for example employment, property, or excise filings) only when the issue names them, under their own descriptive labels.
3. Record due dates exactly as supplied. Where a due date is unsupplied or unconfirmed, enter `[VERIFY — OPERATOR]` rather than assuming a statutory date; due dates vary by jurisdiction, entity type, and elections, and they change.
4. Assign an owner to every row. Use the owner the issue names; otherwise enter `[OWNER]` and flag the row for operator completion. No row ships without an owner cell.
5. Set status per row: `Upcoming`, `Filed` or `Paid` only when the issue says so, or `[VERIFY — OPERATOR]` when the state is unknown. Never infer completion.
6. Apply the update convention. When updating an existing calendar, change only the rows the issue addresses, keep all other rows verbatim, and append a change-log line per modified row.
7. Produce the output in the format below.

## Calendar Table Format

Produce a markdown table with one row per entity, jurisdiction, and filing or payment:

| Entity | Jurisdiction | Filing or payment | Period | Due date | Owner | Status | Notes |
|---|---|---|---|---|---|---|---|
| Entity name as stated | Jurisdiction as stated | Filing category and form reference if stated | Tax period covered | Date as stated or `[VERIFY — OPERATOR]` | Named owner or `[OWNER]` | Upcoming / Filed / Paid / `[VERIFY — OPERATOR]` | Registrations pending, extensions, source comments |

Never merge rows across entities or jurisdictions, and record each estimated-payment installment as its own row.

## Update Convention

- Change only the rows the issue addresses; reproduce every other row unchanged.
- Append a change log below the table: one line per modified row with the prior value, the new value, and the source comment or instruction.
- Close with a flags list: unverified due dates, uncertain obligations, missing owners, and entities or jurisdictions mentioned in the issue but not yet calendared.

## Boundaries

- Do not file, pay, register, e-file, or submit anything to a taxing authority or any external system; the calendar is a work product pending operator approval.
- Do not compute tax liability, estimated payment amounts, penalties, or interest.
- Do not decide whether a filing or registration obligation exists in any jurisdiction; record stated obligations and flag uncertain ones for the operator or responsible tax professional.
- Do not assume statutory due dates as settled; unverified dates stay marked `[VERIFY — OPERATOR]`.
