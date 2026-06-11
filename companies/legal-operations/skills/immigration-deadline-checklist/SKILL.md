---
name: immigration-deadline-checklist
description: Build or update case-status and deadline tables for immigration matters when a tracking request arrives, producing structured rows for expirations, RFE responses, max-out dates, and renewal windows with an owner and lead-time flag on every deadline.
metadata:
  sources:
    - path: companies/legal-operations/skills/immigration-deadline-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Immigration Deadline Checklist

Use this skill to convert operator-supplied case documents and status facts into structured case-status and deadline tables, or to update existing ones. The tables organize who must act by when; they carry no judgments about which deadline legally controls, and every deadline remains an operator follow-up to confirm with the responsible immigration attorney.

## Tracking Steps

1. Scope intake. Record the cases, beneficiaries, or matters to track as the issue identifies them, the source documents supplied, and whether this is a first baseline or an update to an existing table. If there is no case, beneficiary, or source document to track and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Extract statuses. For each case, record the case or matter reference, beneficiary, category, current status, receipt identifiers, and key dates exactly as the source documents state them; do not paraphrase or normalize. Mark gaps `[NOT AVAILABLE]`.
3. Build deadline rows. Capture every date that requires action or expiry awareness — status and document expirations, RFE and NOID response dates, max-out dates, renewal- and extension-window openings, recapture or grace-period endpoints as stated. One row per deadline; never merge deadlines across cases.
4. Tag provenance on every date:
   - `[STATED]` — the date appears in a source document or operator statement; cite the source.
   - `[COMPUTED — VERIFY]` — the date is derived (for example a max-out date or a renewal-window opening); the verify flag travels with the date, and confirmation routes to the responsible immigration attorney.
5. Assign an owner to every deadline row. Use the owner the issue names; otherwise enter `[OWNER]` and flag the row for operator completion. A row without an owner is an incomplete row.
6. Set the lead-time flag per row using these bands, measured from the date the table is produced:
   - `Overdue` — the date has passed with no recorded action.
   - `Urgent` — within 30 days.
   - `Approaching` — 31 to 90 days.
   - `Monitor` — beyond 90 days.
7. Apply the update convention. When updating an existing table, compare against the last update recorded on the issue and report only changed rows, keeping all other rows verbatim with a change-log line per modified row. On a first pass, state that the full baseline is being recorded.
8. Produce the output in the format below.

## Case-Status Table Format

| Case or matter reference | Beneficiary | Category | Current status | Key dates | Source |
|---|---|---|---|---|---|
| Reference as stated | Name as stated | Category as stated | Status as stated | Dates as stated | Document or comment cited, or `[NOT AVAILABLE]` |

## Deadline Table Format

| Case | Deadline type | Date | Provenance | Owner | Lead-time flag |
|---|---|---|---|---|---|
| Case reference | Expiration / RFE response / max-out / renewal window / other as stated | Date | `[STATED]` with source or `[COMPUTED — VERIFY]` | Named owner or `[OWNER]` | Overdue / Urgent / Approaching / Monitor |

Sort most urgent first. Record date formulas exactly as written when the anchor date is not stated; do not resolve them to calendar dates without a stated anchor.

## Action Items and Change Log

Close with operator follow-ups only:

- Deadlines to confirm with the responsible immigration attorney, starting with every `[COMPUTED — VERIFY]` and `Overdue` row.
- Documents needed to fill `[NOT AVAILABLE]` gaps and rows missing owners.
- On updates, the change log: one line per modified row with the prior value, the new value, and the source.

## Boundaries

- Do not file, respond, submit, send, post, or transmit anything to USCIS, the Department of Labor, a consulate, or any other external party or system; the tables are work products pending operator approval.
- Do not determine which deadline legally controls, whether an extension or grace period is available, or what a notice legally requires; flag those questions for the responsible immigration attorney.
- Do not expand the watch list beyond the cases the issue identifies.
- Do not state that a deadline is legally settled or that no action is required; every deadline is an operator follow-up.
