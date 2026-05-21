# PossibLaw Workflow Schema Reference

Sprint 8 extends the pipeline YAML schema with three new step kinds: `parallel`, `reconcile`, and `debate`. This document is the authoritative schema reference.

---

## Workflow YAML structure

```yaml
name: <workflow-name>           # machine identifier; matches the filename
description: <string>           # human-readable summary
router: <agent-name>            # entry-point agent (router or chief-of-staff)
pipeline:                       # ordered list of pipeline steps
  - step: route
    agent: <agent-name>
  - step: parallel
    count: 3
    temperatures: [0.2, 0.7, 1.0]
    resolved_by: router
  - step: reconcile
    agent: reconciler
  - step: debate
    participants: [agent-a, agent-b, agent-c]
    rounds: 3
    judge: debate-judge
  - step: test
    suite: [groundedness, scope-adherence]
  - step: guardrail
    suite: [signed-document]
on_test_failure: retry_with_better_model_then_escalate
on_guardrail_hit: escalate_to_human
```

---

## Step kinds

### `route`

Runs a router or lead agent on the matter prompt. The agent must output a `ROUTE_TO: <name>` directive. The pipeline runner follows the chain until it resolves a specialist.

```yaml
- step: route
  agent: chief-counsel
```

### `specialist`

Runs a specific specialist agent on the matter prompt. Used in simple single-specialist workflows.

```yaml
- step: specialist
  agent: nda-drafter
```

### `parallel`

Runs the router-resolved specialist `count` times in parallel, each with a different temperature from the `temperatures` list. Outputs are collected as an array for the subsequent `reconcile` step.

```yaml
- step: parallel
  count: 3
  temperatures: [0.2, 0.7, 1.0]
  resolved_by: router
```

- `count` — number of parallel branches (default: 3).
- `temperatures` — list of floating-point temperatures, one per branch. If the list is shorter than `count`, the last temperature is reused.
- `resolved_by: router` — indicates the specialist identity is determined by the router chain (current behavior; future versions may support explicit agent lists).

In **offline mode**, all branches run against the same deterministic fixture, producing identical outputs. This is acceptable for offline testing; document it to operators.

### `reconcile`

Receives the array of parallel outputs from the preceding `parallel` step, formats them as labeled blocks, and passes them to the reconciler agent for synthesis.

```yaml
- step: reconcile
  agent: reconciler
```

- `agent` — the reconciler agent name. Must exist in `layer/agents/`. Recommended: `reconciler` (`layer/agents/specialists/legal/_meta/reconciler.md`).
- The reconciler receives the prompt: original user prompt + labeled blocks + synthesis instruction.
- The reconciler's output becomes the deliverable for subsequent `test` and `guardrail` steps.

### `debate`

Runs a heterogeneous set of specialists through N rounds of adversarial exchange, then passes the full transcript to a judge agent for a final verdict.

```yaml
- step: debate
  participants: [nda-drafter, risk-spotter]
  rounds: 3
  judge: debate-judge
```

- `participants` — list of specialist agent names. Any mix of domains is allowed.
- `rounds` — number of exchange rounds (default: 3). Round 1: each participant receives the original prompt. Rounds 2+: each participant receives the original prompt + all other participants' previous-round positions.
- `judge` — agent name for the final synthesis step. Receives the full transcript and writes `## Verdict`, `## Dissent`, `## Risks`.

### `test`

Runs a suite of named tests against the current deliverable. Tests are defined in `layer/tests/<name>.yaml`.

```yaml
- step: test
  suite: [groundedness, scope-adherence, citation-required]
```

On test failure, the `on_test_failure` policy applies:
- `retry_with_better_model_then_escalate` — re-runs the specialist with the fallback model, then escalates if still failing.
- `escalate_to_human` — escalates immediately.

### `guardrail`

Runs a suite of named guardrails against the deliverable. Guardrails are defined in `layer/guardrails/<name>.yaml`.

```yaml
- step: guardrail
  suite: [signed-document, privacy-filter-required]
```

On guardrail hit, the `on_guardrail_hit` policy applies. Currently only `escalate_to_human` is supported.

---

## Workflow catalog (Sprint 8)

| Name | Shape | Description |
|---|---|---|
| `quick-counsel` | router → specialist → tests → guardrails | Fast turnaround for low-stakes legal matters |
| `quick-counsel-with-cos` | router → specialist → tests → guardrails | Same as quick-counsel via Chief of Staff |
| `quick-invoice-review` | router → specialist → tests → guardrails | Draft or review a client invoice |
| `quick-intake-reply` | router → specialist → tests | Design a new-client intake form |
| `quick-pitch-polish` | router → specialist → tests | Polish pitch deck sections or pitch emails |
| `quick-expense-categorize` | router → specialist | Categorize expenses (no tests needed) |
| `deep-review` | router → 3× parallel → reconcile → tests → guardrails | High-stakes: 3 parallel drafts reconciled into one |
| `stress-test` | router → debate(2p, 3r) → guardrails | Adversarial stress-test of a draft |
| `roundtable` | router → debate(3p, 3r) → guardrails | Cross-surface review (legal + finance + marketing) |

---

## Meta-agents (`layer/agents/specialists/legal/_meta/`)

Workflow primitive agents that are not domain specialists. They serve as structural nodes in the pipeline.

| Agent | Model | Purpose |
|---|---|---|
| `reconciler` | claude-opus-4-7 | Merges N parallel drafts into a single deliverable |
| `debate-judge` | claude-opus-4-7 | Synthesizes a debate transcript into verdict + dissent + risks |
| `risk-spotter` | claude-sonnet-4-6 | Adversarial analysis: worst-case scenarios, missing clauses |

---

## Extending the schema

To add a new step kind:

1. Add the variant to `PipelineStep` in `cli/types.ts`.
2. Implement the handler in `cli/pipeline.ts` (detect the step, run agents, update `deliverable`).
3. Add an offline fixture for any new agents in `cli/anthropic.ts` → `offlineFixture()`.
4. Document the step kind here.
