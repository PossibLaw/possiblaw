---
name: tariff-classification-checklist
description: Draft HTS classification rationales when a tariff-classification matter arrives, producing candidate-heading tables with interpretation-rule reasoning and a duty-exposure summary flagged for broker or counsel verification.
metadata:
  sources:
    - path: companies/legal-operations/skills/tariff-classification-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Tariff Classification Checklist

Use this skill to draft an HTS classification rationale and duty-exposure summary from operator-supplied product and origin facts. The output is a draft pending broker or counsel verification; no classification or duty figure is final, and nothing is filed with any customs authority.

## Classification Steps

1. Product-fact intake. Record the product description, materials and composition percentages, function, processing steps, country of origin, and declared value, exactly as supplied, with gaps marked. If the product description, material composition, or country-of-origin facts are absent and no acceptable default applies, gate with `missing-info-gate`; never invent composition percentages, processing steps, or origin facts.
2. Identify candidate headings. Reason through the General Rules of Interpretation in order and record which rule each candidate heading relies on; do not skip to a preferred heading. Record one row per candidate with its interpretation-rule basis and the supplied facts supporting it.
3. Analyze competing candidates. For each pair of plausible competitors, record the facts that distinguish them and which facts are still missing. A single-candidate rationale must state explicitly why no plausible competitor exists.
4. Build the duty-exposure summary. Record one row per duty component — base rate, additional-duty measures, and preference-program candidates — with each rate or amount exactly as supplied or as `[RATE — BROKER TO CONFIRM]`. Treat additional-duty measures and preference programs as candidates with eligibility facts, not conclusions. Show arithmetic only on supplied figures and flag the total for verification; never compute final duty liability as settled.
5. Close with the verification flag in the format below.

## Output Format

Candidate-heading table:

| Candidate heading | Interpretation-rule basis | Supporting facts | Distinguishing facts vs. competitors | Source |
|---|---|---|---|---|

Duty-exposure summary table:

| Duty component | Rate / amount as supplied | Basis | Status |
|---|---|---|---|

Close with a verification flag block routing the classification and duty determination to the operator's broker or responsible counsel, followed by the list of open facts and unconfirmed rates.

## Boundaries

- Do not file an entry, request a binding ruling, or submit anything to a customs authority, broker system, or any external party or system; if asked, the issue is blocked pending operator approval.
- Do not assert a current duty rate as settled, conclude preference-program eligibility, or compute final duty liability; organize the components, show the arithmetic on supplied figures, and flag the total.
- Do not invent composition percentages, processing steps, or origin facts; a gap is a flagged row and an operator follow-up.
- Do not present any classification as final; every rationale is a draft pending broker or counsel verification.
