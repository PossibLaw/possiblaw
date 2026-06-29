# Matter Intake & Delegation

How a matter flows through PossibLaw: **you state the matter; the delegator decides the rest.** You should never hand-pick a practice lead, a specialist, or a model — that is the `chief-of-staff` delegator's job.

## The mental model

PossibLaw's whole thesis is agentic decomposition: a human describes the work, the **Chief of Staff** (the top-level intake + coordination agent) classifies it and **delegates via child issues** down the org chart (`chief-of-staff` → `chief-counsel` → practice lead → specialist), and the result is reconstituted and reviewed back up. You operate the *top* of that chain, not the inside of it.

## The 3-step flow

1. **Create an issue** describing the matter (title + a plain-language description). Put it in **To Do** — not Backlog (see "the trigger" below).
2. **Assign it to `Chief of Staff`.** That's the only assignment you make.
3. **Chief of Staff takes it from there** — it classifies the matter by business domain and creates child issues for the right lead (legal → `chief-counsel`, finance → `finance-lead`, marketing → `marketing-lead`, ops → `ops-lead`, etc.), who route further to specialists. Work flows back up as comments, child-issue summaries, and work products.

## Who decides each field on the issue form

paperclip's issue form exposes its standard fields (assignee, project, model, …). Because PossibLaw is **layer-not-fork** (it never modifies paperclip's UI), those raw fields are always shown — but here is what you should actually do with them:

| Field | Who decides | What you do |
|---|---|---|
| **Assignee** | **The delegator** | Assign **only `Chief of Staff`**. Do **not** pick a practice lead or specialist — Chief of Staff routes those via child issues. |
| **Model** | **Set at import**, per agent | Leave it. Each agent already runs on the model its lane was assigned by the variant (`variants.yaml` `modelLane` map). The per-issue model override is a paperclip-level knob you can ignore. |
| **Project** | **You** (optional) | A grouping bucket (client / matter folder). Optional and purely organizational — not a delegation decision. |
| **Status** | **You** | Create it in **To Do** (or any non-Backlog status) so the assignment trigger fires. |

## The trigger (why To Do, not Backlog)

paperclip auto-runs an assigned agent on assignment — *unless* the issue has no assignee or is in **Backlog**:

```js
// paperclip/server/src/routes/issues.ts
const assignmentWakeSkipped = !issue.assigneeAgentId || issue.status === "backlog";
```

So **assigning `Chief of Staff` to a To Do issue automatically wakes it** — no manual "run" step. An unassigned issue wakes no one; a Backlog issue stays parked even when assigned. That is why intake is "create in To Do → assign Chief of Staff."

## What Chief of Staff does with it

Chief of Staff is intake + routing only — it does not draft or give substantive advice itself. Its routing table (from its `AGENTS.md`):

- **Legal** (contracts, NDAs, compliance, litigation, IP, employment, regulatory, corporate) → child issue for `chief-counsel`
- **Finance / billing / expenses** → `finance-lead`
- **Marketing / content / intake forms** → `marketing-lead`
- **Admin / scheduling / meeting prep** → `admin-lead`
- **Business development / pitches / RFPs** → `bd-lead`
- **Ops** (vendor onboarding, SOPs, conflicts screening, engagement letters, cloud delivery) → `ops-lead`
- **Legal ops** (outside-counsel terms, invoice audits, spend reporting) → `legal-ops-lead`
- **Out of slice** → a clear operator-facing escalation comment (it will not invent agents)

When it needs a fact from you, it raises a `missing-info-gate` BLOCKED comment (and a Slack/Teams notification if a webhook is configured).

## Auto-intake (drop-in-To-Do, no manual assignment)

If you would rather just **drop an unassigned issue into To Do and have the delegator pick it up**, that is the `matter-intake-sweep` routine: a scheduled sweep that finds unassigned To Do issues and hands each to Chief of Staff, which then delegates. Like the other package routines (`learning-sweep`, `delivery-sweep`), it is declared as intent in `.paperclip.yaml`; the operator enables/schedules it in the paperclip routines UI. See the routine's skill for the exact cadence and behavior.

> **Cost note:** every intake spawns a Chief-of-Staff run plus the downstream delegation chain. Keep the sweep cadence sane (the default is conservative) and rely on per-agent/company budgets as the backstop.
