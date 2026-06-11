---
name: disclosure-schedule-playbook
description: Draft disclosure-schedule skeletons keyed to the governing agreement's representation sections when a disclosure-schedule matter arrives, producing per-section schedules with placeholders and an exceptions-intake table.
metadata:
  sources:
    - path: companies/legal-operations/skills/disclosure-schedule-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Disclosure Schedule Playbook

Use this skill to build a disclosure-schedule skeleton that qualifies the representations and warranties in an acquisition agreement. The output is a skeleton the deal team fills with verified facts — it contains placeholders and intake rows, never decided disclosures.

## Drafting Steps

1. Scope intake. Record the deal name, governing agreement and version, disclosing party, representation article and section numbering, the defined terms that gate disclosure (knowledge, materiality, Material Adverse Effect), and any sections the operator excluded. If the agreement and its representation sections are absent and the standard set in step 2 is not an acceptable fallback under the requesting agent's defaults, gate with `missing-info-gate` instead of guessing.
2. Map the representation sections. List every representation that customarily takes a schedule, in agreement order. When the agreement is not supplied, use this standard set and mark every reference `[CONFIRM SECTION REF]`: organization and qualification; capitalization; subsidiaries; authority and no-conflicts; required consents and approvals; financial statements; undisclosed liabilities; absence of changes; material contracts; real property; intellectual property; litigation; compliance with law and permits; tax; employee matters and benefit plans; environmental; insurance; related-party transactions; and brokers.
3. Build one schedule per mapped section. Each schedule carries:
   - A heading whose schedule number mirrors the representation section number.
   - A caption restating the representation it qualifies, quoting the operative language when the agreement is supplied.
   - A disclosure placeholder `[DISCLOSURES — PENDING OPERATOR DECISION]` and a `Nothing to disclose.` option, neither pre-selected.
   - A cross-reference line: `Cross-references: [OPERATOR TO CONFIRM]`.
4. Build the exceptions-intake table in the format below. Seed it with candidate exceptions already named in the issue or its attachments, marking each `Unverified`; leave the table's decision column `[PENDING]` in every row.
5. Add the cover block — deal name, agreement reference, disclosing party, draft date, and an introductory-paragraph placeholder covering construction and cross-disclosure — and an `Assumptions and open items` section listing every default, placeholder, and operator follow-up.

## Exceptions-Intake Table Format

| # | Candidate exception | Source | Affected schedule(s) | Status | Operator decision |
|---|---|---|---|---|---|
| Sequential | One-sentence factual description | Issue, data-room cite, or operator comment | Schedule number(s) or `[TBD]` | Unverified / Verified | `[PENDING]` until the operator marks disclose, omit, or escalate |

## Skeleton Assembly Order

1. Cover block with introductory-paragraph placeholder.
2. `Assumptions and open items`.
3. Schedules in agreement order, one per mapped representation section.
4. Exceptions-intake table.

## Boundaries

- Do not decide whether any exception must be disclosed, where it cross-applies, or whether `Nothing to disclose.` is accurate; those are determinations for the operator or responsible attorney.
- Do not draft or modify representation language in the governing agreement; the skeleton qualifies representations, it does not rewrite them.
- Do not transmit the skeleton or any exception to the counterparty, opposing counsel, or any external party or system; the skeleton is a work product pending operator approval.
