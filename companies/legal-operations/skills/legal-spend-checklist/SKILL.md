---
name: legal-spend-checklist
description: Build legal-spend summaries and accrual tables when a spend-reporting matter arrives, producing by-matter, by-firm, by-practice-area, and budget-versus-actual tables with anomaly flags from only the data provided in the issue.
metadata:
  sources:
    - path: companies/legal-operations/skills/legal-spend-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Legal Spend Checklist

Use this skill to organize legal-spend data into summary and accrual tables with anomaly flags. Work only from the invoices, ledgers, budgets, and prior reports provided in the issue; never pull, estimate, or recall figures from outside the issue context. Every accrual is an estimate pending finance confirmation, and every total shows its arithmetic basis.

## Reporting Steps

1. Scope intake. Record the data sources provided, the reporting period, the budget figures supplied, any prior report on the issue, and known data gaps. If no spend data, reporting period, or budget figures are provided and no acceptable default applies, gate with `missing-info-gate`.
2. Build the spend register. Enter one row per invoice or ledger entry exactly as the source data states it — firm, matter, practice area, period, and amount — with a source cite for every value and `[NOT AVAILABLE]` marking gaps. The register is the basis every summary table sums from.
3. Build the summary tables from the register, each showing its arithmetic basis so the operator can verify sums against the source data:
   - By matter: total per matter for the period.
   - By firm: total per firm for the period.
   - By practice area: total per practice area for the period.
   - Budget versus actual: budget as supplied, actual from the register, and the difference, labeled as arithmetic on stated amounts.
   - Month over month: period totals side by side, using only the periods the data covers.
4. Build the accrual table. For work billed or described but not yet invoiced in the data provided, record an accrual estimate with its basis, labeling every figure an estimate from the data provided, pending finance confirmation; never present an accrual as a settled liability.
5. Flag anomalies as observations with the underlying register rows cited; do not characterize causes:
   - Spend spikes against prior periods in the data.
   - Matters over their supplied budgets.
   - Rate jumps for the same timekeeper or firm across invoices.
   - Gaps in the invoice sequence.
6. Compare against the last report recorded on the issue and call out what changed; on a first pass, state that the spend baseline is being recorded.
7. Assemble the output: scope statement, summary tables, accrual table, then anomaly flags and action items framed as operator follow-ups — figures to confirm with finance, missing invoices to request, and budget decisions needed.

## Spend Register Format

| Invoice or entry | Firm | Matter | Practice area | Period | Amount as stated | Source |
|---|---|---|---|---|---|---|

## Summary Table Formats

Each summary table carries three columns — the grouping key, the total, and the arithmetic basis:

| Matter / Firm / Practice area / Period | Total | Basis |
|---|---|---|
| Grouping value as stated | Sum of register rows | Register rows summed, cited by row |

Budget versus actual adds the supplied budget and the difference:

| Matter | Budget as supplied | Actual | Difference | Basis |
|---|---|---|---|---|

## Accrual Table Format

| Matter | Firm | Period | Accrual estimate | Basis | Status |
|---|---|---|---|---|---|
| Matter reference | Firm | Period covered | Figure labeled `estimate from data provided` | Source rows or descriptions cited | `Pending finance confirmation` |

## Boundaries

- Do not pull, estimate, or recall figures from outside the data provided in the issue; mark gaps `[NOT AVAILABLE]` rather than estimating.
- Do not compute or state final financial or tax liability, and do not make budget, payment, or accrual-booking decisions; organize the data and flag decisions to the operator.
- Do not transmit spend data or reports to a finance system, a firm, or any external party or system; the report is a work product pending operator approval.
