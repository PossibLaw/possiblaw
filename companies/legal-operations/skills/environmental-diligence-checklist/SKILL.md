---
name: environmental-diligence-checklist
description: Summarize Phase I and Phase II environmental reports when a diligence matter arrives, producing findings, recommendations, and data-gap tables that preserve each report's own characterizations with counsel-review flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/environmental-diligence-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Environmental Diligence Checklist

Use this skill to convert operator-supplied Phase I and Phase II reports and environmental disclosure documents into structured findings tables. This is mechanical extraction: every finding keeps the source report's own characterization, every row carries a cite and a counsel-review flag, and the summary draws no conclusions about liability or deal impact.

## Summarization Steps

1. Scope intake and document inventory. Record every report and disclosure document received — preparer, date, properties covered, and review status — in the inventory format below, noting any report or appendix the set references but does not include. If no reports or disclosure documents are supplied or the summarization scope is ambiguous and no acceptable default applies, gate with `missing-info-gate`.
2. Extract findings using the finding-type conventions. Record each finding with the source report's own characterization, verbatim with a report and section cite:
   - Recognized environmental condition (REC).
   - Historical recognized environmental condition (HREC).
   - Controlled recognized environmental condition (CREC).
   - De minimis condition.
   - Phase II sampling result, including any exceedance statement the report itself makes.
   - Other characterizations exactly as the report styles them.
   Never upgrade, downgrade, or relabel a finding, and never compare sampling results against regulatory standards.
3. Extract recommendations. Record every recommendation the report makes verbatim with its cite; do not add, omit, or reprioritize recommendations.
4. Record data gaps. Capture the gaps the reports self-identify, with cites, and add any documents or sections missing from the supplied set. Absence is recorded, not judged.
5. Flag every finding row `For counsel review`. If the operator asks what a finding means for the transaction, record the question in the data-gap and follow-up list and route it to the operator or responsible attorney.
6. Assemble the four tables in the formats below, in order: document inventory, findings, recommendations, data gaps.

## Extraction-Fidelity Rules

- Use the report's own words for every characterization, sampling result, and recommendation; condense only where verbatim text is impractical, and never at the cost of the characterization itself.
- Give every row a cite — report, section, and page or table — precise enough that a reviewer can find the source without searching.
- When two reports characterize the same condition differently, record both rows and note the difference; do not merge or reconcile them.
- Record dates, sampling locations, and units exactly as reported.

## Table Formats

Document inventory:

| Document | Preparer | Date | Properties covered | Review status |
|---|---|---|---|---|

Findings table:

| Finding | Report characterization | Source cite | Flag |
|---|---|---|---|
| Condition or result described in the report's words | REC / HREC / CREC / De minimis / Sampling result / as styled by the report | Report, section, page | `For counsel review` |

Recommendations table:

| Recommendation as stated | Source cite |
|---|---|

Data-gap list:

| Gap | How identified | Who can supply it |
|---|---|---|
| Self-identified report gap or missing document | Report cite, or `Missing from supplied set` | Operator, preparer, or counterparty |

## Boundaries

- Do not conclude liability, cleanup obligation, regulatory applicability, or deal impact, and do not give jurisdiction-specific advice as settled; those determinations belong to the operator or responsible attorney.
- Do not re-interpret sampling data against any standard, and do not relabel any report characterization.
- Do not transmit the summary or any underlying report to any external party or system; the summary is a work product pending operator approval.
