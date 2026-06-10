---
name: bd-crm-hygiene-checklist
description: Structure contact, company, and deal updates for the CRM when a record-hygiene matter arrives, running dedup and completeness checks and producing an update-record table with operator follow-ups.
metadata:
  sources:
    - path: companies/legal-operations/skills/bd-crm-hygiene-checklist/SKILL.md
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# BD CRM Hygiene Checklist

Use this skill to turn raw contact, company, and deal facts into clean, deduplicated CRM record updates. Facts come from the source issue; record state comes from the CRM connector; suggestions go to the operator as follow-ups.

## Record Intake Fields

Capture these from the source issue for each record touched, exactly as stated:

1. Contact: email, first and last name, title, phone, source channel, and lifecycle stage.
2. Company: legal or trading name, domain, industry, and relationship status (prospect, client, referral source).
3. Deal: deal name, pipeline and stage, amount if stated, associated contact and company, and expected timing.
4. Activity context: what happened (call, referral, RFP, event) and when, as the operator described it.
5. Requested change: create, update, or hygiene-only review, as the issue frames it.

Mark absent fields `[NOT PROVIDED]`; never fill a field by inference or outside lookup.

## Dedup Procedure

Run before every create, in this order:

1. Search contacts by exact email through the connector; an email match is a definitive duplicate — update that record.
2. Absent an email match, search by full name plus company domain; treat hits as probable duplicates and prefer update over create.
3. Search companies by domain first, then by name; search deals by associated contact or company plus deal name.
4. Record the match result for every record: `Matched (ID)`, `Probable match (ID) — confirm`, or `No match — create`.
5. Never merge or delete records to resolve a duplicate; list duplicate pairs with both IDs as an operator follow-up.

## Completeness Checks

After dedup, check each record against the required-field baseline: contacts need email, name, source channel, and lifecycle stage; companies need name and domain; deals need name, pipeline stage, and at least one association. List every empty or stale required field as a gap with who can supply it. Flag records untouched beyond a stated staleness window (default 180 days) for operator review rather than editing them speculatively.

## Update-Record Table Format

| Record | Match result | Fields changed (before → after) | CRM ID / URL |
|---|---|---|---|
| Record type and identifier as stated in the issue | `Matched (ID)` / `Probable match (ID) — confirm` / `No match — create` | Each field with its prior and new value, or `[NOT PROVIDED]` | HubSpot ID and canonical URL after a successful write, or `Pending — connector gap` |

One row per record. Probable matches change nothing until the operator confirms; record the proposed change in the row and list the confirmation as a follow-up.

## Operator Follow-Up Framing

Next steps live with the operator, not the agent:

- Frame follow-up calls, meetings, proposal timing, and re-engagement ideas as suggestions in the follow-ups section; never schedule or send anything.
- Frame duplicate merges as follow-ups with both record IDs and the recommended survivor.
- Frame connector gaps (unconfigured token, missing scope, rate limit) as follow-ups with the structured update preserved as a pending work product.

## Boundaries

- Do not contact prospects or any external party; CRM writes through the connector to the firm's own portal are the only external interaction.
- Do not trigger sequences, workflows, or marketing sends from the CRM.
- Do not score, qualify, or assess opportunity merits; record facts and gaps only.
- Do not merge or delete records; propose, never execute, destructive changes.
