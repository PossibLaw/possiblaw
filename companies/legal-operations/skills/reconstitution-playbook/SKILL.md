---
name: reconstitution-playbook
description: Reconstitute a delegated matter when woken with issue_children_completed — verify children live, treat cancelled or output-less children as gaps, assemble child outputs into one consolidated deliverable hoisted onto the parent issue, run meta-review by default on drafting-lane output, and close with a fixed-schema completion comment. Fail-closed; never marks a parent done with an empty deliverable.
metadata:
  sources:
    - path: companies/legal-operations/skills/reconstitution-playbook/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Reconstitution Playbook

Use this skill when you are woken with `PAPERCLIP_WAKE_REASON=issue_children_completed`
— every direct child issue of a matter you own has reached a terminal state (`done` or
`cancelled`) and Paperclip has re-woken you as the parent's assignee. Delegation was the
front half of your job; this skill is the back half. Nothing rolls up on its own: work
products and comments live strictly on the child issues that produced them, and a
`cancelled` child counts as terminal for the wake even though its scope was never done.
Your job is to turn a pile of terminal children into one consolidated deliverable on the
parent issue, with gaps named and review visible.

## What the platform gives you (and does not)

- The wake payload names the parent issue (`issueId`), the child that finished last
  (`completedChildIssueId`), all direct child ids (`childIssueIds`), and per-child
  summaries (`childIssueSummaries` — each child's latest comment, truncated, and capped
  at 20 children with `childIssueSummaryTruncated` set when the cap bites).
- Payload summaries are pointers, not sources. Never synthesize the deliverable from
  them alone — fetch the real comments and work products (Step 2).
- `cancelled` is terminal to the platform but incomplete to the matter. The wake will
  fire even if every child was cancelled. Treating a cancelled child as done is the
  single most likely way to silently ship an incomplete matter — see Step 1.
- The parent is only woken if it is assigned and not in `backlog`/`done`/`cancelled`.
  If you are reading this, the matter is yours and open.

## Procedure

1. **Re-verify and inventory the children.** The wake reflects a moment in time; check
   live state first: `GET /api/companies/{companyId}/issues?parentId={parentIssueId}`.
   - If any child is now **not** `done`/`cancelled` (reopened, or a new child was added
     since the wake), stop: do nothing destructive, post nothing, end the heartbeat.
     The completion wake will fire again when the set is truly terminal.
   - Classify every child: `done` with output, `done` with **no** output (a gap, treated
     exactly like cancelled), or `cancelled` (a gap). A cancelled child's scope is
     **undone** — either re-delegate it now (new child issue, which restarts the clock
     and re-arms the wake) or carry it as an explicit `GAP` line into the completion
     comment with a real disposition: a re-delegated child issue, or a named operator
     follow-up ("operator to decide X"). `GAP: deemed unnecessary` is not a
     disposition. Never present the matter as complete while a child was cancelled
     without disposition.
2. **Collect each done child's outputs.** For every `done` child:
   - `GET /api/issues/{childId}/comments` — the completion comment (what it did, what
     it left open, defaults it applied).
   - `GET /api/issues/{childId}/work-products` — registered deliverables.
   - `GET /api/issues/{childId}/documents` and `GET /api/issues/{childId}/documents/{key}`
     — document bodies (drafts, memos, registers).
   Carry forward each child's own `Defaults used` and open questions — they survive
   into your completion comment, they do not evaporate at the rollup.
3. **Synthesize the consolidated deliverable.** Merge the child outputs into one
   artifact scoped to the parent matter. Assemble, do not rewrite: preserve specialist
   legal analysis verbatim where quality matters — your value at this step is
   selection, ordering, and connective tissue, not re-drafting a specialist's work.
   If two children's outputs **conflict** on substance, do not pick a winner yourself —
   go to Step 4's conflict path.
4. **Meta-review — default on, skipping is visible.**
   - **Conflict path:** if child outputs conflict, create one child issue for
     `debate-judge` (`POST /api/companies/{companyId}/issues` with `parentId` set to
     this issue) carrying both positions and where they diverge. Stop here — leave the
     parent open with a comment marking `Meta-review: pending (<child identifier>)`.
     The adjudication child re-arms the completion wake; you will be woken again when
     it is terminal.
   - **Review path:** if any consolidated content is drafting-lane work product
     destined for the operator, a client, or a court, create **one** child issue for
     `risk-spotter` with the consolidated draft (or a deep link to it) before closing.
     Same mechanics: parent stays open, `Meta-review: pending`, the wake re-arms.
   - **Idempotency — you may BE the post-review wake.** Before creating a review
     child, check the inventory from Step 1: if it already contains your meta-review
     child (`risk-spotter`/`debate-judge`) and it is `done`, review has happened —
     attach its risk register or adjudication memo to the deliverable and proceed.
     Never create a second review child for the same consolidated draft, and never
     send a risk register back to `risk-spotter`. If the operator **cancelled** your
     review child, treat that as an operator waiver: record
     `Meta-review: skipped (review child cancelled by operator)` and proceed —
     do not create a replacement.
   - **Skip conditions (narrow; any skip must be stated):** pure-internal status
     rollups with no drafting-lane content, or the operator explicitly waived review
     on this matter. When skipped, the completion comment MUST say
     `Meta-review: skipped (<reason>)`. A skip nobody can see is a skip that didn't
     have permission.
5. **Hoist the deliverable onto the parent.** The matter root must carry the final
   artifact — never leave it only on a child.
   - Markdown deliverable: `PUT /api/issues/{parentIssueId}/documents/deliverable`
     with `{ "title", "format": "markdown", "body", "baseRevisionId" }` (fetch the
     existing document first and pass its latest `baseRevisionId` when updating), then
     register it: `POST /api/issues/{parentIssueId}/work-products` with
     `{ "type": "document", "provider": "paperclip", "title": "<deliverable title>",
     "summary": "<one-line what/why>", "isPrimary": true }`.
   - External artifact from a child (PR, uploaded file, external URL): re-register it
     on the parent with the same `type`/`provider`/`url`. Note: the work-product `url`
     field must be an absolute URL — omit it for internal artifacts and put the
     `/<prefix>/issues/<identifier>#document-deliverable` deep link in the completion
     comment instead.
   - Idempotent: `GET /api/issues/{parentIssueId}/work-products` first; if a prior
     reconstitution pass already registered the deliverable, update it with
     `PATCH /api/work-products/{workProductId}` rather than duplicating.
   - Include `X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID` on every mutating call, as always.
6. **Leave the completion comment and set status.** Post the fixed schema below (via
   `PATCH /api/issues/{parentIssueId}` with a `comment`, or
   `POST /api/issues/{parentIssueId}/comments`). Then:
   - Meta-review pending → keep the parent `in_progress`; the review child's
     completion re-wakes you. Do not busy-poll, and do not put children in
     `blockedByIssueIds` (a cancelled blocker never resolves; the children-completed
     wake already covers cancellation).
   - Meta-review done or visibly skipped, deliverable hoisted, no undispositioned
     gaps → set the parent `done`. **Cascade note:** your `done` is what makes *your*
     parent's assignee eligible for this same wake — your completion comment is the
     summary the next level reconstitutes from, so make it self-contained.
   - Gaps needing operator input → `blocked` with the unblock owner and action, per
     your normal rules.

## Completion Comment Schema

Use these headings verbatim, in this order, none omitted:

```
Deliverable: <what it is and where it lives — document key, work product, deep link>
Children:
- <identifier> — <done|cancelled> — <one-line contribution, or `GAP: <disposition>`>
Meta-review: <done (register attached) | skipped (<reason>) | pending (<child identifier>)>
Defaults & open questions: <carried forward from children plus your own, or "none">
Next action: <who does what next — "none" only when status is done>
```

## Single-Child Pass-Through

When the matter was delegated whole to one child (the normal Chief-of-Staff case —
one domain lead owns the entire scope, and often the Chief-Counsel case too),
reconstitution is a pass-through, not a synthesis: verify the child is `done` and not
`cancelled` (a cancelled only-child is a wholly-undone matter — re-delegate or block,
never close), hoist or re-register its deliverable on your issue, carry its defaults
and open questions into your completion comment, and close. Step 4 still applies in
the pass-through: if the child's completion comment already says `Meta-review: done`,
carry it forward as `Meta-review: done (inherited from <child>)`; otherwise,
drafting-lane content bound for the operator, a client, or a court gets its
`risk-spotter` child here before you close. The schema comment is
still required — the trivial case is where silent rollups start.

## Fail-Closed Rules

- Live re-check says a child is not terminal → end the heartbeat without destructive
  action. Racing the platform loses.
- A `done` child produced no comment, work product, or document → it is a gap,
  handled exactly like a cancelled child.
- NEVER mark the parent `done` with an empty deliverable. No child output means
  re-delegation or an operator-facing blocked state, not closure.
- Never rewrite specialist legal analysis during synthesis; assemble it.
- Never create more than one meta-review child per consolidated draft, and never
  route a meta-reviewer's own output back into meta-review.
- Every skipped review is a stated skip: `Meta-review: skipped (<reason>)` or it
  didn't happen.

## Cost

Default meta-review adds at most one `risk-spotter` (or `debate-judge`) child per
matter scope — one extra bounded run, not a per-child multiplier. Re-delegating a
cancelled child restarts that child's cost; carrying it as an explicit `GAP` costs
nothing but honesty. Per-agent and per-company `budgetMonthlyCents` remain the hard
backstop.

## Evals

Given a parent matter with three `done` children each carrying a drafting-lane work
product, When the assignee is woken with `issue_children_completed` and runs this
skill, Then a consolidated deliverable exists on the parent (document + registered
work product), exactly one `risk-spotter` child issue is created with the
consolidated draft, the parent stays open with a schema-complete comment reading
`Meta-review: pending (<child identifier>)`, and no child content was rewritten.

Given a parent matter with two `done` children and one `cancelled` child, When the
assignee runs this skill, Then the cancelled child appears in the completion comment
as `GAP` with an explicit disposition (a new re-delegated child issue, or a named
operator follow-up), and the parent is not set `done` while the gap has no
disposition — silent closure over a cancelled child is a failure.

Given two `done` children whose outputs take conflicting substantive positions, When
the assignee runs this skill, Then no self-adjudicated merge is produced; one
`debate-judge` child issue is created carrying both positions, the parent remains
open with `Meta-review: pending`, and synthesis resumes only after the adjudication
child completes and re-fires the wake.
