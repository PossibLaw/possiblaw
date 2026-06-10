---
name: clause-extraction-checklist
description: Extract clauses from an operator-supplied contract into a structured inventory when an extraction matter arrives, recording verbatim text with location cites and marking absent standard clause types.
metadata:
  sources:
    - path: companies/legal-operations/skills/clause-extraction-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Clause Extraction Checklist

Use this skill to convert an operator-supplied contract into a structured clause inventory. Capture each clause exactly as the document states it, cite where it lives, and mark every standard clause type the document lacks. The inventory is raw material for downstream review; it carries no opinions.

## Standard Clause Types

Work through every type. Record `[NOT FOUND]` when the document has no matching clause; never silently skip a type.

1. **Parties** — the named parties, their defined short names, and their stated roles.
2. **Term** — the effective date, initial term, and any renewal or extension mechanics.
3. **Termination** — termination for cause, termination for convenience, notice periods, and post-termination obligations.
4. **Payment** — fees, payment timing, late-payment consequences, taxes, and price-adjustment mechanics.
5. **Intellectual property** — ownership, assignments, license grants, and background-IP carve-outs.
6. **Confidentiality** — the definition of confidential information, exclusions, permitted disclosures, and survival.
7. **Indemnity** — who indemnifies whom, for what, and any procedural conditions.
8. **Liability caps** — caps, exclusions of damages types, and any carve-outs from the cap.
9. **Warranties** — representations and warranties given by each party and any disclaimers.
10. **Assignment and change of control** — anti-assignment language, consent requirements, and change-of-control triggers.
11. **Governing law** — the chosen law and any carve-outs.
12. **Dispute resolution** — courts, arbitration, mediation steps, venue, and jury or class waivers.
13. **Notices** — how formal notices are given, to whom, and when they take effect.

Record clauses outside this list (for example insurance, audit rights, force majeure, publicity) as additional rows under their own descriptive type names.

## Extraction-Fidelity Rules

- Record clause text verbatim, character for character, including defined terms and internal numbering; never paraphrase, condense, or normalize.
- Give every row a location cite — section number, heading, page, or paragraph — precise enough that a reviewer can find the clause without searching.
- When a clause type appears in more than one place, record every occurrence as its own row; do not merge occurrences.
- Record the parties affected exactly as the clause names them, defined terms included, not by a reading of who benefits.
- Record every cross-reference the clause makes to other sections, schedules, exhibits, or external documents; if a referenced document was not supplied, note that in the row.
- Extraction is not interpretation: no risk ratings, no market comparisons, no enforceability views, no suggested edits.

## Inventory Table Format

Produce a markdown table with one row per extracted clause or `[NOT FOUND]` marker:

| Clause type | Location | Verbatim text | Parties affected | Cross-references |
|---|---|---|---|---|
| Governing law | Section 14.2 | Exact clause text, character for character | Parties as named in the clause | Sections, exhibits, or external documents cited, or `None` |

Keep verbatim text intact even when long; fidelity outranks table aesthetics. For very long clauses, the row may carry the location cite while the verbatim text follows in a quoted block immediately below the table, keyed by clause type and location.

## `[NOT FOUND]` Convention

- Enter `[NOT FOUND]` in the Location, Verbatim text, Parties affected, and Cross-references columns for any standard clause type with no matching language anywhere in the document.
- `[NOT FOUND]` is a statement about the document as supplied, not a judgment that the clause should exist; whether an absence matters is a review question for `contract-reviewer`.
- If only part of the document was supplied (pages missing, exhibits not provided), say so above the table and mark affected types `[NOT FOUND — document incomplete]` instead.

## Boundaries

- Do not interpret, rate, score, or compare clauses to market standards; clause analysis belongs to `contract-reviewer`.
- Do not rewrite, redline, or suggest edits to any clause.
- Do not transmit the inventory or the underlying contract to any external party or system; the inventory is a work product pending operator approval.
