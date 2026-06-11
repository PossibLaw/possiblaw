---
name: sanctions-screening-checklist
description: Organize party-screening intake when a sanctions-screening matter arrives, producing party, ownership-chain, and potential-match tables with every potential match flagged and the clearance decision routed to the operator.
metadata:
  sources:
    - path: companies/legal-operations/skills/sanctions-screening-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Sanctions Screening Checklist

Use this skill to organize the parties to a transaction or relationship into structured screening tables with every potential match flagged. The output is mechanical organization and flagging; this skill never clears a party against any government list, and every potential match and every clearance decision belongs to the operator or responsible counsel.

## Screening Intake Steps

1. Scope intake. Record the transaction or relationship context, the parties to screen, any screening lists or screening results the operator supplied, and the operator-specified ownership threshold for aggregation flags. If the parties to screen or their identifying details are absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the party intake table. Record one row per party with the full legal name, aliases and former names, addresses, registration or identification numbers, jurisdictions of organization and operation, and role in the transaction, exactly as supplied, with the source cited per row. Mark absent identifiers `[NOT STATED]`; never infer an identifier.
3. Build the ownership-chain table. Trace each party's ownership as far as the supplied facts allow, recording one row per ownership link with the owner, the owned entity, the percentage verbatim, the source, and the verification status. Mark every unverified link `[OWNERSHIP UNVERIFIED]`. Flag aggregate ownership by listed or flagged parties at or above the operator-specified threshold as its own row; the significance of any ownership level is a determination for the operator or responsible counsel.
4. Build the potential-match table. Record one row per name similarity, alias overlap, jurisdiction connection, or ownership link to a flagged party, with the basis for the potential match stated and the list or source exactly as supplied. Set every row's status to `Flagged — counsel determination required`. Never dismiss a potential match as a false positive, and never assert that any list does or does not contain a party; record only screening results the operator or supplied materials provide.
5. Close with the flag summary in the format below.

## Output Format

Party intake table:

| Party | Aliases / former names | Identifiers | Jurisdictions | Role | Source |
|---|---|---|---|---|---|

Ownership-chain table:

| Owner | Owned entity | Percentage as supplied | Source | Verification status |
|---|---|---|---|---|

Potential-match table:

| Party | Basis for potential match | List or source as supplied | Status |
|---|---|---|---|

Close with a flag summary: the count of parties screened, potential matches flagged, and unverified ownership links, followed by a statement that the clearance decision is routed to the operator or responsible counsel. If there are no potential matches, state that no potential matches were identified in the supplied materials — not that any party is clear.

## Boundaries

- Never clear a party, mark a party safe to transact with, or adjudicate a potential match; the output is flags plus organized facts, nothing more.
- Do not assert what any government list contains, and do not advise on license requirements, blocking obligations, or transaction structuring; route those questions to the operator or responsible counsel.
- Do not send, submit, file, or transmit screening results to any external party or system; the tables are work products pending operator approval.
