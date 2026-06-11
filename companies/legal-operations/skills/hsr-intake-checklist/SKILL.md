---
name: hsr-intake-checklist
description: Organize transaction facts into structured HSR intake tables when an HSR intake matter arrives, producing size-of-transaction, size-of-person, and exemption-candidate tables with the reportability determination flagged to counsel.
metadata:
  sources:
    - path: companies/legal-operations/skills/hsr-intake-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# HSR Intake Checklist

Use this skill to organize operator-supplied transaction facts into structured intake tables for HSR analysis. The output is mechanical organization of facts with gaps flagged; the reportability and filing-obligation determination always belongs to the operator or responsible antitrust counsel.

## Intake Steps

1. Scope intake. Record the parties (acquiring and acquired sides and their ultimate parents as supplied), the transaction structure (asset, voting-securities, or non-corporate-interest acquisition as described), the consideration and its components, the expected signing and closing timeline, and the source documents available. If the parties, structure, or consideration are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the size-of-transaction table. Record one row per input — cash consideration, stock or interest consideration, assumed liabilities, contingent or deferred consideration, prior holdings of the acquired person's securities or interests, and the valuation method described — with the value exactly as supplied, the source cited, and gaps marked. Record aggregation questions (what combines with what, and how holdings are valued) as open rows; do not resolve them.
3. Build the size-of-person table. Record one row per relevant entity with its total assets and annual net sales as stated in the most recent regularly prepared financial statements supplied, the financial-statement source and date, and gaps marked. Do not estimate, interpolate, or net figures the operator has not supplied.
4. Record threshold placeholders. Never state current HSR dollar thresholds as settled; they adjust annually. Record operator-supplied threshold values verbatim, or `[CURRENT HSR THRESHOLDS — OPERATOR TO CONFIRM]`, and route the comparison of facts to thresholds to the operator or responsible antitrust counsel.
5. List exemption candidates. Record one row per exemption candidate the supplied facts suggest, with the facts supporting candidacy, the facts still missing, and status `Candidate — counsel determination required`. Candidacy is recorded, never concluded.
6. Close with the determination flag in the format below.

## Output Format

Size-of-transaction table:

| Input | Value as supplied | Source | Gaps / open questions |
|---|---|---|---|

Size-of-person table:

| Entity | Total assets | Annual net sales | Financial-statement source and date | Gaps |
|---|---|---|---|---|

Exemption-candidate table:

| Exemption candidate | Facts supporting | Facts missing | Status |
|---|---|---|---|

Close with a determination flag block stating that the reportability and filing-obligation determination is routed to the operator or responsible antitrust counsel, followed by the list of open questions and gaps.

## Boundaries

- Do not conclude that a transaction is or is not reportable, and do not advise on filing timing or waiting periods; organize the inputs and flag the determination.
- Do not state current HSR thresholds, estimate missing values, or net figures the operator has not supplied; a gap is a flagged row, not a guess.
- Do not file, submit, send, or transmit anything to an agency or any external party or system; the tables are work products pending operator approval.
