---
name: competition-compliance-checklist
description: Review competitor-contact, pricing, MFN, and exclusivity policies provision by provision when a competition-policy review matter arrives, producing risk-rated findings with suggested rewrites and regulator flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/competition-compliance-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Competition Compliance Checklist

Use this skill to run a structured, provision-by-provision review of a competition-compliance policy, a commercial term with competition implications, or trade-association guidelines. The output is a findings table the operator or responsible antitrust counsel can act on row by row.

## Review Steps

1. Scope intake. Record the document under review, its stated audience, the markets and jurisdictions where it will apply, the business's stated goals, and any sections the operator excluded. If the document or the jurisdiction list is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the provision inventory. Locate and list each of the following, noting any that are absent:
   - Competitor-contact rules (meetings, communications, joint activities)
   - Information-exchange rules (pricing, costs, capacity, customers, strategy)
   - Pricing-communication and price-announcement provisions
   - MFN or most-favored-customer clauses
   - Exclusivity, sole-source, and non-compete commercial terms
   - Trade-association and standard-setting participation rules
   - Resale, distribution, and territory restrictions
   - Hiring, no-poach, and wage-information provisions
   - Escalation, training, and document-retention procedures
3. Rate each provision. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: permits or fails to prohibit conduct that creates a concrete competition-compliance gap, or contradicts another provision.
   - `Medium`: ambiguous, outdated, or materially off market-standard compliance positions.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Flag regulator dependence. Where the treatment of a practice turns on jurisdiction or enforcement posture — MFN clauses, exclusivity terms, and information-exchange practices vary by jurisdiction and enforcement climate — state the dependency, mark it `Regulator flag`, and route the determination to the operator or responsible antitrust counsel. Do not resolve jurisdiction-specific questions in the findings.
5. Produce the findings table and summary in the format below.

## Findings Table Format

| Provision | Risk | Issue | Suggested rewrite |
|---|---|---|---|
| Provision name and section reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested rewrite. Append regulator flags as their own rows with `Regulator flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of regulator flags.
- Missing provisions from the inventory and whether each should be added.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not label any practice lawful or unlawful, give jurisdiction-specific legal advice, or predict how a court or regulator would rule; rate the risk and route the determination.
- Do not rewrite the source document directly; deliver findings and suggested rewrites for operator decision.
- Do not transmit the document or the review to any external party or system; the review is a work product pending operator approval.
