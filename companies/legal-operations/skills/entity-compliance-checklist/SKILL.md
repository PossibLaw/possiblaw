---
name: entity-compliance-checklist
description: Build entity-compliance calendars when an entity-compliance tracking matter arrives, producing an entity register and obligation calendar covering annual reports, franchise taxes, registered agents, good standing, and license renewals with lead-time flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/entity-compliance-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Entity Compliance Checklist

Use this skill to turn operator-supplied entity documents and statements into a structured entity register and compliance calendar with lead-time flags. This is mechanical tracking and structuring: every value carries a source note, every date comes from a document or operator statement, and every open question is an operator follow-up. No filings, no payments, and no compliance conclusions.

## Tracking Steps

1. Scope intake. Record the entities covered, the jurisdictions involved, the documents supplied (formation records, prior annual reports, registered-agent confirmations, good-standing certificates, licenses), the tracking horizon the operator requested, and today's date as stated in the issue. If no entity is identified at all and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the entity register. One row per entity: legal name, entity type, jurisdiction of formation, foreign qualifications, registered agent name and address, and good-standing status as last evidenced — the certificate or confirmation and its date, never a current conclusion. Mark any value the sources do not state `[NOT PROVIDED]`.
3. Extract compliance obligations. For each entity, list every annual or periodic report, franchise-tax or fee obligation, registered-agent renewal, license or registration renewal, and other recurring filing the sources state — each with its jurisdiction or agency, due date or trigger, and a source note. Record franchise-tax and fee obligations with their stated basis; never compute the amount owed.
4. Record due dates exactly as the sources provide them. Where a due date depends on a jurisdiction rule the sources do not state, record the dependency as a gap rather than computing a date from memory. Never estimate dates.
5. Apply lead-time flags. Using the issue's stated current date, flag each dated row: `OVERDUE` when the date has passed, `DUE ≤ 30 DAYS`, `DUE ≤ 90 DAYS`, or `ON TRACK`. If no current date is available in the issue, flag every dated row `[DATE BASIS NEEDED]` and list it as an operator follow-up.
6. Produce the entity register, compliance calendar, gap list, and operator follow-ups in the formats below.

## Entity Register Format

| Entity | Type | Jurisdiction of formation | Foreign qualifications | Registered agent | Good standing (as last evidenced) | Source |
|---|---|---|---|---|---|---|
| Legal name | Corporation / LLC / other as documented | Jurisdiction or `[NOT PROVIDED]` | Jurisdictions or `[NOT PROVIDED]` | Name and address or `[NOT PROVIDED]` | Evidence and its date or `[NOT PROVIDED]` | Document or statement cited |

## Compliance Calendar Format

| Entity | Obligation | Jurisdiction / agency | Due date | Flag | Source note |
|---|---|---|---|---|---|
| Legal name | Annual report / franchise tax / registered-agent renewal / license renewal / other, as documented | As stated | Date or `[NOT PROVIDED]` | Lead-time flag | Document or statement cited |

## Gap List Format

After the calendar, list every `[NOT PROVIDED]` or ambiguous value with:

- What is missing and why it matters for the calendar.
- Who can supply it (operator, registered agent, filing office, accountant, counsel).
- Whether it blocks a calendar row or only a follow-up.

## Operator Follow-Up Format

Close with every upcoming or overdue action framed as a request for the operator to commission — filing the annual report, paying the franchise tax, renewing the registered agent or license, ordering a good-standing certificate — ordered by lead-time flag, starting with `OVERDUE` and `DUE ≤ 30 DAYS` rows. Include franchise-tax computations and jurisdiction-rule confirmations as follow-ups; never perform or promise them.

## Boundaries

- Do not file, submit, pay, post, or transmit anything to any registry, agency, registered agent, or external system; the calendar is a work product pending operator approval.
- Do not conclude that an entity is in good standing, compliant, or delinquent; record evidence, dates, and flags only, and route determinations to the operator or responsible attorney.
- Do not compute franchise-tax or other final amounts owed, and do not state jurisdiction filing rules from memory as fact; organize the obligation and flag the computation or rule for the operator.
