---
name: benefits-notice-checklist
description: Build or update a required-notice calendar when a benefits-notice tracking matter arrives, producing a notice table with type, audience, trigger, deadline, owner, and delivery status plus a change log and operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/benefits-notice-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Benefits Notice Checklist

Use this skill to maintain a required-notice calendar for the benefit plans identified in the issue. Track only what the issue or a prior calendar identifies, record entries exactly as stated, and treat every deadline as a follow-up for responsible benefits counsel to confirm. Nothing tracked under this skill is distributed to anyone.

## Tracking Steps

1. Scope intake. Record the plans covered, the notice types identified in the issue or a prior calendar on the issue, the plan year or tracking period, and any prior calendar to update. If no plan, notice list, or prior calendar is identified and no acceptable default applies, gate with `missing-info-gate`.
2. Build the notice inventory. List each notice to track exactly as the issue, plan materials, or prior calendar names it. Do not add notice types on your own judgment of what the plan should be sending; if the operator asks what notices are required, record the question as a counsel follow-up.
3. Build or update the calendar table. Enter one row per notice in the format below, recording names, audiences, triggers, and deadlines exactly as stated and marking gaps `[NOT AVAILABLE]` rather than inferring.
4. Apply the status conventions. Update delivery status only from evidence in the issue — operator confirmations or delivery records supplied; never assume a notice went out:
   - `Not started` — no preparation evidence on the issue.
   - `In preparation` — drafting or assembly evidence on the issue.
   - `Ready for delivery` — operator-confirmed ready, awaiting distribution decision.
   - `Delivered (confirmed)` — delivery evidence cited on the issue.
   - `[NOT AVAILABLE]` — no status evidence.
5. Build the change log. Compare against the last calendar recorded on the issue and call out new notices, status changes, and passed or approaching deadlines. On a first pass, state that the calendar baseline is being recorded.
6. Build the action items: operator follow-ups only — deadlines to confirm with responsible benefits counsel, notices awaiting an owner or delivery confirmation, and tracking gaps.

## Calendar Table Format

| Notice type | Audience | Trigger | Deadline | Owner | Delivery status |
|---|---|---|---|---|---|
| Notice name as stated | Participants, beneficiaries, or group as stated | Triggering event as stated (for example enrollment, plan change, qualifying event) | Deadline as stated, flagged for counsel confirmation, or `[NOT AVAILABLE]` | Person or team as stated, or `[NOT AVAILABLE]` | Status per the conventions above, with the evidence cited |

## Change Log Format

- New notices added since the last calendar, with their source.
- Status changes, each with the evidence cited.
- Passed or approaching deadlines, stated factually by date.
- On a first pass: `Baseline calendar recorded` plus the source of each entry.

## Boundaries

- Do not distribute, send, post, or transmit any notice to participants, beneficiaries, agencies, or any external party or system; the calendar is a tracking work product pending operator approval.
- Do not determine whether a notice is legally required, whether a deadline applies, or whether a delivery method satisfies a rule; every deadline and obligation question is a follow-up for the operator or responsible benefits counsel.
- Do not infer audiences, triggers, or deadlines the sources do not state; mark them `[NOT AVAILABLE]`.
