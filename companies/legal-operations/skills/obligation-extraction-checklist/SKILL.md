---
name: obligation-extraction-checklist
description: Extract every obligation, deadline, renewal and termination window, and notice requirement from an executed operator-supplied contract into structured tables with source cites when an obligation-extraction matter arrives, marking absent standard categories as not found.
metadata:
  sources:
    - path: companies/legal-operations/skills/obligation-extraction-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Obligation Extraction Checklist

Use this skill to convert an executed, operator-supplied contract into structured obligation tables. Capture each obligation exactly as the contract states it, cite where it lives, consolidate renewal and termination windows and notice requirements into their own tables, and mark every standard category the contract lacks. The tables are raw material for downstream review; they carry no opinions.

## Standard Obligation Categories

Work through every category. Record `[NOT FOUND]` when the contract has no matching language; never silently skip a category.

1. **Payment obligations** — amounts, invoicing mechanics, due dates, late-payment consequences, and fee-dispute procedures.
2. **Performance and delivery obligations** — services, deliverables, due dates, and acceptance procedures.
3. **Service levels and remedies** — uptime or response commitments, measurement periods, and credit or remedy mechanics.
4. **Reporting, audit, and record-keeping obligations** — reports owed, audit rights and windows, and retention periods.
5. **Insurance obligations** — required coverages, limits, and certificate-delivery requirements.
6. **Compliance obligations** — laws, policies, certifications, and training a party must observe or maintain.
7. **Confidentiality and data obligations** — protection duties, use limits, breach-notice duties, and return or destruction triggers.
8. **Renewal and termination windows** — auto-renewal mechanics, non-renewal notice deadlines, termination rights, and cure periods.
9. **Notice requirements** — required method, recipient, addresses, and timing for each notice type.
10. **Post-termination obligations** — transition assistance, survival provisions, final payments, and data return.

Record obligations outside this list as additional rows under their own descriptive category names.

## Extraction-Fidelity Rules

- Record each obligation as the contract states it; never normalize away conditions or merge distinct obligations into one row.
- Record the owner exactly as the contract names the responsible party, defined terms included; do not editorialize about who really performs.
- Record triggers and due dates as the contract states them. When a date must be computed from a trigger (for example, "no later than 60 days before the end of the Initial Term"), record the formula, mark the computed date `[COMPUTED]`, and show the inputs; never invent calendar dates the contract does not support.
- Record the consequence of missing an obligation only as the contract states it; enter `[NOT STATED]` when the contract is silent.
- Give every row a source cite — section number, heading, page, or paragraph — precise enough that a reviewer can find it without searching.
- When amendments or exhibits modify an obligation, record the operative current obligation and note the document chain in the row; note every referenced document that was not supplied.

## Obligation Table Format

| Obligation | Owner | Trigger | Due date | Consequence | Source |
|---|---|---|---|---|---|
| The obligation as stated | Responsible party as named | Triggering event as stated, or `None stated` | Date or formula as stated; computed dates marked `[COMPUTED]` with inputs | Consequence as stated, or `[NOT STATED]` | Section reference |

## Renewal and Termination Windows Table

| Action required | Window opens | Window closes | Consequence of missing | Source |
|---|---|---|---|---|
| Non-renewal notice, option exercise, termination election, or cure | Date or formula as stated | Date or formula as stated | As stated, or `[NOT STATED]` | Section reference |

## Notice Requirements Table

| Notice type | Method | Recipient | Timing | Source |
|---|---|---|---|---|
| Notice as the contract names it | Delivery method as stated | Recipient and address as stated | Timing as stated | Section reference |

## `[NOT FOUND]` and `[NOT STATED]` Conventions

- Enter `[NOT FOUND]` for any standard category with no matching language anywhere in the document, and list those categories in checklist order in a `[NOT FOUND]` summary after the tables.
- `[NOT FOUND]` is a statement about the contract as supplied, not a judgment that the obligation should exist; whether an absence matters is a review question for `contract-reviewer`.
- Enter `[NOT STATED]` in a row's column when the contract addresses the obligation but is silent on that field.
- If only part of the contract was supplied (pages missing, amendments or exhibits not provided), say so above the tables and mark affected categories `[NOT FOUND — document incomplete]` instead.

## Extraction Notes

Close with extraction notes covering ambiguous obligation boundaries, computed-date inputs, referenced-but-missing documents, and any portions of the contract not supplied.

## Boundaries

- Do not interpret, prioritize, or rate obligations, or advise on renewal, termination, cure, or response decisions; obligation analysis belongs to `contract-reviewer`.
- Do not compute calendar dates beyond the `[COMPUTED]` formula-plus-inputs convention.
- Do not transmit the tables or the underlying contract to any external party or system, including calendars or tracking tools; the tables are a work product pending operator approval.
