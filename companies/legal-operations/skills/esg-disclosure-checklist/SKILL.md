---
name: esg-disclosure-checklist
description: Review ESG and sustainability claims claim by claim when a disclosure-review matter arrives, producing risk-rated findings on substantiation gaps, internal inconsistency, and greenwashing risk with regulatory flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/esg-disclosure-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# ESG Disclosure Checklist

Use this skill to run a structured, claim-by-claim review of ESG and sustainability claims and disclosures — sustainability reports, website copy, marketing materials, investor disclosures, and product claims. The output is a findings table the operator or responsible attorney can act on row by row. The review rates substantiation and consistency; it certifies nothing and predicts no regulatory outcome.

## Review Steps

1. Scope intake. Record the documents under review, where each is or will be published, the stated audience, the jurisdictions where the claims will appear, any disclosure framework the company states it follows, and any sections the operator excluded. If the documents under review or the review scope are absent and no acceptable default applies, gate with `missing-info-gate`.
2. Build the claim inventory. Work claim by claim through the documents, capturing each ESG or sustainability claim with its location. Include aspirational statements, targets and commitments, comparative and superlative claims (for example "carbon neutral", "100% recycled", "industry-leading"), certifications and labels cited, and claims in footnotes and marketing copy; do not skip a claim because it appears immaterial.
3. Run the substantiation check. For each claim, record the support cited in the documents supplied — data, methodology, third-party verification, or certification. Mark claims with no cited evidence `[NO SUBSTANTIATION CITED]` rather than assuming support exists elsewhere. Note where the cited support does not match the claim's scope (for example a facility-level figure supporting a company-wide claim).
4. Run the consistency check. Compare claims against each other and against the data supplied. Record internal contradictions verbatim with cites to both statements; do not resolve which statement is correct.
5. Rate each finding. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: an unqualified claim with no cited substantiation, a claim contradicted by supplied data, or an expired or misdescribed certification.
   - `Medium`: a claim with partial or scope-mismatched substantiation, an undated or stale figure, or an aspirational target presented as achieved.
   - `Low`: vague but qualified language, stylistic imprecision, or minor completeness issues.
6. Flag regime-dependent items. Green-claim rules and ESG disclosure obligations vary by jurisdiction and framework. Where a finding turns on which regime applies, state the dependency, mark the row `Regulatory flag`, and route the determination to the operator or responsible attorney; do not resolve it.
7. Pair every `High` and `Medium` finding with a specific suggested action — substantiation to obtain, language to qualify, or `[OPERATOR DECISION]` where the fix is a business choice.
8. Produce the findings table, consistency log, and summary in the formats below.

## Findings Table Format

| Claim | Location | Risk | Issue | Suggested action |
|---|---|---|---|---|
| Claim quoted or closely paraphrased | Document and section or page | High / Medium / Low | One- or two-sentence issue with rationale; include `[NO SUBSTANTIATION CITED]` or `Regulatory flag` where applicable | Substantiation to obtain, qualifying language, or `[OPERATOR DECISION]` |

Regulatory flags appear as their own rows with the regime dependency stated in the Issue column.

## Consistency Log

List each contradiction between claims, or between a claim and supplied data, quoted verbatim with cites to both locations. Record the conflict only; resolution is an operator decision.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of regulatory flags.
- Claims with no cited substantiation, listed together.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not predict how a regulator or court would treat any claim, certify compliance with any disclosure framework, or give jurisdiction-specific advice as settled.
- Do not rewrite the source document; deliver findings and suggested actions for operator decision.
- Do not transmit the review or the underlying documents to any external party or system; the review is a work product pending operator approval.
