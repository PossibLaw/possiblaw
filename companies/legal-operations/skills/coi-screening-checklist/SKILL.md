---
name: coi-screening-checklist
description: Screen conflict-of-interest disclosures and proposed arrangements item by item when a COI screening matter arrives, producing a flag-only findings table with rated flags, suggested mitigations marked for operator decision, and policy-dependency follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/coi-screening-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Conflict of Interest Screening Checklist

Use this skill to review a conflict-of-interest disclosure or a proposed arrangement item by item and produce flag-only findings the operator can act on row by row. Every flag carries a rating and a suggested mitigation; every determination — whether a conflict exists, is waived, or is permissible — belongs to the operator.

## Screening Steps

1. Scope intake. Record the disclosure or proposed arrangement under review, the person and their role and decision authority as stated, the internal policy documents supplied, and any items the operator excluded. If the disclosure, the proposed arrangement, or the person's role is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the interest inventory. List every disclosed item or arrangement element, noting any expected categories that are absent; do not skip small gifts or routine-looking positions because they appear immaterial:
   - Board seats and advisory positions.
   - Outside employment and consulting positions.
   - Financial interests and investments, as disclosed.
   - Gifts and entertainment, with stated values.
   - Related-party transactions.
   - Family or household relationships connected to the disclosed items.
   - Any other disclosed interest.
3. Rate each flag. Assign `High`, `Medium`, or `Low` with a one-line rationale:
   - `High`: the disclosed interest sits directly opposite the person's stated duties or decision authority, or the arrangement as described involves self-dealing facts.
   - `Medium`: the interest could conflict depending on facts not in the disclosure, a policy threshold, or a future decision the person may touch.
   - `Low`: appearance-level or minor items with no stated connection to the person's duties.
4. Suggest mitigations. Pair every `High` and `Medium` flag with at least one suggested mitigation — recusal, disclosure to a named approver, independent review, value limits, or restructuring — each marked `[OPERATOR DECISION]`.
5. Flag policy dependencies. Where the outcome turns on an internal policy threshold, a fiduciary-duty question, or a jurisdiction-specific rule, state the dependency as an operator follow-up; never present a jurisdiction-specific answer as settled.
6. Produce the findings table and summary in the format below.

## Output: Findings Table

| Item | Flag | Issue | Suggested mitigation |
|---|---|---|---|
| Disclosed item or arrangement element | High / Medium / Low | One- or two-sentence issue statement with rationale | Suggested mitigation marked `[OPERATOR DECISION]`, or `None suggested` for `Low` flags |

One row per disclosed item or arrangement element.

## Output: Policy and Follow-Up Flags

- Each policy threshold, missing policy document, or jurisdiction dependency, framed as an operator follow-up with what is needed to resolve it.

## Output: Summary

- Flag counts by rating.
- Items not reviewed and why.
- An ordered list of next operator actions starting with `High` flags.

## Boundaries

- Findings are flag-only: do not determine that a conflict exists, is waived, or is permissible, and do not predict how a regulator, court, or board would treat an arrangement.
- Do not transmit the disclosure, the findings, or any notice to an external party or system; the findings are a work product pending operator decision.
- Do not resolve internal-policy thresholds or jurisdiction-specific rules; state each dependency and route it to the operator or responsible attorney.
