---
name: invoice-audit-checklist
description: Audit an outside-counsel invoice line by line against billing guidelines when an invoice-review matter arrives, producing a quantified adjustment-recommendation table covering block billing, vague narratives, staffing mismatches, rate variances, and math errors.
metadata:
  sources:
    - path: companies/legal-operations/skills/invoice-audit-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Invoice Audit Checklist

Use this skill to review an outside-counsel invoice line by line against the applicable billing guidelines and rate schedule. The output is an adjustment-recommendation table the operator can act on row by row. Every output is a recommendation; nothing audited under this skill is approved, rejected, or paid.

## Audit Steps

1. Scope intake. Record the invoice identifiers, billing period, firm and matter, the billing guidelines and rate schedule supplied, and any pages or attachments not supplied. If the invoice is absent, or no billing guidelines or rate schedule is supplied and the operator has not authorized a general-practices review, gate with `missing-info-gate`. When the operator authorizes a general-practices review, state that basis at the top of the output and on each finding.
2. Review every line item against the categories below; do not sample or skip lines because the invoice is long. Tie every finding to a specific guideline provision when guidelines are supplied:
   - Block billing: multiple distinct tasks combined in one time entry without task-level detail.
   - Vague narratives: entries too generic to assess the work performed (for example "attention to matter", "review documents" with no subject).
   - Staffing mismatches: timekeepers not on the approved staffing plan, work billed at a level inconsistent with the task, and duplicate attendance without a guideline basis.
   - Rate variances: billed rates that differ from the supplied rate schedule, including unapproved rate increases.
   - Other guideline violations: any other charge a supplied guideline provision prohibits or conditions (for example expense rules and approval requirements), cited to the provision.
3. Verify the arithmetic independently: recheck line extensions (hours times rate), subtotals, discounts, expense totals, and the invoice total. Record every math error with the stated and recomputed figures.
4. Quantify each finding. State the recommended adjustment in dollars for every flagged line, with the computation shown. Distinguish guideline violations from judgment calls: mark discretionary items `[OPERATOR DECISION]` rather than forcing an adjustment.
5. Produce the adjustment-recommendation table and summary in the formats below.

## Adjustment-Recommendation Table Format

| Line item | Category | Basis | Billed amount | Recommended adjustment | Recommendation |
|---|---|---|---|---|---|
| Date, timekeeper, and narrative excerpt | Block billing / Vague narrative / Staffing mismatch / Rate variance / Math error / Other guideline violation | Guideline provision cited, or the stated general-practices basis | Amount as billed | Dollar amount with the computation shown | Specific recommended action, or `[OPERATOR DECISION]` for judgment calls |

## Summary and Next Actions

Close the audit with:

- Total billed, total recommended adjustments, and the resulting recommended net, labeled as recommendations for operator decision.
- Finding counts by category.
- Pages or attachments not supplied and lines affected.
- Operator decisions needed, listed by row.

## Boundaries

- Do not approve, reject, pay, or commit to paying an invoice, and do not state a final amount owed as settled; every figure is a recommendation for the operator.
- Do not opine on fee-dispute rights or whether a charge is legally recoverable; flag those questions to the operator or responsible counsel.
- Do not transmit the audit, the adjustments, or any dispute to the billing firm, an e-billing system, or any external party or system; the audit is a work product pending operator approval.
