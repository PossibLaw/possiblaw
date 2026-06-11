---
name: govcon-certification-checklist
description: Build or update representations-and-certifications and registration tracking tables when a certification-tracking matter arrives, producing a status table with renewal flags, discrepancy observations, and operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/govcon-certification-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# GovCon Certification Checklist

Use this skill to turn operator-supplied registration and certification records into a structured tracking table. Record statuses and dates exactly as the records state them, flag renewals mechanically by date, and surface discrepancies as cited observations. Nothing tracked under this skill is submitted, attested, or determined.

## Tracking Steps

1. Scope intake. Record the entity tracked, the records supplied (SAM records, reps-and-certs extracts, certification letters, prior trackers on the issue), and the review date stated in the issue. If no entity is identified or no registration records are supplied and no acceptable default applies, gate with `missing-info-gate`.
2. Inventory the records. List each record received with its source and date, noting any record the set references but does not include.
3. Build or update the tracking table. Enter one row per registration or certification item in the format below — SAM registration, representations and certifications, small-business size status, socioeconomic certifications (for example 8(a), HUBZone, WOSB, SDVOSB), and any other registration the records cover. Record statuses, dates, and size-status statements exactly as the records state them, with a source cite for every value; mark absent values `[NOT PROVIDED]`. When updating an existing tracker, preserve prior rows and mark changed values with the source of the update.
4. Apply the renewal-flag rules:
   - Flag every item whose stated expiration falls within 90 days of the review date, or within a different window the issue specifies.
   - Flag every item whose stated expiration has passed.
   - Flag every item with no expiration or renewal date in the records as `Undated`.
   - Address each flag to the operator with its date basis cited; a flag is a date observation, not a determination that renewal is required.
5. Record exclusion- or debarment-related entries only as stated in the supplied records and flag them for the operator; never clear a party against any government list.
6. Scan for discrepancy signals. Record each verbatim with its citation, without conclusions:
   - Conflicting dates or statuses across records.
   - Certifications referenced but not supplied.
   - Registrations or certifications naming a different entity than the one tracked.
7. Build the gap list and operator follow-ups in the format below.

## Tracking Table Format

| Item | Type | Status as stated | Effective or issued date | Expiration date | Renewal flag | Source |
|---|---|---|---|---|---|---|
| Registration or certification name | SAM registration / Reps and certs / Size status / Socioeconomic certification / Other | Status exactly as the record states it | Date as stated or `[NOT PROVIDED]` | Date as stated or `[NOT PROVIDED]` | Expired / In renewal window / Undated / `None` | Record and location cite |

## Renewal Flag List

List every flagged row with its date basis cited, ordered expired first, then in-window by stated expiration, then undated.

## Gap List and Operator Follow-Up Format

| Gap or follow-up | Why it matters | Who can supply or resolve it |
|---|---|---|
| Missing or ambiguous item, or an action to commission (for example renewing a registration or refreshing reps and certs) | One-line statement of what turns on it | Operator or responsible counsel |

Frame every action item as an operator follow-up; never perform, submit, or promise the follow-up.

## Boundaries

- Do not submit, file, post, or transmit any registration, representation, or certification to SAM, any agency portal, or any external party or system, and do not attest or sign on anyone's behalf.
- Do not determine, confirm, or predict size status, program eligibility, or responsibility, and do not clear a party against any government list; record stated facts and flag determinations to the operator or responsible counsel.
- Do not paraphrase or normalize recorded statuses and dates; fidelity to the records outranks readability.
