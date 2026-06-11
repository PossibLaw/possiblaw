---
name: ai-vendor-assessment-checklist
description: Review AI vendor terms and documentation provision by provision when a vendor assessment matter arrives, producing risk-rated findings with suggested actions and operator flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/ai-vendor-assessment-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# AI Vendor Assessment Checklist

Use this skill to run a structured, provision-by-provision review of an AI vendor's terms and documentation. The output is a findings table the operator or responsible attorney can act on row by row; it informs a vendor decision but never makes one.

## Review Steps

1. Scope intake. Record the vendor, the documents supplied (terms of service, data processing terms, security documentation, order forms, model documentation), the intended use case, the data the organization would input, and any sections the operator excluded. If the documents, the use case, or the input-data description is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the provision inventory. Locate and list each of the following, noting any that are absent:
   - Training-data usage rights: whether the vendor may use inputs or outputs to train or improve models, and any opt-out mechanics
   - Output ownership and license terms
   - Input confidentiality and limits on the vendor's use of customer data
   - Model-version and update commitments: version pinning, change notice, deprecation terms
   - Data retention and deletion commitments
   - Indemnities, including any IP-infringement indemnity covering outputs
   - Audit and security-review rights
   - Subprocessors and downstream model or hosting providers
   - Liability caps and exclusions as they apply to the provisions above
3. Rate each provision. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: the vendor may train on customer inputs without restriction, a critical commitment is absent, or a term contradicts the intended use case.
   - `Medium`: ambiguous, materially off market-standard positions, or a commitment exists but lacks notice or remedy terms.
   - `Low`: stylistic, minor clarity, or completeness issues.
4. Record absent commitments as findings. A missing training-data restriction, output-ownership term, or model-change notice obligation is a gap with its own row, not a pass.
5. Flag determination-dependent items. Where an assessment turns on a legal determination — for example whether the use case falls under an AI-specific statute or sector rule — state the dependency, mark it `Operator flag`, and route the determination to the operator or responsible attorney. Do not resolve it in the findings.
6. Produce the findings table and summary in the format below.

## Findings Table Format

| Provision | Risk | Issue | Suggested action |
|---|---|---|---|
| Provision name and document reference | High / Medium / Low | One- or two-sentence issue statement with rationale | A question for the vendor, proposed alternative language, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested action. Append operator flags as their own rows with `Operator flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of operator flags.
- Absent provisions from the inventory and why each matters for the intended use.
- Documents not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not approve, reject, or recommend the vendor; the assessment informs an operator decision.
- Do not assert that the vendor's terms satisfy any law or regulation or predict how a regulator would treat them.
- Do not research, contact, or look up the vendor externally; work only from the documents and facts supplied in the issue.
- Do not transmit the review to the vendor or any external party or system; the review is a work product pending operator approval.
