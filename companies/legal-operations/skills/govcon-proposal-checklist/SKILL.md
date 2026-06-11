---
name: govcon-proposal-checklist
description: Review a proposal against its solicitation when a proposal-compliance matter arrives, producing a requirement-by-requirement compliance matrix against Sections L and M with gap and risk flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/govcon-proposal-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# GovCon Proposal Checklist

Use this skill to build a compliance matrix mapping proposal sections against solicitation requirements. The matrix flags gaps, page-limit risks, and unsupported claims for operator action; it scores nothing, recommends no bid decision, and submits nothing.

## Review Steps

1. Scope intake. Record the solicitation number, the amendment set named in the issue, the proposal volumes supplied, and any sections the operator excluded. If the solicitation, its amendments, or the proposal volumes under review are absent and no acceptable default applies, gate with `missing-info-gate`. When amendments are referenced but not provided, record the amendment gap as a finding rather than reviewing a possibly superseded baseline.
2. Extract requirements as written. Work through Section L instructions, Section M evaluation factors and subfactors, and statement-of-work or performance-work-statement requirements cross-referenced by either. Assign each requirement an ID (`L-1`, `M-1`, `SOW-1`, in document order) with a source cite. Do not infer unstated requirements.
3. Map each requirement to the proposal. Record the proposal section that addresses it and its status — Addressed, Partial, or Missing — with a one-line basis for the status.
4. Record evaluation-factor coverage separately. Group the `M` rows by evaluation factor and subfactor so the operator can see factor coverage independent of instruction compliance.
5. Flag risks factually:
   - Page-limit and format risks: stated limit, observed count, and margin and font instructions as written, without deciding how the agency would treat a violation.
   - Unsupported claims: past-performance assertions, certifications referenced but not attached, and staffing commitments without named resources, each as an `Unsupported claim` row for operator substantiation; do not verify or rewrite the claims.
   - Amendment gaps: amendments referenced but not provided.
6. Produce the compliance matrix, risk flags, and summary in the formats below.

## Compliance Matrix Format

| Requirement ID | Source cite | Requirement as stated | Proposal section | Status | Risk note |
|---|---|---|---|---|---|
| `L-1` / `M-1` / `SOW-1` | Section L, M, or SOW reference | Requirement language as written, condensed only where verbatim text is impractical | Volume and section that addresses it, or `None found` | Addressed / Partial / Missing | One-line basis or gap statement |

Follow the matrix with the evaluation-factor coverage view: one table per Section M factor listing its subfactors, the matrix rows that map to each, and any subfactor with no mapped proposal content.

## Risk Flags

List, each with its citation:

- Page-limit, format, and submission-instruction risks, stated factually.
- `Unsupported claim` rows with the substantiation the operator would need to supply.
- Amendment gaps.

## Summary and Next Actions

Close the review with:

- Requirement counts by status (Addressed / Partial / Missing) and the count of unsupported claims.
- The highest-exposure gaps, identified by requirement ID.
- Sections or volumes not reviewed and why.
- A short ordered list of next actions for the operator, starting with Missing rows against Section L instructions.

## Boundaries

- Do not make bid or no-bid recommendations, score the proposal against evaluation factors, or predict how the agency would evaluate it.
- Do not certify the accuracy of any proposal claim or representation; unsupported claims are flags for operator substantiation.
- Do not submit, upload, or transmit the proposal, the matrix, or any volume to an agency portal, contracting officer, or any external party or system; the matrix is a work product pending operator approval.
