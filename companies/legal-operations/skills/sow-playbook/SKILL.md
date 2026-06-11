---
name: sow-playbook
description: Draft a complete statement of work under a governing master services agreement — scope, deliverables, acceptance criteria, milestones, fees, and change control — when a SOW drafting matter arrives, applying stated defaults and flagging every term that conflicts with the governing MSA.
metadata:
  sources:
    - path: companies/legal-operations/skills/sow-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# SOW Drafting Playbook

Use this skill to draft a statement of work that operates under a governing master services agreement. The SOW carries the project-specific terms; the MSA controls everything else, and every SOW term that conflicts with it is flagged, never silently overridden. The draft is a work product for operator and responsible-attorney review; it is never sent to a counterparty.

## Drafting Steps

1. Scope intake. Record the governing MSA (title, parties, date), the SOW number, the requested scope, deliverables, schedule, fee terms, and every operator-specified constraint. When the governing MSA is not identified, draft against the `[GOVERNING MSA — TITLE AND DATE]` placeholder and flag that the conflict check in step 11 is pending the document. If the requested scope itself cannot be identified and no acceptable default applies, gate with `missing-info-gate` instead of guessing.
2. Tie the SOW to the MSA. Open with a title block — SOW number (next sequential number when known, otherwise `[SOW NUMBER]`), governing MSA reference, parties, and SOW effective date (`[SOW EFFECTIVE DATE]` when unknown) — then a background section that recites the governing MSA by title, parties, and date and incorporates it by reference.
3. Draft the scope of services. State what is in scope in concrete terms, and add an explicit out-of-scope list when the boundary is likely to be disputed.
4. Draft the deliverables table: one row per deliverable with description, format, and due date or milestone reference. Use `[MILESTONE DATE]` placeholders when dates are unknown.
5. Draft the acceptance criteria. Make each criterion concrete and testable — what is checked, by whom, against what standard — and mark unverifiable criteria for operator follow-up rather than papering over them. Default acceptance window: 10 business days from delivery, deemed accepted absent written rejection identifying the nonconformities, marked `[OPERATOR DECISION]`; rejected deliverables are corrected and resubmitted, restarting the window.
6. Draft the milestones and schedule as a table tying each milestone to its deliverables and dates, with `[MILESTONE DATE]` placeholders where unknown.
7. Draft the fees and invoicing section. Default to time and materials with a `[RATE TABLE]` placeholder; use a fixed fee only when the issue states one. Tie invoicing to milestones or monthly cycles and follow the MSA's payment terms rather than restating them; any deviation is an `[OPERATOR DECISION]`.
8. Draft assumptions and dependencies, then change control. Default change control: no changed work begins before a written change order signed by both parties stating the change's effect on scope, schedule, and fees.
9. State the term. Default: from the SOW effective date until acceptance of the final deliverable, unless earlier terminated under the MSA.
10. State the order of precedence. The MSA controls unless the SOW expressly amends a cited MSA section for this SOW only, and any such deviation is an `[OPERATOR DECISION]`.
11. Run the MSA conflict check. When the governing MSA is supplied, check each SOW term against it — payment, IP, liability, termination, acceptance, and any restated MSA language — and record every conflict in the `MSA conflict flags` section; never silently override an MSA term. When the MSA is not supplied, state that the conflict check is pending the document.
12. Assemble the deliverable in the output format below. List every placeholder and default used in the assumptions section, and close with signature blocks.

## MSA Conflict Flags Format

| SOW section | MSA section | Conflict |
|---|---|---|
| Section reference | Section reference | One sentence stating the conflicting terms |

State `None identified` when there are no conflicts, plus the pending-document caveat when the governing MSA was not supplied.

## Output Format

Produce the draft with this structure:

1. Title block: SOW number, governing MSA reference, parties, and effective date, with placeholders for unknowns.
2. `Assumptions and open items` section listing every placeholder, default used, and operator follow-up.
3. Numbered sections in step order: background and MSA tie-in, scope of services, deliverables table, acceptance criteria, milestones and schedule, fees and invoicing, assumptions and dependencies, change control, term, and order of precedence.
4. `MSA conflict flags` section in the format above.
5. Signature block with placeholder names, titles, and dates.

## Boundaries

- Use operator-specified scope, figures, and dates exactly as given; the defaults in this playbook apply only when the operator is silent.
- Do not amend the MSA; a SOW deviation from a cited MSA section applies to that SOW only and is always an `[OPERATOR DECISION]`.
- Do not resolve legal determinations — enforceability, jurisdiction-specific requirements, regulatory constraints — in the draft; flag them for the operator or responsible attorney.
- Do not transmit the draft or any matter document to a counterparty or any external party or system; the draft is a work product pending operator approval.
