---
name: cba-review-checklist
description: Review a collective bargaining agreement clause by clause when a CBA review matter arrives, producing risk-rated findings with cross-reference flags against employer policies.
metadata:
  sources:
    - path: companies/legal-operations/skills/cba-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# CBA Review Checklist

Use this skill to run a structured, clause-by-clause review of a collective bargaining agreement. The output is a risk-rated findings table with cross-reference flags against the employer's policies, for the operator or responsible counsel to act on row by row. The review never opines on enforceability or predicts how an arbitrator, labor board, or court would rule.

## Review Steps

1. Scope intake. Record the agreement under review (parties, bargaining unit, effective and expiration dates), any side letters, memoranda of understanding, or appendices supplied, the employer policies supplied for cross-reference, and any sections the operator excluded. If the agreement is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - Recognition and bargaining-unit scope
   - Management-rights clause
   - Union security and dues checkoff
   - Wages, hours, overtime, and premium-pay provisions
   - Seniority (accrual, layoff and recall, job bidding, loss of seniority)
   - Discipline and discharge standards (including any just-cause language)
   - Grievance and arbitration procedure (steps, deadlines, arbitrator selection, remedies)
   - No-strike and no-lockout clauses
   - Zipper clause and past-practice provisions
   - Leaves and benefits provisions
   - Safety provisions
   - Duration, reopeners, and successorship
3. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: internally contradictory terms, a grievance or arbitration procedure with missing or inconsistent deadlines, or a concrete conflict with a supplied employer policy.
   - `Medium`: ambiguous, outdated, or materially off market-standard positions, or a policy overlap the documents do not resolve.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Run the policy cross-reference. Compare each inventoried clause against the employer policies supplied — handbook provisions, work rules, discipline procedures, attendance and leave policies. Where a CBA term and a policy appear to conflict or overlap, record a cross-reference flag citing both provisions; do not resolve which controls.
5. Check the timing provisions. Record grievance steps and deadlines, notice periods, probationary periods, and duration or reopener dates exactly as written, and flag any internally inconsistent timing as its own finding.
6. Flag legal dependence. Where a question turns on labor law, past practice, bargaining obligations, or enforceability, state the dependency, mark it `Counsel flag`, and route the determination to the operator or responsible counsel. Do not resolve those questions in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Cross-reference flag | Suggested operator action |
|---|---|---|---|---|
| Clause name and article or section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Conflicting or overlapping policy provision cited, or `None` | Concrete follow-up, or `[OPERATOR DECISION]` where the response is a business or bargaining choice |

Append `Counsel flag` rows as their own findings with the flag noted in the Issue column. Absent clauses from the inventory appear as their own rows with the absence stated as the issue.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the counts of cross-reference and counsel flags.
- Missing clauses from the inventory.
- Sections, appendices, or side letters not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not opine on whether any clause is enforceable or lawful, whether a subject is a mandatory or permissive bargaining subject, or how an arbitrator, labor board, or court would rule; route those questions to the operator or responsible counsel.
- Do not rewrite or redline the agreement, and do not give bargaining advice; deliver findings and flags for operator decision.
- Do not transmit the agreement or the review to any external party or system, including the union or any party to the agreement; the review is a work product pending operator approval.
