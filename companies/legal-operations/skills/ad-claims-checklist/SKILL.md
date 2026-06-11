---
name: ad-claims-checklist
description: Review advertising copy claim by claim when an ad-claims matter arrives, producing risk-rated findings on substantiation, comparative and pricing claims, and disclaimer adequacy.
metadata:
  sources:
    - path: companies/legal-operations/skills/ad-claims-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Ad Claims Checklist

Use this skill to run a structured, claim-by-claim review of advertising copy or a campaign. The output is a findings table the operator or responsible counsel can act on row by row; clearance decisions belong to the operator or responsible counsel, never to this review.

## Review Steps

1. Scope intake. Record the copy or campaign under review, the product or service advertised, the media and platforms, the substantiation supplied, the target audience, and any sections the operator excluded. If the copy is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the claim inventory. List every claim, typed as follows, noting any category with no entries:
   - Express claims, quoted verbatim from the copy
   - Implied claims — what a reasonable consumer would take from the copy, imagery, and context, labeled as implied with the basis stated
   - Comparative claims naming or referencing competitors or "leading" alternatives
   - Pricing claims — discounts, former-price references, "free" offers, price-match promises
   - Health, safety, environmental, or performance claims, noted for heightened operator attention
   - Endorsements or testimonials appearing in the copy, with their disclosures noted
   - Puffery candidates — record the puffery characterization as a finding for operator confirmation rather than excluding the claim
3. Check substantiation. Match each claim to the support identified in the issue; record every claim with no support on file as a substantiation gap with its own row. Do not assess the scientific or technical quality of substantiation; record what exists and flag adequacy questions to the operator.
4. Assess disclaimers. For each disclaimer, evaluate proximity to the claim it qualifies, prominence (size, contrast, duration, placement), and clarity; flag any disclaimer that contradicts rather than qualifies the main claim.
5. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: a material claim with no substantiation on file, a misleading pricing claim, or a disclaimer that contradicts the main claim.
   - `Medium`: an ambiguous claim, partial substantiation, or a disclaimer with proximity, prominence, or clarity problems.
   - `Low`: stylistic, minor clarity, or completeness issues.
6. Flag regime dependence. Where adequacy turns on a legal regime — sector-specific advertising rules, jurisdiction-specific pricing rules, special substantiation expectations — state the dependency, mark it `Operator flag`, and route the determination to the operator or responsible counsel. Do not resolve it in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Claim | Type | Risk | Issue | Suggested action |
|---|---|---|---|---|
| Claim text or short reference | Express / Implied / Comparative / Pricing / Puffery candidate | High / Medium / Low | One- or two-sentence issue statement with rationale | Substantiation to obtain, alternative copy, a disclaimer fix, or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific suggested action. Append operator flags as their own rows with `Operator flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of operator flags.
- Substantiation gaps and the claims they affect.
- Claims or sections not assessable and why.
- A short ordered list of next actions for the operator, starting with `High` findings, and a closing statement that the clearance decision belongs to the operator or responsible counsel.

## Boundaries

- Do not clear, approve, or greenlight copy for publication; deliver findings for operator decision.
- Do not assert that a claim satisfies any advertising statute or rule, predict how a regulator would treat it, or give jurisdiction-specific advice as settled.
- Do not research the product, competitors, or the market externally; work only from the copy, claims, and substantiation supplied in the issue.
- Do not transmit the copy or the review to any external party or system; the review is a work product pending operator approval.
