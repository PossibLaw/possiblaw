---
name: expense-categorization-playbook
description: Categorization rubric for business expenses — standard categories, deductibility rules, and classification guidance for legal-practice contexts.
---
# Expense Categorization Playbook

Use this rubric to classify business expenses and determine deductibility for a US-based law firm. Apply each rule in order; use the first matching category.

## Standard Categories

| Category | Typical Examples |
|---|---|
| Business Meals & Entertainment | Client dinners, team lunches with business agenda, conference refreshments |
| Travel — Air & Rail | Airfare, train tickets for business travel |
| Travel — Ground & Lodging | Taxis, Uber/Lyft, rental cars, hotel stays for business trips |
| Office Supplies | Paper, pens, printer cartridges, folders, postage |
| Technology & Software (SaaS) | Legal research subscriptions (Westlaw, Lexis), practice management software, cloud storage |
| Professional Fees | Bar dues, CLE registrations, expert witness fees, accounting/bookkeeping fees |
| Marketing & Advertising | Website hosting, sponsored content, directory listings, client gifts |
| Utilities & Facilities | Office rent, electricity, phone/internet (pro-rated for business use) |
| Insurance | Professional liability (malpractice) insurance, general liability, cyber insurance |
| Miscellaneous Business | Bank fees, wire transfer fees, courier/delivery, court filing fees |

## Deductibility Rules (US Federal, Law Firm Context)

1. **Business Meals & Entertainment** — 50% deductible under IRC §274 if there is a documented business purpose and the meal is with a client, prospective client, or business colleague. Entertainment (concerts, sporting events) is generally non-deductible post-TCJA 2017; if in doubt, mark `deductible: false`.

2. **Travel** — Fully deductible if the primary purpose is business. Mixed personal/business trips require proration; if unclear, flag for operator review. Commuting from home to primary office is not deductible.

3. **Office Supplies** — Fully deductible as ordinary and necessary business expenses under IRC §162.

4. **Technology & Software (SaaS)** — Fully deductible as business expenses. Annual subscriptions are deductible in the year paid (cash-basis taxpayer) or ratably (accrual-basis). Mark `deductible: true`.

5. **Professional Fees** — Bar dues, CLE, and professional development directly related to maintaining legal licensure are fully deductible. Mark `deductible: true`.

6. **Marketing & Advertising** — Fully deductible as ordinary and necessary business expenses. Mark `deductible: true`.

7. **Utilities & Facilities** — Deductible for dedicated office space. Home office deductions require meeting IRS exclusive-use test; if unclear, mark `deductible: false` with a note.

8. **Insurance** — Professional liability and business insurance premiums are fully deductible. Mark `deductible: true`.

9. **Miscellaneous Business** — Court filing fees, bank fees, and courier charges are deductible. Personal expenses inadvertently submitted are not deductible; mark `deductible: false` with rationale.

10. **Uncertain or personal expenses** — If an expense description is ambiguous (could be personal or business), mark `deductible: false` and explain in the rationale so the operator or accountant can make the final call.
