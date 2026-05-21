# Add a Workflow

This guide shows how to add a new workflow to PossibLaw. Workflows are YAML pipeline definitions that compose step kinds into a routing sequence.

> **DISCLAIMER: PossibLaw does not practice law. Treat all workflow output as a starting point for licensed-lawyer review.**

---

## What is a workflow?

A workflow is a YAML file under `layer/workflows/` that defines the pipeline steps a matter travels through — routing, specialist dispatch, tests, and guardrails.

Workflows are selected at run time: `bin/possiblaw run <workflow-name> "<matter>"`.

---

## Step kinds

| Step kind | What it does |
|---|---|
| `route` | Calls a router or lead agent to decide the next agent |
| `specialist` | Calls the specialist determined by the router chain |
| `parallel` | Calls the specialist N times with diverse temperatures; outputs a `BranchOutput[]` |
| `reconcile` | Calls a reconciler agent to merge N parallel outputs into one deliverable |
| `debate` | Multi-round adversarial exchange between two agents; judge synthesizes verdict |
| `test` | Runs a named test suite (soft — retryable) |
| `guardrail` | Runs a named guardrail suite (hard — always escalates on hit) |

---

## Step 1 — Create the workflow file

Workflow files live under `layer/workflows/`. Name it `<workflow-name>.yaml`.

### Minimal workflow (route → specialist → test → guardrail)

```yaml
name: quick-lease-review
description: Fast turnaround lease review for low-stakes matters
router: chief-counsel
pipeline:
  - step: route
    agent: chief-counsel
  - step: route
    agent: <determined-by-previous-step>
  - step: specialist
    agent: <determined-by-router-chain>
  - step: test
    suite: [groundedness]
  - step: guardrail
    suite: [signed-document]
on_test_failure: retry_with_better_model_then_escalate
on_guardrail_hit: escalate_to_human
```

### Parallel-branch workflow (route → 3× parallel → reconcile → test → guardrail)

```yaml
name: deep-lease-review
description: High-stakes lease review. Three parallel drafts reconciled into one.
router: chief-counsel
pipeline:
  - step: route
    agent: chief-counsel
  - step: route
    agent: <determined-by-previous-step>
  - step: parallel
    count: 3
    temperatures: [0.2, 0.7, 1.0]
    resolved_by: router
  - step: reconcile
    agent: reconciler
  - step: test
    suite: [groundedness, scope-adherence]
  - step: guardrail
    suite: [signed-document]
on_test_failure: retry_with_better_model_then_escalate
on_guardrail_hit: escalate_to_human
```

### Debate workflow (route → debate → guardrail)

```yaml
name: lease-stress-test
description: Adversarial lease review. nda-drafter defends; risk-spotter attacks; judge decides.
router: chief-counsel
pipeline:
  - step: route
    agent: chief-counsel
  - step: route
    agent: <determined-by-previous-step>
  - step: debate
    participants: [lease-drafter, risk-spotter]
    rounds: 3
    judge: debate-judge
  - step: guardrail
    suite: [signed-document]
on_guardrail_hit: escalate_to_human
```

---

## Step 2 — Validate the workflow file

Workflows are loaded by `cli/loader.ts` using `js-yaml`. A malformed YAML file will cause the `run` command to fail with a parse error. Check yours with:

```bash
node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('layer/workflows/quick-lease-review.yaml','utf8'));console.log('ok')"
```

---

## Step 3 — Build and verify

```bash
pnpm build

# Show the pipeline shape and estimated cost
bin/possiblaw workflows show quick-lease-review

# Run in offline mode
env -u ANTHROPIC_API_KEY bin/possiblaw run quick-lease-review \
  "review a 5-year commercial lease for ACME Corp"
```

Expected output from `workflows show`:

```
Workflow: quick-lease-review
  Description: Fast turnaround lease review for low-stakes matters
  Router: chief-counsel
  Steps: route → route → specialist → test:groundedness → guardrail:signed-document
  Failure policy: retry_with_better_model_then_escalate / escalate_to_human
  Estimated cost (typical): $0.02–0.05 per run
```

List all workflows to confirm yours appears:

```bash
bin/possiblaw workflows list
```

---

## Step 4 — Reference: failure policies

| Policy | Meaning |
|---|---|
| `retry_with_better_model_then_escalate` | On test failure: retry with `fallback_model`, then escalate to human if still failing |
| `escalate_to_human` | On guardrail hit: always escalate; no retry |
| `route_to:<agent>` | On failure: reroute matter to a named agent |

---

## Checklist

- [ ] Workflow YAML created under `layer/workflows/`.
- [ ] `name` field matches filename (without `.yaml`).
- [ ] All agents referenced in `pipeline` steps exist in the layer.
- [ ] All test and guardrail names reference files in `layer/tests/` and `layer/guardrails/`.
- [ ] `pnpm build` passes.
- [ ] `bin/possiblaw workflows show <name>` renders without error.
- [ ] Offline run produces expected output.
