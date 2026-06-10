---
name: employment-policy-review-checklist
description: Review employee handbooks, workplace policies, and restrictive covenants clause by clause when a policy-review matter arrives, producing risk-rated findings with suggested rewrites and jurisdiction flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/employment-policy-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Employment Policy Review Checklist

Use this skill to run a structured, clause-by-clause review of an employee handbook, a standalone workplace policy, or a restrictive covenant. The output is a findings table the operator or responsible attorney can act on row by row.

## Review Steps

1. Scope intake. Record the document under review, its stated audience, the jurisdictions where it will apply, the employer's stated goals, and any sections the operator excluded. If the document or jurisdiction list is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - At-will or employment-relationship statement
   - EEO and anti-harassment provisions
   - Leave policies (sick, family, vacation, other statutory leave)
   - Wage-and-hour provisions (overtime, breaks, timekeeping, classification language)
   - Remote-work and work-location rules
   - IT, equipment, and monitoring policies
   - Discipline and termination procedures
   - Arbitration or dispute-resolution clauses
   - Restrictive covenants (non-compete, non-solicit, confidentiality)
3. Rate each clause. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: likely unenforceable, internally contradictory, or exposes the employer to a concrete compliance gap.
   - `Medium`: ambiguous, outdated, or materially off market-standard positions.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Flag jurisdiction dependence. Where enforceability or compliance turns on jurisdiction — for example, non-compete enforceability varies widely and California broadly restricts post-employment non-competes — state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible attorney. Do not resolve jurisdiction-specific questions in the findings.
5. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Clause name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append jurisdiction flags as their own rows with `Jurisdiction flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of jurisdiction flags.
- Missing clauses from the inventory and whether each should be added.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not give jurisdiction-specific legal advice or predict how a court would rule.
- Do not rewrite the source document directly; deliver findings and suggested rewrites for operator decision.
- Do not transmit the document or the review to any external party or system; the review is a work product pending operator approval.
