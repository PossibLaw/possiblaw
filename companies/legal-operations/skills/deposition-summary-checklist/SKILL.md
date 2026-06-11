---
name: deposition-summary-checklist
description: Summarize a deposition transcript supplied in the issue when a summarization matter arrives, producing a page-line summary, a topic index, and an admission and contradiction table with verbatim citations.
metadata:
  sources:
    - path: companies/legal-operations/skills/deposition-summary-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Deposition Summary Checklist

Use this skill to convert a deposition transcript supplied in the issue into a structured summary set: a page-line summary, a topic index, and an admission and contradiction table. The output is mechanical extraction with citations; it carries no credibility judgments and no conclusions about the merits.

## Summary Steps

1. Scope intake. Record the deponent's name and role, the case context (claims and defenses as stated in the issue), the transcript supplied, any portions the operator excluded, and the exhibit list if provided. If no transcript is supplied in the issue and no acceptable default applies, gate with `missing-info-gate` instead of guessing; never fetch or reconstruct testimony from outside the issue.
2. Build the page-line summary. Work through the transcript in order, producing one entry per testimony segment with its `page:line` range and a neutral one- or two-sentence summary. Preserve the deponent's meaning exactly; do not compress testimony in a way that changes what was said. Mark passages that are unintelligible, interrupted, or consumed by objections as `[OBJECTION COLLOQUY]` or `[UNINTELLIGIBLE]` with their cites.
3. Build the topic index. Group every summary entry under topic headings derived from the claims, defenses, and subject matter of the testimony, listing all `page:line` cites per topic so a reader can pull every passage on a topic without re-reading the transcript.
4. Build the admission and contradiction table. Record statements against the deponent's or a party's stated position, concessions, and testimony that conflicts internally or with documents identified in the issue. Quote the testimony verbatim with its cite, identify what it conflicts with (another cite or a named document), and label every entry `Potential` — whether it is an admission or impeachment material is a characterization for the operator or responsible attorney.
5. Log exhibits referenced. List each exhibit mentioned in the testimony with the cites where it appears and whether the exhibit itself was supplied in the issue.
6. Close with counts (summary entries, topics, potential admissions, potential contradictions, exhibits referenced) and operator follow-ups, including any transcript gaps.

## Output Format

Page-line summary:

| Page:Line | Summary |
|---|---|
| 12:5–13:18 | Neutral one- or two-sentence summary of the testimony segment |

Topic index:

| Topic | Page:Line cites |
|---|---|
| Topic heading | All cites for the topic, comma-separated |

Admission and contradiction table:

| Type | Page:Line | Verbatim testimony | Conflicts with | Note |
|---|---|---|---|---|
| Potential admission / Potential contradiction | Cite | Exact quoted testimony | Conflicting cite or document name, or `None — statement against stated position` | One-line neutral note for attorney review |

## Boundaries

- Do not assess credibility, weigh testimony, or state conclusions about the merits, impeachment value, or how testimony helps or hurts a party; label findings `Potential` and route characterization to the operator or responsible attorney.
- Summarize only transcripts and documents supplied in the issue; do not fetch, reconstruct, or infer testimony from any other source.
- Do not transmit the summary or the transcript to any external party or system; the summary set is a work product pending operator approval.
