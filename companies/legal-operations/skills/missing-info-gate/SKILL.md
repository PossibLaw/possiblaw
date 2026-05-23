---
name: missing-info-gate
description: Block an issue with a structured missing-information gate when material facts are absent. Lists required fields, unblock owner, why each field matters, acceptable defaults, and what auto-resumes when answered.
metadata:
  sources:
    - path: companies/legal-operations/skills/missing-info-gate/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Missing-Information Gate

Use this skill to halt forward motion on a Paperclip issue when a material fact is absent and no acceptable default exists. The gate produces a single, structured `BLOCKED` comment, sets the Paperclip issue `status` to `blocked`, and tells the operator exactly what to provide and what will happen when they answer.

This skill is shared by every agent in the company that produces work product or delegates to another agent. It supplements — it does not replace — each agent's own decision rules.

## When To Invoke

Run this skill before any of the following actions:

1. Producing a substantive draft, opinion, recommendation, or external-facing artifact.
2. Delegating an issue to another agent that will produce such an artifact.
3. Applying a default that would change a substantive legal or business outcome (e.g., choosing governing law, term length, classification of an employee, scope of an IP assignment).
4. Closing an issue as completed when one or more required facts are still placeholders.

Do not gate for purely stylistic, formatting, or administrative gaps. Apply a sensible default and note it in `Defaults used`.

## Decision Rule

1. Identify the matter type. Load the matching required-fact template from `templates/` in this skill:
   - NDA → `templates/nda.md`
   - Employment offer letter → `templates/employment-offer.md`
   - IP assignment → `templates/ip-assignment.md`
   - If no template matches, use the agent's own required-fact list and note `template: ad-hoc` in the comment.
2. For each required field in the template:
   - If a value is present in the issue body, prior comments, or linked documents, mark it as supplied.
   - If a value is missing and an acceptable default exists for this matter type, apply the default and add the field to `Defaults used`.
   - If a value is missing and no acceptable default exists, mark it as a gating field.
3. If there are zero gating fields, do not invoke the gate; continue work. Include `Defaults used` in your normal output so the operator can override.
4. If there is at least one gating field, post the BLOCKED comment below and set issue `status` to `blocked` in the same action.

## BLOCKED Comment Format

Post the following comment verbatim, filling in the fields. Do not omit sections. Do not include any other content in this comment.

```
## ⛔ Missing Information Gate

**Matter type**: <slug, e.g. nda | employment-offer | ip-assignment | ad-hoc>
**Status**: blocked pending operator input

### Required fields
| Field | Why it matters | Acceptable inputs | Default if any |
| --- | --- | --- | --- |
| <field name> | <one-sentence reason this field changes outcome> | <format or enumerated options> | <default or NO DEFAULT> |
| <field name> | <reason> | <inputs> | <default or NO DEFAULT> |

### Defaults used
- <field>: <default value applied> (override by replying with the field name and your value)
- (omit this section if no defaults were applied)

### Unblock owner
<named operator if known, otherwise the role: e.g. "Matter owner" or "General Counsel">

### Unblock action
<one sentence telling the operator the single concrete thing to do, e.g. "Reply with the counterparty's full legal name, entity type, and state of formation.">

### What resumes when answered
<name of the agent that will pick the issue back up> will re-read this thread, fill in the missing fields, and continue with <the next concrete step>.
```

## Status Transition

Set the Paperclip issue `status` to `blocked` at the same time as posting the comment. Use the `paperclip` skill that is available in this environment for the API shape; do not invent endpoints. The status change and the comment are a pair — if either fails, retry both together so the issue is never silently blocked or silently unblocked.

When the gate is satisfied (see Auto-Resume Rule), set `status` back to whatever it was before the gate fired (usually `in_progress`) using the same `paperclip` skill.

## Auto-Resume Rule

The operator unblocks the gate by posting a follow-up comment on the same issue whose first line begins with `RESUME:` (case-sensitive). The rest of the comment may contain free-form field values or a structured list.

The gating agent (named in `What resumes when answered`) must:

1. Re-read the full issue including the `RESUME:` comment.
2. Extract the provided field values and combine them with the values already present (including the previously-applied defaults).
3. If all gating fields are now supplied, set `status` back to its prior value and continue the original work.
4. If any gating field is still missing, post a new BLOCKED comment listing only the still-missing fields and remain blocked.

Do not auto-resume on any other prefix. A comment without `RESUME:` is treated as discussion and does not change status.

## Output Requirements

- Post exactly one BLOCKED comment per gating event. Do not stack duplicate gates.
- Do not echo back operator-provided values that are themselves confidential (e.g., a counterparty deal price, a candidate's SSN, an unfiled patent description). Refer to the value by name only (`Compensation: provided`) and keep the raw text out of the BLOCKED comment.
- Never proceed past a gate by silently choosing a value for a `NO DEFAULT` field.
- Never delete or edit a prior BLOCKED comment when re-gating — post a new one so the audit trail is intact.

## Eval

Given an issue tagged `matter_type: nda` with party names, purpose, term, and jurisdiction all supplied,
When the drafting agent invokes this skill,
Then the skill returns "no gate" and the agent continues; any defaults applied (e.g., governing law = Delaware) are listed under `Defaults used` in the agent's normal output.

Given an issue tagged `matter_type: employment-offer` with employer entity, candidate name, title, and start date supplied, but compensation missing,
When the drafting agent invokes this skill,
Then the skill applies no default for compensation (compensation has NO DEFAULT in the template), posts the BLOCKED comment listing only `Compensation` as the gating field, sets issue status to `blocked`, and names the matter owner as unblock owner.

Given an operator replies `RESUME: Compensation = USD 175,000 base + standard equity; do not echo this back externally`,
When the gating agent re-reads the issue,
Then the agent records `Compensation: provided` internally, sets status back to `in_progress`, and does not include the raw `USD 175,000` figure in any subsequent BLOCKED comment or public-facing artifact summary; the figure flows only into the draft itself for operator review.
