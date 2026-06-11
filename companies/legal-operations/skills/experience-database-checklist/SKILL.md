---
name: experience-database-checklist
description: Maintain structured matter-experience records for pitch use when an experience-database matter arrives, producing record tables with matter type, industry, role, outcome descriptor, and a confidentiality flag on every row.
metadata:
  sources:
    - path: companies/legal-operations/skills/experience-database-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Experience Database Checklist

Use this skill to add, update, or correct matter-experience records that feed pitches and proposals. Each matter is one structured row built only from operator-supplied facts. Every row carries a confidentiality flag, and confidential details stay out of pitch-ready text until the operator approves their use.

## Curation Steps

1. Intake. Determine the requested action — add records, update records, correct records, or extract pitch-ready rows — and gather the supplied matter facts. If no facts are supplied and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build or update one row per matter using the record schema below. Record each field exactly as the operator supplied it; mark every field with no supplied fact `[NOT PROVIDED]`. Never invent or embellish matters, outcomes, credentials, or client identities.
3. Set the confidentiality flag on every row using the flag rules below. When the operator has not stated a status, default to `Confidential — operator approval required` and record the default.
4. Apply the pitch-ready text rules: only rows flagged `Approved — pitch-ready` may carry client-identifying pitch text; `Anonymized only` rows describe the client by industry and size band; confidential rows carry no pitch-ready text.
5. Produce the record table, the change log, and the confidentiality summary in the formats below, citing the source of every change.

## Record Schema

1. **Record ID** — stable identifier (`EXP-[SEQUENCE]` for new rows).
2. **Matter type** — the work performed, as supplied (for example acquisition, licensing dispute, financing).
3. **Industry** — the client's industry, as supplied.
4. **Firm role** — the firm's role, as supplied (for example lead counsel, local counsel, advisor).
5. **Outcome descriptor** — exactly as the operator supplied it; no superlatives, rankings, or guarantees added.
6. **Year or period** — as supplied.
7. **Confidentiality flag** — one of the values below.
8. **Pitch-ready text** — only where the flag permits; otherwise `[WITHHELD — pending operator approval]`.
9. **Source** — the issue, comment, or operator note the row came from.

## Confidentiality Flag Rules

- `Approved — pitch-ready`: the operator approved use of this matter, including any client identification the operator stated.
- `Anonymized only`: the operator approved use without client identification; pitch-ready text uses industry and size band only.
- `Confidential — operator approval required`: the default for every row whose status the operator has not stated; the row is excluded from pitch-ready text.
- Flags move only on an explicit operator statement; record who approved and where. Never decide that a confidential matter may appear in pitch-ready text.

## Record Table Format

| Record ID | Matter type | Industry | Firm role | Outcome descriptor | Year/period | Confidentiality flag | Pitch-ready text | Source |
|---|---|---|---|---|---|---|---|---|
| `EXP-001` | As supplied | As supplied | As supplied | As supplied verbatim | As supplied | One of the three flag values | Permitted text or `[WITHHELD — pending operator approval]` | Issue or comment reference |

## Change Log and Confidentiality Summary

Close every pass with:

- A change log: one line per row added, updated, or corrected, with the field changed and the source of the change.
- A confidentiality summary: row counts by flag, rows awaiting operator approval, and rows excluded from pitch-ready text with the reason.

## Boundaries

- Do not invent, embellish, or infer matters, outcomes, credentials, or client identities; facts come from the operator or the field stays `[NOT PROVIDED]`.
- Do not include client names or confidential matter details in pitch-ready text unless the row's flag shows explicit operator approval.
- Do not draft pitch or proposal language; the records are inputs for `bd-proposal-drafter`, routed via `bd-lead`.
- Do not transmit the records or any matter detail to any external party or system; the records are work products pending operator approval.
