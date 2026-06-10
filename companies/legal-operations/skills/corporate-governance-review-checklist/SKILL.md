---
name: corporate-governance-review-checklist
description: Review board minutes, written consents, charters, bylaws, and other governance documents section by section when a governance-review matter arrives, producing risk-rated findings with proposed redlines and jurisdiction flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/corporate-governance-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Corporate Governance Review Checklist

Use this skill to run a structured, section-by-section review of board minutes, written consents, charters, bylaws, committee charters, or other governance documents. The output is a findings table the operator or responsible attorney can act on row by row.

## Review Steps

1. Scope intake. Record the document under review, the entity and its jurisdiction of formation, the acting body (board, committee, stockholders, members, managers), the charter and bylaws supplied for cross-checking, and any sections the operator excluded. If the document is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the section inventory. Locate and list each of the following, noting any that are absent:
   - Title and instrument identification (meeting minutes, written consent, charter, bylaws, committee charter)
   - Authority recital — the body acting and the source of its authority
   - Quorum and voting recital (for meetings) or consent standard (for written consents)
   - Recitals and background facts
   - Operative provisions or resolved clauses
   - Conflicts and interested-party disclosures
   - Delegations and authorizations, including officer authority and dollar or scope limits
   - Effective date and term
   - Signature blocks with names, titles, and dates
   - Record-keeping and filing-with-minute-book direction
3. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: missing or defective authority, quorum, or consent recitals; operative language that does not accomplish the stated action; internal contradictions with the charter or bylaws supplied.
   - `Medium`: ambiguous delegations, undated or unattributed signatures, recitals that assume facts not in the record, or materially off market-standard positions.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Cross-check authority and quorum. When the charter and bylaws are provided, verify the recited authority, quorum, and consent standard against them and cite the governing section. When they are not provided, record the consistency check as an open operator follow-up; never assume the documents align.
5. Flag jurisdiction dependence. Where validity turns on jurisdiction — written-consent standards, interested-director procedures, indemnification limits, and ratification rules vary by jurisdiction of formation — state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible attorney. Do not resolve jurisdiction-specific questions in the findings.
6. Produce the findings table and summary in the format below.

## Findings Table Format

| Section | Risk | Issue | Proposed redline |
|---|---|---|---|
| Section name and reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific proposed redline. Append jurisdiction flags as their own rows with `Jurisdiction flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of jurisdiction flags.
- Missing sections from the inventory and whether each should be added.
- Cross-checks that could not be completed (for example charter or bylaws not supplied) recorded as operator follow-ups.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not assert that a document complies with any jurisdiction's corporate law or that a corporate act was validly authorized.
- Do not rewrite the source document directly; deliver findings and proposed redlines for operator decision.
- Do not transmit the document or the review to any external party or system; the review is a work product pending operator approval.
