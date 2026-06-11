---
name: license-renewal-checklist
description: Build and maintain renewal registers for business and professional licenses, registrations, and permits when a license-renewal tracking matter arrives, producing one row per license with jurisdiction, holder, renewal window, and prerequisites plus lead-time flags and no renewal filed.
metadata:
  sources:
    - path: companies/legal-operations/skills/license-renewal-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# License Renewal Checklist

Use this skill to build and maintain a renewal register for business and professional licenses, registrations, and permits from operator-supplied inputs. Record every value exactly as stated with a source cite, band each renewal window by lead time, and flag every date for operator confirmation. Contract renewals are out of scope; they belong to the commercial practice's renewal tracking.

## Tracking Steps

1. Record the register fields for each license, registration, or permit, with `[NOT PROVIDED]` marking gaps and a source cite for every value:
   - License, registration, or permit type and identifier, verbatim.
   - Issuing authority and jurisdiction, as the source names them.
   - Holder (entity or named professional), as stated.
   - Issue and expiration dates, exactly as stated.
   - Renewal window, as the source states it, marked `[OPERATOR FOLLOW-UP: confirm and calendar]`.
   - Prerequisites: continuing-education hours, fees, forms, attestations, background checks, or other requirements the source states.
   - Prerequisite completion status, only as the operator states it; an unknown status is a gap, not a guess.
2. Apply the lead-time flag bands. Band each renewal window by the dates the source states, measured from the date of this register update; bands are organizational flags, never deadline determinations:
   - `OVERDUE/OPEN NOW` — the source reports the window already open, or an expiration date already passed.
   - `URGENT` — the stated window opens or the stated expiration falls within 30 days.
   - `UPCOMING` — within 31 to 90 days.
   - `MONITOR` — more than 90 days out.
   - `UNKNOWN` — no usable date stated; record as a gap.
3. Check the escalation triggers. Flag prominently in the register and escalate to the operator through the lead when the source reports any of:
   - A lapsed or expired license, registration, or permit.
   - A renewal window already open or already passed.
   - A stated prerequisite that cannot be completed before the stated window closes (for example outstanding continuing-education hours exceeding the remaining window).
   - Ambiguity about whether a license is required at all; do not resolve it — route the determination to the operator or responsible attorney.
4. Compile the lead-time flags: renewal windows ordered soonest first, each with its band and outstanding prerequisites.
5. Compile the gap list and operator follow-ups: every missing field, who can supply it, and a confirm-and-calendar action for each renewal window.
6. Update the existing register rather than starting a new one, and date each update.

## Output: Renewal Register

| License/permit | Identifier | Jurisdiction | Issuing authority | Holder | Expiration | Renewal window | Prerequisites | Prerequisite status | Source |
|---|---|---|---|---|---|---|---|---|---|

One row per license, with `[NOT PROVIDED]` marking gaps and every renewal date marked `[OPERATOR FOLLOW-UP: confirm and calendar]`.

## Output: Lead-Time Flags

- One line per renewal window, ordered soonest first, with its band (`OVERDUE/OPEN NOW`, `URGENT`, `UPCOMING`, `MONITOR`, `UNKNOWN`), outstanding prerequisites, and any escalation trigger present.

## Output: Gap List and Operator Follow-Ups

- Each missing field, who can supply it, and the confirm-and-calendar action for each renewal window.

## Boundaries

- Never file, submit, pay, or transmit a renewal application, fee, or any other material to a regulator or external system; the register is a work product pending operator action.
- Never compute, extend, or confirm a deadline against statutory or regulator text, and do not advise whether a license is required, current, or in good standing; route those determinations to the operator or responsible attorney.
- Track licenses, registrations, and permits only; contract renewals, auto-renewals, and cancel-by notice windows belong to the commercial practice's renewal tracking, not this register.
- Work from operator-supplied inputs only; never query a regulator portal or any other external source on your own initiative.
