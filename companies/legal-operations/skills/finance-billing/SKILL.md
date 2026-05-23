---
name: finance-billing
description: Assemble a draft invoice from a legal matter's time entries — validation, grouping, rates, totals, payment terms, and cover note.
metadata:
  sources:
    - path: layer/skills/finance/billing-playbook.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Finance Billing Playbook

Use this skill to draft a complete, professional invoice for a legal matter. Apply the defaults below when the operator has not provided contrary instructions, and mark missing details with placeholders.

## Drafting Steps

1. Collect and validate time entries. Gather all time entries for the matter: attorney or timekeeper name, date, activity description, and hours billed. Validate that hours are positive numbers and that descriptions are substantive (not just "work on matter"). Flag any entries with vague descriptions for partner review.

2. Identify the billing period. Determine the start and end date of the billing period (e.g., "For services rendered May 1–31, 2026"). If not specified, use the date range covered by the time entries.

3. Group by activity code. Group time entries by activity type: Legal Research, Drafting & Review, Client Communications, Court/Filing, Administrative, Travel. Activity codes make invoices cleaner and easier for clients to understand.

4. Apply applicable rates. Apply the correct hourly rate for each timekeeper tier: Partner ($450/hour default), Senior Associate ($325/hour default), Associate ($275/hour default), Paralegal ($150/hour default). Use operator-specified rates when provided; defaults are placeholders only.

5. Calculate subtotals per activity group. For each activity group, multiply hours by rate and sum to a group subtotal. Display in a table with columns `Description`, `Hours`, `Rate ($/hr)`, `Amount ($)`.

6. Calculate the grand total. Sum all group subtotals. If a matter has both partner and associate time, list them as separate line items before combining into a single fees total.

7. Apply tax if applicable. Most US legal fees are not subject to sales tax, but some states tax legal services. Leave a tax line as `Tax (if applicable): [OPERATOR TO COMPLETE]`. For non-US matters, include a VAT/GST placeholder.

8. Set payment terms and due date. Default to Net 30 days from invoice date. Include accepted payment methods (check, ACH, wire, credit card) with bank/routing placeholders. Reference the client's engagement letter payment terms when available.

9. Draft the invoice header and bill-to block. Include firm name and address, invoice number in the format `INV-[YEAR]-[SEQUENCE]`, invoice date, client name and address, matter name and reference number, and billing attorney.

10. Add the authorization signature block and cover note. Include an "Authorized by" line with partner name and title placeholder. Optionally draft a brief cover note (two to three sentences) summarizing the work performed during the period and the total amount due to improve client relations and reduce payment delays.

## Output Requirements

- Use clear billing language suitable for operator review.
- Preserve operator-specified rates, payment terms, party names, and matter references.
- Surface unresolved facts (missing rates, ambiguous time entries, missing payment instructions) in a short open-items section before the draft when they affect the final amount.
- Do not omit the tax-line placeholder when the operator has not confirmed whether tax applies.
