---
name: far-flowdown-checklist
description: Review a prime contract and subcontract pair for FAR and DFARS flowdown clauses when a flowdown-analysis matter arrives, producing a clause-by-clause presence table with risk notes and operator-determination flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/far-flowdown-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# FAR Flowdown Checklist

Use this skill to run a structured flowdown review of a subcontract against its prime contract. The output is a clause-by-clause table the operator or responsible counsel can act on row by row. The review identifies presence and gaps; it never certifies that any contract or party complies with any regulation.

## Review Steps

1. Scope intake. Record the prime contract, the subcontract, the subcontract tier, the contract type, stated dollar values, any commercial-item or commercial-service designation, and any clauses the operator excluded. If the prime contract, the subcontract, or the contract-type facts needed for classification are absent and no acceptable default applies, gate with `missing-info-gate`.
2. Build the prime-clause inventory. List every FAR and DFARS clause the prime contract incorporates — full-text and incorporated-by-reference — citing where each clause appears. Cite clause numbers and titles exactly as the contract states them. Do not work from a generic clause list when the prime contract is available; when only a generic review is authorized, state that basis at the top of the output.
3. Classify each clause. Record each inventoried clause as a required flowdown, a recommended flowdown, or not applicable to the subcontract, with the basis for the classification. Where classification turns on contract type, dollar thresholds, commercial-status determinations, or the subcontract tier and the issue does not state those facts, record the classification as `[OPERATOR DETERMINATION]` with the dependency stated; do not resolve regulatory applicability.
4. Map each clause against the subcontract. Record each clause as present (with its location), present-but-modified (with the deviation described factually), or missing. Check both express clause citations and substantially equivalent language the subcontract states is intended to satisfy a flowdown.
5. Attach risk notes. Give every missing required clause and every modified clause a one-line risk note describing the gap factually — what obligation does not reach the subcontractor — without predicting agency or court treatment.
6. Produce the flowdown table, determination flags, and summary in the formats below.

## Flowdown Table Format

| Clause number and title | Flowdown classification | Subcontract status | Risk note |
|---|---|---|---|
| Number and title exactly as the prime contract states them, with the prime-contract cite | Required / Recommended / Not applicable / `[OPERATOR DETERMINATION]`, with the basis | Present (location) / Present-but-modified (deviation described) / Missing | One-line factual gap description, or `None` |

## Determination Flags

List every `[OPERATOR DETERMINATION]` row with the missing fact (contract type, threshold value, commercial status, or tier) and who can supply it — the operator or responsible counsel.

## Summary and Next Actions

Close the review with:

- Counts of missing required clauses, modified clauses, recommended clauses not present, and open determinations.
- Clauses inventoried but excluded from review and why.
- A short ordered list of next actions for the operator, starting with missing required clauses.

## Boundaries

- Do not certify compliance, draft or sign a certification, or state that a contract or party complies with any regulation; every compliance determination is flagged to the operator or responsible counsel.
- Do not predict how a contracting officer, agency, or court would treat an omission, and do not give jurisdiction-specific or agency-specific advice as settled.
- Do not transmit the analysis or any contract to a contracting officer, prime contractor, or any external party or system; the table is a work product pending operator approval.
