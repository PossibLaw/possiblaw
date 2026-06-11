---
name: dpia-checklist
description: Assess a data-processing activity when a DPIA matter arrives, producing a processing description, necessity and proportionality findings, a rated risk table with proposed mitigations, and residual-risk flags for operator decision.
metadata:
  sources:
    - path: companies/legal-operations/skills/dpia-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# DPIA Checklist

Use this skill to draft a data-protection impact assessment as structured findings the operator or responsible privacy counsel can act on row by row. Work adversarially: test every stated purpose and minimization claim against the facts in the issue, and record contradictions as findings. The assessment informs a decision; it never is one.

## Assessment Steps

1. Scope intake. Record the processing activity under assessment, the data categories and data subjects involved, the systems and vendors named, the stated purposes, and any aspects the operator excluded. If the processing activity, data categories, or assessment scope is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Describe the processing. Complete one row per field, with `[NOT PROVIDED]` marking gaps: nature of the processing, scope (data categories, volume, frequency), data subjects, sources of the data, recipients and disclosures, retention as stated, storage locations and transfers as stated, and the technologies involved.
3. Test necessity and proportionality. For each stated purpose, examine whether the data collected is needed for that purpose as the facts describe it, whether the issue identifies a less-intrusive alternative, and whether minimization, accuracy, and retention claims match the described processing. Do not accept stated purposes or minimization claims at face value; record each tension or contradiction as a finding.
4. Identify risks to data subjects. List each risk the described processing creates — for example unauthorized access, function creep, inaccurate decisions about individuals, re-identification, chilling effects — and rate each for likelihood and severity (`High`, `Medium`, or `Low`) with a one-line rationale. Do not leave a risk unrated.
5. Propose mitigations. Pair every risk with a concrete proposed mitigation, or mark the row `[OPERATOR DECISION]` when the mitigation is a business choice.
6. State residual risk. For every risk row, state the residual risk after the proposed mitigation (`High`, `Medium`, or `Low`). Flag every `High` residual-risk row to the operator or responsible privacy counsel in the summary.
7. Produce the summary in the format below.

## Output: Processing Description Table

| Field | As stated | Source |
|---|---|---|

One row per step 2 field.

## Output: Necessity and Proportionality Findings Table

| Purpose or claim | Finding | Basis |
|---|---|---|
| [stated purpose or minimization claim] | Supported / Tension / Contradiction | One- or two-sentence basis citing the issue facts |

## Output: Risk Table

| Risk to data subjects | Likelihood | Severity | Proposed mitigation | Residual risk |
|---|---|---|---|---|

## Output: Summary

- Finding counts by rating and the count of `High` residual-risk flags, each `High` flag restated for the operator or responsible privacy counsel.
- Whether a formal DPIA or a supervisory-authority consultation is legally required is jurisdiction-dependent; state the dependency and route the determination to the operator or responsible attorney.
- Open gaps and processing aspects not assessed, with why.
- An ordered next-action list starting with `High` residual risks.

## Boundaries

- Do not assert compliance or non-compliance with any privacy regime, predict how a regulator would treat the processing, or resolve jurisdiction-specific questions.
- Do not approve, reject, or greenlight the processing activity; every determination belongs to the operator or responsible counsel.
- Do not transmit the assessment to any external party or system; it is a work product pending operator decision.
