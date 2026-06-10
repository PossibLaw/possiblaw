---
name: hr-internal-onboarding-playbook
description: Draft internal onboarding and offboarding checklists, PTO-tracking templates, and internal HR communications for the firm's own staff when an HR coordination matter arrives, keeping employment-law questions routed to the employment practice.
metadata:
  sources:
    - path: companies/legal-operations/skills/hr-internal-onboarding-playbook/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# HR Internal Onboarding Playbook

Use this skill to draft the administrative artifacts of the firm's own people operations: onboarding checklists, offboarding checklists, PTO-tracking templates, and internal HR communications. Administrative coordination only — what the law requires is never answered here.

## Employment-Law Routing Boundary

Any question of employment LAW — policy content, terminations, accommodations, leave-law compliance, classification, or any other question whose answer depends on what the law requires — is out of scope for this skill. Route it back through `ops-lead` to `chief-of-staff` for delegation to the employment practice, and continue only with the administrative portions that remain. The test: listing an administrative step ("collect the laptop", "schedule the benefits-enrollment session") is coordination; deciding what a step must contain to be lawful is an employment-practice question.

## Onboarding Checklist Structure

Draft as a markdown table with columns `Step | Owner | Due | Status`, grouped into phases:

1. Before day one: offer accepted (administrative confirmation only — the offer itself comes from the employment practice), equipment ordered (`[EQUIPMENT]`), accounts requested (`[SYSTEM]` rows per system), workspace or remote setup, welcome note scheduled.
2. Day one: identification and payroll paperwork collected (listed as items to collect, with `[PAPERWORK — confirm required forms with employment practice]` where the required set is a legal question), system access verified, introductions, first-week schedule shared.
3. First two weeks: role-specific training sessions as the operator describes them, tool walkthroughs, check-in with `[MANAGER]`.
4. First ninety days: goal-setting session, scheduled check-ins, `[REVIEW CADENCE]` entry.

Include only steps the operator described plus these standard administrative items; mark firm-specific unknowns with placeholders rather than inventing systems or owners.

## Offboarding Checklist Structure

Same table format, grouped into phases:

1. On notice: last day confirmed (`[LAST DAY]`), handover owner named (`[HANDOVER OWNER]`), knowledge-transfer plan drafted.
2. Final week: system access deprovisioning requests per `[SYSTEM]` row, equipment return, expense and PTO balance reconciliation rows as administrative items.
3. Last day: badge and equipment collected, accounts disabled confirmation, final administrative wrap-up.
4. After departure: distribution-list and on-call rotation cleanup, records filed per the firm's retention process (`[RETENTION PROCESS — confirm]`).

Anything connected to the reason for departure, severance, releases, or final-pay law goes through the employment-law routing boundary, not into the checklist.

## PTO-Tracking Template Rules

- Columns: employee (`[EMPLOYEE NAME]` in templates), accrual rate as the operator describes it, balance, request date, dates requested, approver, status.
- Track balances and approvals administratively; never state what leave the law requires or whether a request must be granted — both are employment-practice questions.
- Include a notes column for operator use, not for policy interpretation.

## Internal HR Communication Rules

- Keep communications factual and logistics-focused: who, what, when, where to ask questions.
- Use neutral, professional tone; include only the personal details the message needs.
- Any message that announces or interprets a policy, termination, accommodation, or compensation decision goes through the employment-law routing boundary before drafting.
- Every communication is a draft for operator review; never address or distribute it directly to staff.

## Template Rules

- Use bracket placeholders for every firm-specific unknown: `[EMPLOYEE NAME]`, `[START DATE]`, `[MANAGER]`, `[SYSTEM]`, `[EQUIPMENT]`, `[OWNER]`.
- Keep templates reusable: no real personal data in a template artifact; real names appear only in instance documents the operator requests.
- List every placeholder and operator follow-up in a short `Assumptions and open items` section at the top of the artifact.

## Boundaries

- Do not answer employment-law questions or draft policy content under any framing.
- Do not invent firm systems, benefits, policies, or process steps not described by the operator.
- Do not distribute communications or checklists to staff or any external party; artifacts are work products pending operator approval.
