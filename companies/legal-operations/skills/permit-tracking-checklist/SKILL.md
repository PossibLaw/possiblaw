---
name: permit-tracking-checklist
description: Build environmental permit obligation tables when a permit-tracking matter arrives, producing a permit register and obligation table with conditions, monitoring and reporting obligations, renewal dates, and lead-time flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/permit-tracking-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Permit Tracking Checklist

Use this skill to turn operator-supplied environmental permits into a structured permit register and obligation table with lead-time flags. This is mechanical extraction and tracking: every condition carries a source cite, every date comes from a document, and every open question is an operator follow-up. No compliance conclusions and no agency submissions.

## Tracking Steps

1. Scope intake. Record the facilities covered, the permits supplied, the issuing agencies, the tracking horizon the operator requested, and today's date as stated in the issue. If no permit documents are supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the permit register. One row per permit: permit name and number, issuing agency, facility, effective date, expiration date, and status exactly as documented. Mark any date the documents do not state `[NOT PROVIDED]`; never estimate dates.
3. Extract conditions and obligations. For each permit, list every monitoring obligation, reporting obligation (report name, frequency, due date or trigger, recipient agency), operational condition, and recordkeeping requirement — verbatim, with a permit section or condition-number cite for every row.
4. Track renewals and deadlines. Record each permit's renewal application window or deadline as stated; where the permit states an advance-application requirement, record it verbatim. Compute the next due date for each recurring obligation from the stated frequency where the documents support it; otherwise mark `[NOT PROVIDED]`.
5. Apply lead-time flags. Using the issue's stated current date, flag each dated row: `OVERDUE` when the date has passed, `DUE ≤ 30 DAYS`, `DUE ≤ 90 DAYS`, or `ON TRACK`. For renewals with no stated application window, apply a default 180-day lead time and note the default. If no current date is available in the issue, flag every dated row `[DATE BASIS NEEDED]` and list it as an operator follow-up.
6. Produce the register, obligation table, and tracking notes in the format below.

## Permit Register Format

| Permit | Agency | Facility | Effective date | Expiration date | Renewal window | Flag |
|---|---|---|---|---|---|---|
| Permit name and number | Issuing agency as documented | Facility covered | Date or `[NOT PROVIDED]` | Date or `[NOT PROVIDED]` | Stated window or 180-day default noted | Lead-time flag |

## Obligation Table Format

| Permit | Obligation | Type | Frequency | Next due date | Flag | Source cite |
|---|---|---|---|---|---|---|
| Permit name | Obligation stated verbatim or closely summarized with verbatim trigger language | Monitoring / Reporting / Operational / Recordkeeping | As stated | Date or `[NOT PROVIDED]` | Lead-time flag | Permit section or condition number |

## Tracking Notes

Close the work product with:

- Missing documents, undated obligations, and ambiguous conditions, each with who can supply or clarify it.
- Defaults applied (for example the 180-day renewal lead time) and rows affected.
- Operator follow-ups, starting with `OVERDUE` and `DUE ≤ 30 DAYS` rows.

## Boundaries

- Do not conclude whether any obligation has been met or whether the company is in compliance; route compliance determinations to the operator or responsible attorney.
- Do not submit, file, or transmit any report, application, or correspondence to any agency or external system; the tracker is a work product pending operator approval.
- Do not soften, strengthen, or reinterpret permit conditions; record them as written and flag ambiguity for counsel.
