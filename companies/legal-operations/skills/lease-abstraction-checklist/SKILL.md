---
name: lease-abstraction-checklist
description: Abstract an operator-supplied commercial lease into structured key-terms and critical-dates tables when an abstraction matter arrives, recording terms as stated with location cites and marking absent standard fields.
metadata:
  sources:
    - path: companies/legal-operations/skills/lease-abstraction-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Lease Abstraction Checklist

Use this skill to convert an operator-supplied commercial lease into a structured abstract. Capture each key term exactly as the lease states it, cite where it lives, consolidate every deadline into a critical-dates table, and mark every standard field the lease lacks. The abstract is raw material for downstream review; it carries no opinions.

## Standard Abstraction Fields

Work through every field. Record `[NOT FOUND]` when the lease has no matching language; never silently skip a field.

1. **Parties** — landlord, tenant, and any guarantors, with their defined short names and notice-copy parties.
2. **Premises** — address, suite or floor, stated rentable and usable area, and the exhibits that depict the premises.
3. **Term** — effective date, commencement date, rent commencement date, expiration date, and any early-access or beneficial-occupancy provisions.
4. **Rent schedule and escalations** — base rent by period exactly as stated, escalation mechanics, percentage rent, abatements, and free-rent periods.
5. **Security deposit** — amount, form (cash or letter of credit), burn-down provisions, and return conditions.
6. **Renewal and termination options** — each option with its exercise window, notice deadline, and rent-setting mechanics.
7. **Assignment and subletting** — consent standard, permitted-transfer carve-outs, recapture rights, and profit-sharing provisions.
8. **Maintenance and CAM** — repair-responsibility split, the operating-expense or CAM definition, caps, exclusions, gross-up provisions, and audit rights.
9. **Insurance** — required coverages and limits for each party, additional-insured requirements, and waiver of subrogation.
10. **Notice addresses** — how formal notices are given, to whom, at what addresses, and when they take effect.

Record terms outside this list (for example parking, signage, exclusives, co-tenancy, SNDA, holdover) as additional rows under their own descriptive field names.

## Abstraction-Fidelity Rules

- Record names, dates, amounts, and mechanics exactly as the lease states them; never normalize, round, or restate economic terms, and never compute escalated rents, prorations, or option rents.
- Give every row a location cite — section number, heading, page, or exhibit — precise enough that a reviewer can find the term without searching.
- When amendments, riders, or exhibits modify a term, record the operative current term and note the document chain in the row; note every referenced document that was not supplied.
- When a field appears in more than one place, record every occurrence; do not merge conflicting statements — record the conflict in the row's notes.
- Abstraction is not interpretation: no risk ratings, no market comparisons, no enforceability views, no suggested edits.

## Key-Terms Table Format

Produce a markdown table with one row per abstracted field or `[NOT FOUND]` marker:

| Field | Location | Terms as stated | Notes |
|---|---|---|---|
| Rent schedule and escalations | Section 4.1, Exhibit B | Terms exactly as the lease states them | Conflicts, amendment chain, or referenced documents not supplied, or `None` |

Keep stated terms intact even when long; fidelity outranks table aesthetics. For very long provisions, the row may carry the location cite while the full text follows in a quoted block immediately below the table, keyed by field and location.

## Critical-Dates Table

Consolidate every date or deadline that requires notice or action into its own table:

| Date or deadline | Event | Source provision | Notice requirement |
|---|---|---|---|
| Date as stated or formula as stated | Option exercise, expiration, CAM reconciliation, insurance certificate, and similar | Section reference | Notice period and method as stated, or `None stated` |

Record date formulas (for example "no later than 12 months before expiration") exactly as written; do not resolve them to calendar dates unless the anchor date is stated in the lease.

## `[NOT FOUND]` Convention

- Enter `[NOT FOUND]` in the Location, Terms as stated, and Notes columns for any standard field with no matching language anywhere in the lease.
- `[NOT FOUND]` is a statement about the lease as supplied, not a judgment that the term should exist; whether an absence matters is a review question for `lease-reviewer`.
- If only part of the lease was supplied (pages missing, amendments or exhibits not provided), say so above the table and mark affected fields `[NOT FOUND — document incomplete]` instead.

## Boundaries

- Do not interpret, rate, score, or compare lease terms to market standards; lease analysis belongs to `lease-reviewer`.
- Do not rewrite, redline, or suggest edits to any provision.
- Do not compute rents, escalations, prorations, or any other amounts not stated in the lease.
- Do not transmit the abstract or the underlying lease to any external party or system; the abstract is a work product pending operator approval.
