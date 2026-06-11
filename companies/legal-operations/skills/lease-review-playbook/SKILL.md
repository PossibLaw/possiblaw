---
name: lease-review-playbook
description: Review a commercial lease clause by clause from the tenant or landlord side when a lease-review matter arrives, producing risk-rated findings with suggested rewrites and jurisdiction flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/lease-review-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Lease Review Playbook

Use this skill to run a structured, clause-by-clause review of a commercial lease from the side the issue specifies — tenant or landlord. The output is a findings table the operator or responsible attorney can act on row by row, with rewrites proposed from the instructed side's position.

## Review Steps

1. Scope and side intake. Record the lease under review, the instructed side, the jurisdiction as stated, the amendments and exhibits supplied, and any sections the operator excluded. If the lease or the side instruction is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing; the review posture depends on the side.
2. Build the clause inventory. Locate and list each of the following, noting any that are absent:
   - Premises, measurement, and delivery condition
   - Term, commencement mechanics, and early-access provisions
   - Base rent, escalations, and abatements
   - Additional rent — operating-expense or CAM definition, caps, exclusions, gross-up, and audit rights
   - Security deposit and any guaranty
   - Permitted use, exclusives, and co-tenancy
   - Assignment and subletting — consent standard, permitted transfers, recapture, and profit sharing
   - Maintenance and repair allocation
   - Alterations and end-of-term restoration
   - Insurance requirements and waiver of subrogation
   - Casualty and condemnation — restoration obligations, abatement, and termination rights
   - Default, remedies, cure periods, and late charges
   - Holdover
   - Subordination, non-disturbance, and attornment; estoppel obligations
   - Notices
   - Renewal, expansion, and early-termination options with their exercise mechanics
3. Rate each clause from the instructed side's posture. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: the clause shifts a major cost or risk to the instructed side without limits, is internally contradictory, or strips a protection that side would ordinarily keep.
   - `Medium`: ambiguous, materially off market-standard positions for that side, or missing the mechanics needed to operate the clause.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Check silences. Mark each standard clause the lease lacks with a `[NOT FOUND]` row and state which party the silence favors.
5. Flag jurisdiction dependence. Where the effect of a clause turns on jurisdiction — security-deposit limits, consent and reasonableness standards, holdover treatment, self-help and remedies rules — state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible attorney. Do not resolve jurisdiction-specific questions in the findings.
6. Mark economic and business choices — rent levels, deposit size, option pricing — as `[OPERATOR DECISION]` rather than recommending a number.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Clause | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Clause name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language from the instructed side's position, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append `Jurisdiction flag` and `[NOT FOUND]` items as their own rows with the label noted in the Issue column.

## Summary and Next Actions

Close the review with:

- A scope note restating the lease reviewed, the side taken, and the jurisdiction as stated.
- Finding counts by risk level and the count of jurisdiction flags.
- Missing clauses from the inventory and which party each absence favors.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not opine on how a court would rule, predict enforceability as settled, or give jurisdiction-specific advice as resolved; flag and route those determinations.
- Do not make business decisions about lease economics; mark them `[OPERATOR DECISION]`.
- Do not rewrite or redline the source lease directly; deliver findings and suggested rewrites for operator decision.
- Do not transmit the lease or the review to any external party or system — including the counterparty, brokers, or their counsel; the review is a work product pending operator approval.
