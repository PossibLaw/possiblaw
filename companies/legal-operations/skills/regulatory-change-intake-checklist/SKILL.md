---
name: regulatory-change-intake-checklist
description: Structure operator-supplied regulatory-change inputs into impact records when a regulatory-change matter arrives, with effective dates flagged as operator follow-ups and no compliance conclusions.
metadata:
  sources:
    - path: companies/legal-operations/skills/regulatory-change-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Regulatory Change Intake Checklist

Use this skill to turn operator-supplied regulatory-change inputs — rule texts, agency notices, alerts, consultation papers — into structured impact records. This is mechanical extraction and structuring from supplied inputs only: no live monitoring of external feeds, no compliance conclusions, and every date framed as an operator follow-up.

## Intake Fields

Capture each field exactly as the source states it, with a cite to the supplied document. Mark absent fields `[NOT PROVIDED]`.

1. **Source document** — title, document or docket number, and where the operator obtained it.
2. **Issuing body** — the agency, legislature, or body issuing the change, with its jurisdiction.
3. **Instrument type** — final rule, proposed rule, guidance, enforcement bulletin, consultation, or other, as stated.
4. **Change summary** — what changed relative to the prior state, stated factually from the source text.
5. **Affected business areas** — the products, activities, or functions the source text addresses, mapped to the company's areas as the operator describes them.
6. **Key dates** — publication, comment-deadline, effective, and transition dates exactly as stated, each flagged `[OPERATOR FOLLOW-UP: confirm and calendar]`; never computed, extended, or confirmed.
7. **Obligations stated** — the specific requirements, prohibitions, or thresholds the source text states, quoted or closely paraphrased with cites.
8. **Suggested owners** — the function or role best placed to assess each obligation, framed as a suggestion for the operator to assign.

## Impact Record Format

| Field | Value | Source cite |
|---|---|---|
| One row per field above | Value exactly as stated or `[NOT PROVIDED]` | Document and section/page |

Follow the table with an obligations list: one row per stated obligation, its affected area, its key date flag, and its suggested owner.

## Gap List and Operator Follow-Ups

Close the record with:

- Gap list — every missing or ambiguous item (for example no effective date stated, affected-area mapping unclear), why it matters, and who can supply it.
- Operator follow-ups — confirm-and-calendar actions for every key date, assignment decisions for suggested owners, and any need to obtain the official text where the operator supplied a secondary summary.

## Escalation Triggers

Stop structuring the affected element, name the trigger in a durable comment, and route to `chief-counsel` when the input involves:

- Enforcement actions, investigations, or examination findings directed at the company.
- A request for analysis of whether the company is or is not compliant.
- Privileged analysis — counsel memos or legal-advice documents supplied as inputs.

## Boundaries

- Do not assert that the business is or is not compliant with the change, and do not characterize the severity of non-compliance.
- Do not monitor live external feeds or fetch sources on your own; work from operator-supplied inputs and attached connectors only.
- Do not transmit the record to any external party or system; the record is a work product pending operator approval.
