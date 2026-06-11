---
name: proofreading-checklist
description: Proofread a legal document pass by pass when a proofreading matter arrives, producing a findings table with exact locations covering defined-term consistency, cross-references, numbering, leftover placeholders, and typos.
metadata:
  sources:
    - path: companies/legal-operations/skills/proofreading-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Proofreading Checklist

Use this skill to proofread a legal document mechanically, pass by pass. The output is a findings table with exact locations that the requesting team can act on row by row. The proofread flags; it never rewrites the substance of the document.

## Proofreading Steps

1. Scope intake. Record the document under review, its version or date, the requesting team, and any sections the operator excluded. If the document is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Defined-term pass. Build the defined-term inventory and flag:
   - Terms defined but never used.
   - Capitalized terms used but never defined.
   - The same concept defined twice or under two names (for example "Agreement" and "Contract").
   - Inconsistent usage of a defined term (capitalization drift, singular/plural variants, undefined shorthand).
3. Cross-reference pass. Check every internal reference and flag references to sections, articles, exhibits, schedules, or annexes that do not exist, references that point to the wrong target after renumbering, and circular or self-references.
4. Numbering pass. Flag gaps, duplicates, or out-of-order numbering in sections, clauses, lists, exhibits, and recitals, and inconsistent numbering or lettering style between parallel structures.
5. Placeholder pass. Flag every leftover placeholder: bracketed text, `TBD`, `[●]`, blank lines for names or amounts, highlighted or commented draft notes, template boilerplate that does not fit the parties, and date or amount fields left unfilled.
6. Typo and mechanics pass. Flag typos, doubled or dropped words, incorrect party names, punctuation errors that change meaning, and inconsistent formatting of dates, amounts, and party designations.
7. Substantive ambiguity flags. Where a finding crosses from mechanics into meaning — a contradiction between sections, an obligation that changes depending on which reading is correct — record it as `Substantive flag` with both readings stated, and route it to the requesting team without proposing substantive language.
8. Produce the findings table and summary in the format below.

## Findings Table Format

| Location | Category | Severity | Finding | Suggested correction |
|---|---|---|---|---|
| Section, page, or paragraph reference exact enough to find in one pass | Defined term / Cross-reference / Numbering / Placeholder / Typo / Substantive flag | High / Medium / Low | One-sentence statement of the defect | Mechanical correction, or `[REQUESTING TEAM DECISION]` for every `Substantive flag` row |

Rate leftover placeholders and broken cross-references `High`. Every `Substantive flag` row routes to the requesting team; do not supply substantive replacement language.

## Summary and Next Actions

Close the proofread with:

- Finding counts by category and severity, with substantive flags counted separately.
- Sections not reviewed and why.
- A short ordered list of next actions, starting with `High` findings and substantive flags.

## Boundaries

- Do not rewrite, restructure, or alter the substance of the document; deliver findings and mechanical corrections only.
- Do not resolve substantive ambiguities or contradictions; flag them with both readings and route them to the requesting team.
- Do not edit the source document directly; the findings table is the deliverable.
- Do not transmit the document or the findings to any external party or system; the proofread is a work product pending operator approval.
