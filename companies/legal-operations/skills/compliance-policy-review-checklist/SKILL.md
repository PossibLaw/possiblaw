---
name: compliance-policy-review-checklist
description: Review internal compliance policies and procedures section by section when a compliance-review matter arrives, producing risk-rated findings with proposed redlines and regulator flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/compliance-policy-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Compliance Policy Review Checklist

Use this skill to run a structured, section-by-section review of an internal compliance policy or procedure — codes of conduct, AML/KYC procedures, recordkeeping policies, marketing-compliance procedures, gift and entertainment policies, or similar internal controls. The output is a findings table the operator or responsible attorney can act on row by row.

## Review Steps

1. Scope intake. Record the policy under review, the business areas and personnel it applies to, the regulators or regimes the operator says it addresses, the policy owner, and any sections the operator excluded. If the policy or its stated regime list is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the section inventory. Locate and list each of the following, noting any that are absent:
   - Purpose and scope statement, including who and what activities are covered
   - Applicability and exceptions, including how exceptions are requested and approved
   - Defined roles and responsibilities, including the policy owner and day-to-day decision-makers
   - Operative requirements and prohibitions, stated as testable obligations
   - Escalation paths — who is told what, when, and how
   - Training and attestation hooks — onboarding, periodic refresh, and acknowledgment tracking
   - Recordkeeping — what is retained, where, and for how long
   - Monitoring and testing provisions
   - Review cadence and amendment procedure, with the last-reviewed date
   - Version history and approval record
3. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: obligations that are untestable or contradictory, missing escalation paths for the conduct the policy regulates, or controls the policy promises but never defines.
   - `Medium`: ambiguous ownership, stale references to org structures or systems, missing training or recordkeeping hooks, or materially off market-standard positions.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Check internal consistency. Verify that the operative requirements, the escalation paths, and the roles named all refer to the same functions and that cross-referenced policies are identified; record unverifiable cross-references as operator follow-ups.
5. Flag regulator dependence. Where adequacy turns on a specific regulator's expectations or a specific regime's requirements, state the dependency, mark it `Regulator flag`, and route the determination to the operator or responsible attorney. Do not resolve regime-specific questions in the findings, and never assert that the policy satisfies any regulator's requirements.
6. Produce the findings table and summary in the format below.

## Findings Table Format

| Section | Risk | Issue | Proposed redline |
|---|---|---|---|
| Section name and reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific proposed redline. Append regulator flags as their own rows with `Regulator flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of regulator flags.
- Missing sections from the inventory and whether each should be added.
- Cross-references that could not be verified, recorded as operator follow-ups.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not assert that a policy complies with or satisfies any regulator's requirements or predict regulatory treatment.
- Do not rewrite the source policy directly; deliver findings and proposed redlines for operator decision.
- Do not transmit the policy or the review to any external party or system; the review is a work product pending operator approval.
