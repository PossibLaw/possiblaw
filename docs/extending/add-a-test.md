# Add a Test

This guide shows how to add a new test to PossibLaw. Tests are **soft** quality checks — they are retryable and do not prevent delivery on first failure (depending on the workflow's `on_test_failure` policy).

Contrast with guardrails, which are **hard** gates that always escalate. See [add-a-guardrail.md](add-a-guardrail.md) for that.

> **DISCLAIMER: PossibLaw does not practice law. Tests do not substitute for licensed-lawyer review.**

---

## What is a test?

A test is a YAML file under `layer/tests/` that defines a quality check run after the specialist produces a deliverable. Tests return `pass: true/false` and a `score: 0–1`.

Failure behavior is controlled by the workflow's `on_test_failure` policy, not by the test file. Common policy: `retry_with_better_model_then_escalate`.

---

## Test types

| Type | What it does |
|---|---|
| `llm-judge` | Calls a model to score the output against a `judge_prompt`. The model returns JSON: `{ "pass": <bool>, "score": <0-1>, "rationale": "<text>" }` |
| `rule` | Runs regex or keyword rules against the output. Deterministic. No model call. |
| `stub` | Always returns `stub_result`. Used in CI / offline mode. |

---

## Step 1 — Create the test file

Test files live under `layer/tests/`. Name it `<test-name>.yaml`.

### LLM-judge test

```yaml
name: citation-required
kind: test
type: llm-judge
description: |
  Checks whether the draft cites at least one authority (case, statute, or regulation)
  when the matter involves a legal question. Returns soft pass/fail; retry-eligible.
threshold: 0.8
judge_model: anthropic/claude-haiku-4-5
judge_prompt: |
  You are a legal-output reviewer evaluating CITATION QUALITY only.
  Given a USER REQUEST and a DRAFT, assess: when the request involves a legal question
  (contract enforceability, statutory compliance, regulatory filing), does the DRAFT
  cite at least one authority — a case, a statute section, or a regulation number?
  If the request is purely drafting (e.g., "draft an NDA") with no legal question,
  return pass: true automatically.
  Reply STRICTLY in JSON: { "pass": <true|false>, "score": <0-1>, "rationale": "<one paragraph>" }
stub_result:
  pass: true
  score: 0.90
  rationale: Sprint stub — returns pass. Replace with real judge when live evals are configured.
```

### Rule-based test

```yaml
name: disclaimer-present
kind: test
type: rule
description: |
  Checks that the deliverable includes the PossibLaw disclaimer. Deterministic.
rule:
  kind: regex
  patterns:
    - "(?i)possiblaw disclaimer"
    - "(?i)does not constitute legal advice"
stub_result:
  pass: true
  rationale: All offline stubs include the disclaimer.
```

---

## Step 2 — Key frontmatter fields

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Must match filename (without `.yaml`) |
| `kind` | yes | Always `test` |
| `type` | yes | `llm-judge`, `rule`, or `stub` |
| `description` | yes | Shown in `workflows show` output |
| `threshold` | llm-judge only | Float 0–1. Score below this → fail. Default: `0.9` |
| `judge_model` | llm-judge only | Model to use for scoring. Haiku is recommended (fast + cheap). |
| `judge_prompt` | llm-judge only | Instruction for the judge. Must end with the JSON schema instruction. |
| `rule` | rule type only | `kind: regex` with `patterns: [...]` |
| `stub_result` | yes | Returned when offline or `--dry-run`. Must include `pass:` and `rationale:`. |

---

## Step 3 — Calibration

Before shipping a new LLM-judge test, run it on known-good and known-bad samples to set the `threshold` accurately.

Use the eval harness:

```bash
pnpm build
node dist/cli/index.js eval --dataset cuad --workflow quick-counsel --sample-size 10 --dry-run
```

In dry-run mode the judge is called with fixtures. Compare `score` values against your threshold. A threshold that passes 90% of real good drafts and fails 80% of bad drafts is well-calibrated.

For the Sprint 2 groundedness reference model, see [docs/test-and-guardrail-model.md](../test-and-guardrail-model.md).

---

## Step 4 — Add to a workflow

Add your test name to the `suite` array in the relevant workflow:

```yaml
# layer/workflows/quick-counsel.yaml (snippet)
  - step: test
    suite: [groundedness, citation-required]  # ← add here
```

---

## Step 5 — Verify

```bash
pnpm build

# Run offline — stub_result should fire
env -u ANTHROPIC_API_KEY bin/possiblaw run quick-counsel "draft an NDA"

# Show the test in the workflow shape
bin/possiblaw workflows show quick-counsel
```

Confirm the output includes `test:citation-required` in the step list.

---

## Checklist

- [ ] Test YAML created under `layer/tests/`.
- [ ] `name` field matches filename.
- [ ] `stub_result` with `pass: true` defined for offline runs.
- [ ] Test added to the `suite` array in the relevant workflow(s).
- [ ] `pnpm build` passes.
- [ ] Offline run shows the test step in output.
- [ ] (For llm-judge) Threshold calibrated against sample outputs.
