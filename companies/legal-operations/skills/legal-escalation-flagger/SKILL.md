---
name: legal-escalation-flagger
description: Route a contract issue to the right approver per the operator's escalation matrix and draft the ask so the responsible attorney can decide without rebuilding context.
metadata:
  sources:
    - kind: github
      repo: anthropics/claude-for-legal
      path: commercial-legal/skills/escalation-flagger/SKILL.md
      commit: b0aeeba
      url: https://github.com/anthropics/claude-for-legal/blob/b0aeeba/commercial-legal/skills/escalation-flagger/SKILL.md
      license: Apache-2.0
      attribution: Anthropic, contributors to claude-for-legal
      usage: adapted
---

# Escalation Flagger

Use this skill when a contract issue may exceed the reviewer's authority and someone more senior needs to make the call. The skill names the approver per the operator's escalation matrix, characterizes the issue, and drafts the ask so the responsible attorney can decide from the message alone.

## Purpose

Every contracts practice has an escalation matrix, written or not. This skill reads the written one from the operator's playbook, matches a contract issue against it, names the approver, and drafts the ask so the responsible attorney is not writing "hey do you have a sec" messages at 5pm. The goal is fast, accurate routing with a self-contained decision-ready message.

## Load the Matrix First

Before routing anything, identify three things:

1. **Which side is the operator on?** If the counterparty is a vendor or supplier providing goods or services, the operator is purchasing-side. If the counterparty is a customer buying the operator's product or service, the operator is sales-side. If it is not obvious from the matter context, ask. Read the matching playbook section (sales-side or purchasing-side) to evaluate whether the term is inside fallbacks or triggers automatic escalation — a term that is fine on one side can be a hard-no on the other. Note which side in the drafted ask so the approver knows which playbook was applied.

2. **What does the operator's escalation matrix say?** Read the operator's documented escalation matrix — who can approve what, at what dollar threshold, and which categories of issue automatically escalate regardless of value. If the operator has no documented escalation matrix, surface the gap and ask the responsible attorney how this class of issue should route. Do not invent thresholds.

3. **What does the operator's playbook say about this term?** If the term is squarely within the documented fallback range, no escalation is needed. If it is outside the range or on the "never accept" / "always escalate" list, escalate.

Expected structure of an escalation matrix:

| Can approve | Threshold | Escalates to | Via |
|---|---|---|---|
| Paralegal | Standard terms, <$50K | Counsel | Slack |
| Counsel | Non-standard but within fallbacks, <$500K | GC | Slack or email |
| GC | Everything else | CFO/Board | Meeting |

Plus a list of **automatic escalation triggers** — items that escalate regardless of dollar value. Typically: unlimited liability, IP assignment, anything on the "never accept" list.

## Workflow

### Step 1: Characterize the issue

What is being escalated?

- **Dollar threshold** — contract value exceeds the reviewer's approval authority.
- **Term deviation** — a term is outside the playbook fallbacks; someone more senior needs to decide whether to accept.
- **Automatic trigger** — one of the always-escalate items is present.
- **Business decision** — not a legal call; needs the business owner, not legal leadership.

Do not escalate things that are actually fine. If the term is within the documented fallbacks, it does not need to go up.

### Step 2: Match to the matrix

```
Is the issue an automatic trigger?
  -> YES: escalate to the person named for that trigger
  -> NO: continue

Is the contract value above the reviewer's threshold?
  -> YES: escalate to whoever has authority at that dollar level
  -> NO: continue

Is the term deviation outside all documented fallbacks?
  -> YES: escalate to whoever can approve non-standard terms
  -> NO: reviewer can approve; no escalation needed
```

### Step 3: Name the approver

Be specific. Not "escalate to legal leadership" — name the person or role from the operator's matrix. If the matrix does not name anyone for this situation, say so: "The escalation matrix does not cover [situation]. Suggest asking [GC name] who owns this."

### Step 4: Draft the ask

The approver should be able to decide from the message alone — no "let me pull up the contract."

```markdown
**Escalating to:** [name]
**Via:** [Slack channel / email / meeting — per the operator's matrix]
**Urgency:** [deadline, if there is one]

---

Hey [name],

Need your call on the [Counterparty] [agreement type]. [One sentence on deal context.]

**Which side:** [sales-side / purchasing-side]

**The issue:** [Plain English, one paragraph. What they want, why it is outside our standard, what the risk actually is.]

**What the contract says:**
> "[exact quote]"

**What our playbook says:** [quote from the operator's playbook]

**Options:**
1. **Accept** — [one line on why this might be okay]
2. **Push back with:** "[proposed counter-language]" — [one line on likely counterparty reaction]
3. **Walk** — [one line on whether that is realistic given the business context]

**My recommendation:** [which option and why, briefly]

**Need a decision by:** [date, if there is a deadline]

[Link to full review memo]
```

### Step 5: Record the escalation

If the operator uses a ticket system or CLM approval workflow, log the escalation there. If not, note in the review memo that the escalation was sent, to whom, and when. The next person who reads the memo should see the status.

## Calibration: When in Doubt, Escalate with a Note

The cost of an unnecessary escalation is roughly thirty seconds of the approver's time — they read, say "fine, proceed," and the record shows they saw it. The cost of a missed escalation is signing an unapproved term, which is a one-way door. The costs are not symmetric. **When in doubt, escalate.**

The calibration for what warrants escalation lives in the operator's playbook, not in this skill. Check the playbook's stated position, its fallbacks, and its "automatic escalation regardless of dollar value" list:

- **Clearly inside the fallback range** — no escalation needed.
- **Clearly outside the range, or on the automatic-escalation list** — escalate.
- **Uncertain — the term is ambiguous, novel, or arguably inside the range but the argument is a stretch** — escalate anyway and flag the uncertainty explicitly. The draft surfaces the specific question the approver needs to decide and why the skill could not confidently place it inside the fallback. The approver narrows; the skill does not.

Do not suppress an escalation because over-escalation might train approvers to skim. That is an approver-experience problem the attorney solves by adjusting thresholds in the playbook, not a problem the skill solves by making its own subjective call on a term it is uncertain about.

If a term comes up that the playbook does not address, do not guess the threshold — ask the reviewing attorney whether this class of issue should escalate, and offer to record the answer in the operator's playbook so future reviews are consistent.

## What This Skill Does Not Do

- It does not approve anything. It routes.
- It does not decide between the options. The draft includes a recommendation but the approver decides.
- It does not send the escalation message — it drafts it. The responsible attorney sends it after reading.

## Evals

**Given** a purchasing-side MSA with $250K total contract value and a customer non-solicit clause that falls inside the operator's documented purchasing-side fallback range,
**When** the skill runs,
**Then** the output reports "no escalation needed — within documented fallbacks" with a one-line citation to the playbook section and does not draft an approver message.

**Given** a sales-side MSA where the customer has demanded uncapped indemnity for IP infringement and the operator's playbook lists uncapped indemnity on the "automatic escalation regardless of dollar value" list,
**When** the skill runs,
**Then** the output names the specific approver from the matrix for this trigger, drafts a self-contained ask quoting the offending language and the playbook position, presents accept/push-back/walk options with a recommendation, and includes a decision-by date if the deal context supplies one.

**Given** a contract issue type that the operator's escalation matrix does not address at all (for example, a novel data-processing addendum that does not map to any documented category),
**When** the skill runs,
**Then** the output flags that the matrix does not cover this class of issue, escalates conservatively to the named GC (or equivalent) with the uncertainty surfaced explicitly, and offers to record the GC's answer back into the operator's playbook so future reviews are consistent — it does not silently invent a threshold.
