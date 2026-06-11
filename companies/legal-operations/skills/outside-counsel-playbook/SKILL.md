---
name: outside-counsel-playbook
description: Draft outside-counsel engagement letters and billing-guideline documents when an engagement matter arrives, producing a markdown engagement package with defaults and rate placeholders that is never sent to any firm.
metadata:
  sources:
    - path: companies/legal-operations/skills/outside-counsel-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Outside Counsel Playbook

Use this skill to draft an outside-counsel engagement package: an engagement letter plus billing guidelines. Apply the defaults in the drafting agent's instructions when the operator has not provided contrary facts, use bracket placeholders for every rate, budget, and fee arrangement, and frame company expectations for the firm to acknowledge. The package is a work product; nothing drafted under this skill is sent to any firm.

## When To Invoke

- The issue requests an engagement letter, billing guidelines, or both for a named or placeholder firm.
- The issue requests revisions to an existing PossibLaw-drafted engagement package; rerun the relevant steps against the prior draft and list what changed.
- Do not invoke for counsel selection, invoice auditing, or spend reporting; selection is an operator decision, and audits and reports belong to other specialists in the legal-ops practice.

## Drafting Steps

1. Gather facts from the issue: engaging entity, firm, relationship partner, matter description, rate schedule, budget, invoice cadence, payment terms, staffing rules, expense rules, reporting cadence, and governing law. If the engaging entity, the firm, or the matter scope cannot be defaulted or placeholdered and no acceptable default applies, gate with `missing-info-gate`; otherwise apply the defaults table in the drafting agent's instructions and record each default used.
2. Draft the engagement letter sections in order:
   - Parties and matter description.
   - Scope of engagement and express exclusions.
   - Term of the engagement.
   - Staffing plan and approval rules, with staffing changes requiring advance written approval by the engaging entity.
   - Rate schedule: a `[RATE SCHEDULE]` placeholder table by timekeeper level; never invent or recommend a rate.
   - Budget and alert threshold: `[MATTER BUDGET]` with the budget-alert threshold from the defaults table.
   - Invoicing and payment terms.
   - Conflicts statement placeholder.
   - Termination provisions.
   - Signature blocks for the engaging entity and the firm.
3. Draft the billing guidelines sections in order:
   - Timekeeping and billing increments.
   - Prohibited practices: block billing, vague narratives, and unapproved timekeepers.
   - Narrative standards for time entries.
   - Expense rules: pass-through at cost, no internal overhead charges, unless the operator specifies otherwise.
   - Rate-change rules: advance notice and approval before any rate change takes effect.
   - Invoice format and cadence.
   - Diversity expectations, framed as company requirements for the firm to acknowledge, with placeholders for company-specific targets.
   - Reporting expectations: matter-status and staffing reports at the stated cadence.
4. Flag terms needing legal review as operator follow-ups; do not opine on whether engagement terms are enforceable or market-standard.
5. Build the `Assumptions and open items` section listing every placeholder, default used, and operator follow-up, and produce the output in the format below.

## Output Format

- A single well-structured markdown engagement package, never a fragment or outline, in this order:
  1. `Assumptions and open items`.
  2. Engagement letter in the section order above.
  3. Billing guidelines in the section order above.
- Preserve operator-specified firms, rates, budgets, and special terms exactly as given; defaults are placeholders only.

## Boundaries

- Do not select, retain, or terminate counsel, and do not commit the company to fees or terms; those decisions belong to the operator.
- Do not negotiate terms or anticipate firm counterproposals; draft the terms as instructed.
- Do not send, post, or transmit engagement terms or guidelines to a firm or any external party or system; the package is a work product pending operator approval.
