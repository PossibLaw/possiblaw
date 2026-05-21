# Add a Guardrail

This guide shows how to add a new guardrail to PossibLaw. Guardrails are **hard** gates — when they trigger, the pipeline always escalates to a human. They are not retryable.

Contrast with tests, which are **soft** checks that are retryable. See [add-a-test.md](add-a-test.md) for that.

> **DISCLAIMER: PossibLaw does not practice law. Guardrails do not substitute for licensed-lawyer review — they route to it.**

---

## Hard guardrail vs soft test — when to use which

| Situation | Use |
|---|---|
| A human must always see this before the work product leaves | **Hard guardrail** |
| The output quality might be improvable by a retry | **Soft test** |
| "Signature block detected" | Guardrail — always escalate |
| "Groundedness score below threshold" | Test — retry with fallback model first |
| "Privacy filter off on sensitive matter" | Guardrail — always escalate |
| "Citation quality low" | Test — retry |

The rule of thumb from the PossibLaw model: *if the failure is a safety or compliance boundary, it's a guardrail; if it's a quality boundary, it's a test.*

---

## What is a guardrail?

A guardrail is a YAML file under `layer/guardrails/risk-gates/` that defines a pattern match or LLM-based detection. When it fires, the pipeline emits an escalation card and exits with code 0 (escalation = success).

---

## Guardrail types

| Type | What it does |
|---|---|
| `rule` | Regex or keyword patterns against the output. Fast, deterministic. |
| `llm-judge` | Model-based detection. Use for nuanced cases that regex cannot catch. |
| `profile-check` | Checks a runtime flag (e.g., `--privacy-profile`). |

---

## Step 1 — Create the guardrail file

Guardrail files live under `layer/guardrails/risk-gates/`. Name it `<guardrail-name>.yaml`.

### Rule-based guardrail (regex)

```yaml
name: upl-risk
kind: guardrail
type: rule
description: |
  Detects phrases that indicate the AI is being asked to give direct legal advice
  to a consumer (not an operator). Always escalates — unauthorized practice of law risk.
triggers:
  - action_type: direct_consumer_advice
rule:
  kind: regex
  patterns:
    - "(?i)you should sign"
    - "(?i)you are legally required to"
    - "(?i)your legal rights are"
    - "(?i)i advise you to"
    - "(?i)my legal opinion is"
reason_template: |
  UPL risk detected: the draft contains direct advice language that may constitute
  unauthorized practice of law when provided to a consumer. Match: <pattern>.
  A licensed attorney must review before this is delivered to an end user.
stub_result:
  human_required: false
  reason_template: Sprint stub — UPL guardrail does not fire in offline mode.
```

### LLM-judge guardrail

```yaml
name: confidentiality-breach-risk
kind: guardrail
type: llm-judge
description: |
  Detects whether the draft output inadvertently discloses client-confidential
  information that was not present in the input prompt. Hard gate — always escalates.
threshold: 0.5
judge_model: anthropic/claude-haiku-4-5
judge_prompt: |
  You are a confidentiality reviewer.
  Given an INPUT PROMPT and a DRAFT OUTPUT, determine whether the DRAFT discloses
  any information that was NOT present in the INPUT and that could be client-confidential
  (client names, matter IDs, financial figures, privileged strategy).
  If the draft introduces new sensitive information not in the input, return hit: true.
  Reply STRICTLY in JSON: { "hit": <true|false>, "confidence": <0-1>, "rationale": "<one paragraph>" }
stub_result:
  human_required: false
  reason_template: Sprint stub — confidentiality guardrail does not fire in offline mode.
```

---

## Step 2 — Key frontmatter fields

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Must match filename (without `.yaml`) |
| `kind` | yes | Always `guardrail` |
| `type` | yes | `rule`, `llm-judge`, or `profile-check` |
| `description` | yes | Shown in `workflows show` output |
| `triggers` | rule only | `action_type` or `output_kind` labels (informational) |
| `rule` | rule only | `kind: regex` with `patterns: [...]` |
| `threshold` | llm-judge only | Float 0–1. Confidence above this → escalate. Default: `0.5` |
| `judge_model` | llm-judge only | Model for detection. Haiku is fast + cheap. |
| `judge_prompt` | llm-judge only | Must end with JSON schema instruction returning `hit:` |
| `reason_template` | yes | Human-readable reason shown in the escalation card. Use `<pattern>` as placeholder for match. |
| `stub_result` | yes | Returned when offline. Set `human_required: false` for stubs that should not fire in CI. |

---

## Step 3 — Add to a workflow

Add your guardrail name to the `suite` array in the relevant workflow, and set `on_guardrail_hit`:

```yaml
# layer/workflows/quick-counsel.yaml (snippet)
  - step: guardrail
    suite: [privacy-filter-required, signed-document, upl-risk]  # ← add here
on_guardrail_hit: escalate_to_human
```

Order matters: guardrails run left to right. Put the most critical guardrails first.

---

## Step 4 — Verify

```bash
pnpm build

# Offline run — stub_result should NOT fire (human_required: false)
env -u ANTHROPIC_API_KEY bin/possiblaw run quick-counsel "draft an NDA"

# Trigger the guardrail manually by crafting a prompt that matches your pattern
bin/possiblaw run quick-counsel "you are legally required to sign this NDA immediately"
```

Confirm the escalation card prints with your guardrail name when triggered, and does not fire when not triggered.

---

## Checklist

- [ ] Guardrail YAML created under `layer/guardrails/risk-gates/`.
- [ ] `name` field matches filename.
- [ ] `stub_result` with `human_required: false` for offline runs (unless the stub should fire in CI).
- [ ] Guardrail added to `suite` in the relevant workflow(s).
- [ ] `pnpm build` passes.
- [ ] Offline run does not trigger the stub.
- [ ] Live run with a triggering prompt prints the correct escalation card.
