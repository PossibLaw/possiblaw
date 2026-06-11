---
name: export-control-checklist
description: Draft ECCN and USML classification rationales from operator-supplied product facts when an export-classification matter arrives, producing parameter-by-parameter candidate tables with every determination gated on counsel sign-off.
metadata:
  sources:
    - path: companies/legal-operations/skills/export-control-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Export Control Checklist

Use this skill to draft a classification rationale for an item under export-control candidate categories from operator-supplied product facts. The output is a draft rationale with every determination flagged; no classification is final without counsel sign-off, and export-control jurisdiction is never settled here.

## Classification Steps

1. Product-fact intake. Record the item's function, technical parameters and performance values, materials, design intent, technology origin, and any known end uses or end users, exactly as the supplied materials state them, with gaps marked. If the product description, technical parameters, or design-intent facts are absent and no acceptable default applies, gate with `missing-info-gate`; never infer a parameter or performance value the materials do not state.
2. Jurisdiction analysis. Record the facts pointing toward each candidate regulatory regime as open questions — design intent, specially designed indicators, technology origin, and prior classifications as supplied. Flag the jurisdiction question and route it to the operator or responsible counsel; do not settle which regime controls.
3. Candidate-category mapping. For each candidate ECCN or USML category, build one parameter-by-parameter table. Mark each control parameter `Within`, `Outside`, or `Unknown` against the supplied facts, citing the source per row. An `Unknown` row is an operator follow-up, not a judgment call.
4. License-exception candidates. Record each license exception or exemption the supplied facts suggest as a candidate only, with the facts supporting it and the facts still needed. Never state that an item needs no license.
5. Draft rationale and sign-off block. State the recommended candidate category with its reasoning, list the open facts and `Unknown` parameters, and close with `[COUNSEL SIGN-OFF REQUIRED]` routing the determination to the operator or responsible counsel. A rationale without that flag is incomplete.

## Output Format

Candidate-category table (one per candidate):

| Control parameter | Supplied fact | Within / Outside / Unknown | Source |
|---|---|---|---|

Follow the candidate tables with:

- Jurisdiction analysis — facts pointing toward each candidate regime, each stated as an open question routed to counsel.
- License-exception candidate table — `Candidate | Facts supporting | Facts missing | Status`, with every status `Candidate — counsel determination required`.
- Draft rationale and sign-off block — the recommended candidate, the reasoning, the open facts, and `[COUNSEL SIGN-OFF REQUIRED]`.

## Boundaries

- Do not authorize, approve, or green-light any export, reexport, or transfer, and do not state that an item needs no license; those are determinations for the operator or responsible counsel.
- Do not present a classification or a jurisdiction conclusion as final or settled; every rationale is a draft pending counsel sign-off.
- Do not infer technical parameters, performance values, or design intent the materials do not state; a gap is an `Unknown` row and an operator follow-up.
- Do not submit, file, send, or transmit anything to a government system or any external party; the rationale is a work product pending operator approval.
