---
name: billing-playbook
description: Authoritative playbook for assembling a draft invoice from a legal matter's time entries — validation, grouping, rates, totals, and cover note.
---
# Billing Playbook

Follow these steps in order to produce a complete, professional draft invoice for a legal matter.

1. **Collect and validate time entries** — Gather all time entries for the matter: attorney/timekeeper name, date, activity description, and hours billed. Validate that hours are positive numbers and that descriptions are substantive (not just "work on matter"). Flag any entries with vague descriptions for partner review.

2. **Identify the billing period** — Determine the start and end date of the billing period (e.g., "For services rendered May 1–31, 2026"). If not specified, use the date range covered by the time entries.

3. **Group by activity code** — Group time entries by activity type: Legal Research, Drafting & Review, Client Communications, Court/Filing, Administrative, Travel, etc. Activity codes make invoices cleaner and easier for clients to understand.

4. **Apply applicable rates** — Apply the correct hourly rate for each timekeeper tier: Partner ($450/hr default), Senior Associate ($325/hr default), Associate ($275/hr default), Paralegal ($150/hr default). Use operator-specified rates if provided; defaults are placeholders only.

5. **Calculate sub-totals per activity group** — For each activity group, multiply hours × rate and sum to a group subtotal. Display in a table: `Description | Hours | Rate ($/hr) | Amount ($)`.

6. **Calculate the grand total** — Sum all group subtotals. If a matter has both partner and associate time, list them as separate line items before combining into a single fees total.

7. **Apply tax if applicable** — Most US legal fees are not subject to sales tax, but some states (e.g., New Mexico, South Dakota) tax legal services. Leave a tax line blank with a note: `Tax (if applicable): [OPERATOR TO COMPLETE]`. For non-US matters, include a VAT/GST placeholder.

8. **Set payment terms and due date** — Default: Net 30 days from invoice date. Include accepted payment methods (check, ACH, wire, credit card) with bank/routing placeholders. Reference the client's engagement letter payment terms if available.

9. **Draft the invoice header and bill-to block** — Include: firm name and address, invoice number (format: `INV-[YEAR]-[SEQUENCE]`), invoice date, client name and address, matter name and reference number, billing attorney.

10. **Add authorization signature block and cover note** — Include an "Authorized by" line with partner name and title placeholder. Optionally draft a brief cover note (2–3 sentences) summarizing the work performed during the period and the total amount due. This improves client relations and reduces payment delays.
