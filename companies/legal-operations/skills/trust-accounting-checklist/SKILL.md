---
name: trust-accounting-checklist
description: Review a client trust or IOLTA three-way reconciliation when a trust-accounting matter arrives, producing a discrepancy findings table that flags mismatches, stale balances, and negative client ledgers for immediate operator escalation.
metadata:
  sources:
    - path: companies/legal-operations/skills/trust-accounting-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Trust Accounting Reconciliation Checklist

Use this skill to review a client trust or IOLTA three-way reconciliation. The three legs are the adjusted bank balance, the book (journal) balance, and the sum of individual client ledger balances. The output is a findings table that flags discrepancies for the operator. The review flags only; it never moves funds, adjusts ledgers, or records accounting entries.

## Review Steps

1. Scope intake. Record the reconciliation date and period, the trust account identifier as supplied, the bank statement balance, the listed outstanding deposits and checks, the book balance, and the individual client ledger balances. If the reconciliation materials are absent entirely and no acceptable default applies, gate with `missing-info-gate`. If one leg of the three-way reconciliation is missing, record it as a `High` finding rather than gating — an incomplete three-way reconciliation is itself a reportable condition.
2. Three-way tie-out. Compute the adjusted bank balance (statement balance plus deposits in transit minus outstanding checks) and compare it to the book balance and to the sum of client ledger balances. Record each leg and every difference to the cent. Any non-zero difference is a `High` finding.
3. Client ledger pass. Flag:
   - Negative client ledger balances — always `High`; a client ledger should never be negative.
   - Disbursements that exceed the client's ledger balance on the disbursement date, where the records show it.
   - Stale balances with no activity for longer than the operator's stated threshold, or six months when no threshold is supplied.
   - Funds not identified to a client or matter.
4. Transaction hygiene pass. Flag outstanding checks aged beyond ninety days, deposits in transit that have not cleared by the next statement, entries without a client or matter reference, and earned fees that appear to remain in the trust account.
5. Produce the findings table and escalation summary in the format below. Any three-way mismatch or negative ledger requires immediate operator escalation in the completion comment, not just a table row.

## Findings Table Format

| Item | Category | Severity | Finding | Operator action |
|---|---|---|---|---|
| Ledger, transaction, or reconciliation leg with date and reference | Three-way mismatch / Negative ledger / Stale balance / Unidentified funds / Transaction hygiene | High / Medium / Low | Factual statement of the discrepancy with exact amounts | The confirmation, correction, or investigation the operator should perform |

## Summary and Escalation

Close the review with:

- The three reconciliation legs and whether they tie, with exact differences.
- Finding counts by category and severity.
- An explicit escalation line when any `High` finding exists: the operator must review before any further trust activity is recorded.
- Records or periods not reviewed and why.

## Boundaries

- Do not move, transfer, or disburse funds, and do not adjust, correct, or post any ledger or book entry.
- Do not conclude that misappropriation, conversion, or a rule violation occurred; report the factual indicators and route the determination to the operator or responsible attorney.
- Do not compute or assert final financial liability; organize the figures and flag the gaps.
- Do not transmit reconciliation records or the review to any external party or system; the review is a work product pending operator approval.
