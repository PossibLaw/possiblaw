---
name: legal-matter-intake
description: Capture essential facts for a new legal matter before drafting, review, routing, or conflicts screening.
metadata:
  sources:
    - path: layer/skills/legal/matter-intake.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Matter Intake

Use this skill before drafting or routing a new legal matter. Capture what is known, apply permitted defaults, and identify gaps that require operator or responsible-professional confirmation.

## Intake Checklist

1. Parties: full legal names, entity types, and jurisdictions of formation or residence for all parties.
2. Matter type: NDA, contract review, contract draft, litigation hold, employment issue, IP licensing, regulatory inquiry, corporate formation, or other category.
3. Purpose and background: the operator's objective, business context, transaction, relationship, and requested outcome.
4. Urgency: routine, expedited, emergency, or a specific deadline.
5. Jurisdiction: governing law, venue, forum, or regulatory jurisdiction mentioned by the operator.
6. Counterparty details: counterparty role, known sensitivity, competitor status, government involvement, or regulated-entity status.
7. Scope constraints: dollar thresholds, term limits, negotiation boundaries, clause preferences, or prohibited terms.
8. Conflicts seed data: all party names, affiliates, counsel, and related matter names needed for conflicts screening.
9. Related documents: existing drafts, templates, prior agreements, emails, term sheets, or instructions.
10. Confidentiality level: client-confidential, internal, public, or otherwise restricted.
11. Special instructions: formatting, house style, required clauses, excluded clauses, or approval workflow.
12. Responsible professional: supervising lawyer, partner, operator, or other reviewer responsible for the matter.
13. Missing information: list absent facts, distinguish defaults from blockers, and flag any fact that must be confirmed before drafting.

## Output Requirements

- Produce a compact intake summary before substantive drafting.
- Do not ask for every missing field unless the missing fact blocks the requested work.
- Preserve all conflicts seed data so the conflicts-check skill can run before substantive legal work begins.
- Mark unresolved material facts as open items for operator or responsible-professional review.
