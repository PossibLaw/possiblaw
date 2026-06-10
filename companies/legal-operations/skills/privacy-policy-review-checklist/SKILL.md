---
name: privacy-policy-review-checklist
description: Review privacy notices and policies section by section when a privacy review matter arrives, producing risk-rated findings with proposed redlines and jurisdiction flags.
metadata:
  sources:
    - path: companies/legal-operations/skills/privacy-policy-review-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Privacy Policy Review Checklist

Use this skill to run a structured, section-by-section review of a privacy notice or privacy policy. The output is a findings table with proposed redlines the operator or responsible attorney can act on row by row. The review never asserts that the notice complies with any privacy regime.

## Review Steps

1. Scope intake. Record the notice under review, where it is published (website, app, product surface), the jurisdictions where the business operates or markets, the operator's stated data practices if provided, and any sections the operator excluded. If the notice or jurisdiction list is absent and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Build the disclosure inventory. Locate and list each of the following, noting any that are absent:
   - Identity and contact details of the business responsible for the data
   - Categories of personal data collected, including any special categories
   - Sources of the data (directly from the individual, third parties, automatic collection)
   - Purposes of collection and use
   - Sharing and disclosure: categories of recipients, and whether data is sold or shared for advertising
   - Retention: how long data is kept, or the criteria used to decide
   - Individual rights offered and how to exercise them
   - Cookies, tracking, and analytics disclosures
   - Children's data statements
   - International transfer statements
   - Effective date and change-notification practice
3. Rate each section. Assign `High`, `Medium`, or `Low` risk with a one-line rationale:
   - `High`: a disclosure contradicts the operator's stated practices, promises something the business reportedly does not do, or a core inventory item is missing entirely.
   - `Medium`: a disclosure is ambiguous, outdated, materially incomplete, or written so broadly it conveys nothing.
   - `Low`: readability, structure, or plain-language issues.
4. Check readability. Flag sections an ordinary reader could not follow: nested cross-references, undefined jargon, walls of text without headings, and rights mechanisms that require unstated steps.
5. Check consistency with stated practices. Where the operator has described actual practices in the issue, compare each disclosure against them; every mismatch between what the notice says and what the business reportedly does is a `High` finding.
6. Flag jurisdiction dependence. Where the adequacy of a disclosure turns on jurisdiction — rights sections, sale-or-sharing opt-outs, lawful-basis statements, and regulator-contact requirements vary by regime — state the dependency, mark it `Jurisdiction flag`, and route the determination to the operator or responsible attorney. Do not resolve jurisdiction-specific questions or assert compliance in the findings.
7. Produce the findings table and summary in the format below.

## Findings Table Format

| Section | Risk | Issue | Proposed redline |
|---|---|---|---|
| Section name and reference | High / Medium / Low | One- or two-sentence issue statement with rationale | Concrete replacement language or `[OPERATOR DECISION]` where the fix is a business choice |

Every `High` and `Medium` row must include a specific proposed redline. Append jurisdiction flags as their own rows with `Jurisdiction flag` noted in the Issue column.

## Summary and Next Actions

Close the review with:

- Finding counts by risk level and the count of jurisdiction flags.
- Missing disclosures from the inventory and whether each should be added.
- Sections not reviewed and why.
- A short ordered list of next actions for the operator, starting with `High` findings.

## Boundaries

- Do not assert compliance or non-compliance with any privacy regime, or predict how a regulator would treat a disclosure.
- Do not rewrite the source document directly; deliver findings and proposed redlines for operator decision.
- Do not transmit the document or the review to any external party or system; the review is a work product pending operator approval.
