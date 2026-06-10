---
name: ip-trademark-intake-checklist
description: Extract trademark intake facts into a structured record when a trademark matter arrives, producing a gap list and a clearance-search request outline.
metadata:
  sources:
    - path: companies/legal-operations/skills/ip-trademark-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Trademark Intake Checklist

Use this skill to convert a raw trademark request into a structured intake record. Capture facts exactly as the source states them, mark every gap, and frame the clearance search as a request to commission — not a search to run.

## Checklist Fields

Work through every field. Record `[NOT PROVIDED]` when the source has no answer; never silently skip a field.

1. **Mark identity** — word mark, design mark, or both; the exact characters claimed and a plain description of any design element.
2. **Goods and services** — plain-language description of what the mark is used on or with, as the operator states it. Do not assign classification numbers.
3. **Dates of first use** — first use anywhere and first use in commerce, recorded separately.
4. **Specimen availability** — whether specimens of current use exist (labels, packaging, screenshots, marketing materials) and where they are stored.
5. **Owner entity** — full legal name, entity type, and citizenship or jurisdiction of formation.
6. **Priority claims** — any earlier application or registration the owner intends to claim priority from, with number and date.
7. **Target jurisdictions** — where protection is sought (for example US federal, EU, UK, individual states).
8. **Known third-party uses or conflicts** — similar marks, prior disputes, or coexistence arrangements the operator already knows about, recorded verbatim.
9. **Domains and social handles** — registered domains and platform handles matching or near the mark, and who controls them.

## Output: Structured Intake Record

Produce a markdown table with one row per checklist field:

| Field | Value | Source |
|---|---|---|
| Mark identity | [value or `[NOT PROVIDED]`] | [issue description / operator comment / parent issue] |

Repeat for all nine fields. The `Source` column cites where in the issue the fact came from, so downstream reviewers can verify extraction without re-reading the whole thread.

## Output: Gap List

After the table, list every `[NOT PROVIDED]` or ambiguous field with:

- What is missing and why it matters for clearance or registration prep.
- Who can supply it (operator, owner entity, marketing, counsel).
- Whether it blocks the clearance-search outline or only later filing preparation.

Registrability questions (distinctiveness, descriptiveness, likelihood of confusion) belong in the gap list as flagged items for operator or counsel follow-up; the skill records the question, never the answer.

## Output: Clearance-Search Request Outline

Close with an outline the operator or counsel can use to commission a clearance search:

- **Search targets** — the exact mark, phonetic equivalents, and obvious variant spellings.
- **Jurisdictions** — registers and common-law sources matching the target jurisdictions.
- **Goods/services scope** — the plain-language description, flagged for classification by the searcher.
- **Known-conflict context** — third-party uses from the checklist that the search should specifically assess.

## Boundaries

- No registrability opinions. Do not assess distinctiveness, descriptiveness, or likelihood of confusion; flag those as questions for operator or counsel follow-up.
- No filings. This skill produces an intake record and a search request outline; it never prepares or submits an application to any registry.
