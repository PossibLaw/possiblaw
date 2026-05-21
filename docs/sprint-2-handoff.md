# Sprint 2 Handoff — Interface Contracts

## Purpose

Sprint 1a delivered a working end-to-end pipeline with deterministic stub implementations of tests and guardrails. Sprint 2 will replace those stubs with real implementations: a groundedness evaluator and a signed-document guardrail that inspect actual LLM output.

This document specifies the contracts that Sprint 2 must implement against. All interfaces reference existing types in `cli/types.ts` unless otherwise noted. Sprint 2's implementors must not change these interface shapes without an architecture decision record in `docs/ARCHITECTURE.md`.

---

## Test-Runner Interface

### Input

```typescript
interface TestRunnerInput {
  /** The matter context: workflow name, user prompt, and run settings. */
  context: RunContext;                // from cli/types.ts
  /** The specialist's draft output to evaluate. */
  draft: string;
  /** The test configuration loaded from layer/tests/<name>.yaml. */
  config: TestConfig;                 // from cli/types.ts
}
```

### Output

```typescript
interface TestResult {
  /** Whether the draft passed the test. */
  pass: boolean;
  /** Optional numeric score (0.0–1.0). Required if config.threshold is set. */
  score?: number;
  /** Human-readable rationale for the pass/fail decision. */
  rationale: string;
}
```

### Failure-Handling Hook Signature

```typescript
type TestFailureHandler = (
  failedTest: TestConfig,
  result: TestResult,
  context: RunContext
) => Promise<TestFailureAction>;

type TestFailureAction =
  | { action: 'retry_with'; model: string }
  | { action: 'escalate_to'; target: 'human' }
  | { action: 'route_to'; agent: string };
```

The handler is invoked when `result.pass === false`. The workflow field `on_test_failure` maps to the built-in handler behaviour (e.g., `retry_with_better_model_then_escalate`). Sprint 2 may implement this as a configurable dispatch table.

---

## Guardrail-Runner Interface

### Input

```typescript
interface GuardrailRunnerInput {
  /** The matter context: workflow name, user prompt, and run settings. */
  context: RunContext;                // from cli/types.ts
  /** The specialist's draft output to evaluate. */
  draft: string;
  /** The guardrail configuration loaded from layer/guardrails/**/<name>.yaml. */
  config: GuardrailConfig;           // from cli/types.ts
}
```

### Output

```typescript
interface GuardrailResult {
  /** Whether human review is required before delivery. */
  human_required: boolean;
  /** Explanation of why the guardrail fired (or didn't). */
  reason: string;
}
```

### Escalation Hook Signature

```typescript
type GuardrailEscalationHandler = (
  firedGuardrail: GuardrailConfig,
  result: GuardrailResult,
  context: RunContext
) => Promise<GuardrailEscalationAction>;

type GuardrailEscalationAction =
  | { action: 'escalate_to'; target: 'human' }
  | { action: 'route_to'; agent: string };
```

The handler is invoked when `result.human_required === true`. The workflow field `on_guardrail_hit` maps to the built-in escalation behaviour (e.g., `escalate_to_human`).

---

## Failure-Handling Hooks

Three named hook types are used across test failures and guardrail escalations. Each maps to a typed action:

### `retry_with: <model>`

```typescript
interface RetryWithAction {
  action: 'retry_with';
  /** Model string in provider/name format (e.g., "anthropic/claude-opus-4-7"). */
  model: string;
}
```

Instructs the runner to re-invoke the specialist (or the failing agent) using the specified model, then re-run the test or guardrail. Sprint 2 should cap retries at 1 to avoid unbounded loops.

### `escalate_to: human`

```typescript
interface EscalateToHumanAction {
  action: 'escalate_to';
  target: 'human';
}
```

Terminates the pipeline with `status: 'escalated'` and surfaces the matter for human review. The `RunReport.escalationReason` field carries the rationale.

### `route_to: <agent>`

```typescript
interface RouteToAgentAction {
  action: 'route_to';
  /** Agent name as defined in layer/agents/**/<name>.md frontmatter. */
  agent: string;
}
```

Re-routes the matter to a different agent (e.g., a more senior specialist or a review agent). The re-routed agent's output is then re-evaluated against the same test/guardrail suite.

---

## Audit Log

### Shape (JSONL — one JSON object per line)

```typescript
interface AuditLogEntry {
  /** ISO 8601 timestamp. */
  ts: string;
  /** Matter identifier (derived from workflow name + run timestamp). */
  matter_id: string;
  /** Agent name that produced this entry. */
  agent: string;
  /** Model string (provider/name) used for this call. */
  model: string;
  /**
   * SHA-256 hex digest of the prompt sent to the model.
   * For privileged matters, this is the ONLY record of the prompt;
   * the plaintext is not stored. Rehydrate via Sprint 4 key store.
   */
  prompt_hash: string;
  /**
   * SHA-256 hex digest of the model output.
   * Same privacy rule: hash-only for privileged matters.
   */
  output_hash: string;
  /** TestResult[] for this step, or null if no tests ran. */
  test_results: TestResult[] | null;
  /** GuardrailResult[] for this step, or null if no guardrails ran. */
  guardrail_results: GuardrailResult[] | null;
  /** Pipeline step label (e.g., "route:chief-counsel", "specialist:nda-drafter"). */
  step: string;
  /** Label of the parent step that triggered this one, or null for the first step. */
  parent_step: string | null;
}
```

### File Location

```
layer/audit/<matter-id>.jsonl
```

One file per matter run. Each event appended as a single line. The file must never be rewritten in place — only append.

### Privacy Notes

- For **privileged matters** (attorney-client communications, work product): store `prompt_hash` and `output_hash` only. Do not store plaintext prompt or output in the audit log.
- Plaintext rehydration requires the Sprint 4 key store. The key store API is `UNCONFIRMED` and will be documented in Sprint 4.
- The Privacy Filter detector (plan §11.4, resolving Sprint 2–3) determines at runtime whether a matter is privileged. Until it is implemented, Sprint 2 may treat all matters as non-privileged and store plaintext in a `prompt` field alongside the hash — Sprint 3 will remove the plaintext field for privileged matters.

---

## Breaking Changes Sprint 2 Will Introduce

Sprint 2's real test/guardrail runners will require updates to the existing `RunReport` type and the call sites that consume it.

### `RunReport` additions (`cli/types.ts`)

```typescript
interface RunReport {
  // ... existing fields ...
  /** All test results from Phase 3, populated by real test runners in Sprint 2. */
  test_results: TestResult[];
  /** All guardrail results from Phase 4, populated by real guardrail runners in Sprint 2. */
  guardrail_results: GuardrailResult[];
  /** Path to the audit log file for this run. */
  audit_log_path: string;
}
```

### Call sites requiring updates

- **`cli/pipeline.ts`** — Phase 3 (tests) and Phase 4 (guardrails) currently short-circuit on `type: 'stub'`. Sprint 2 must dispatch to real runner functions and populate `test_results` / `guardrail_results` on `RunReport`. The `type: stub` short-circuit block (lines 154–158 and 187–190 as of Sprint 1a) must be replaced.
- **`cli/printer.ts`** — The report printer will need to render `test_results` and `guardrail_results` when present. Currently it only renders pass/fail flags from `RunStepResult`.
- **`cli/pipeline.ts` — MAX_HOPS** — The hard-coded `MAX_HOPS = 3` blocks the `quick-counsel-with-cos` workflow, which requires 3 router/lead hops before reaching the specialist. Sprint 2 should either raise this to 4 or make it a workflow-level configuration field (e.g., `max_hops: 4` in the YAML). Until this is fixed, `quick-counsel-with-cos` will error at the third hop and the Chief of Staff prototype cannot be validated end-to-end.
- **`cli/anthropic.ts` — offline fixture for `chief-of-staff`** — The `OFFLINE_FIXTURES` map in `cli/anthropic.ts` has no entry for `chief-of-staff`. In offline mode the fallback returns `[OFFLINE STUB for chief-of-staff]` with no `ROUTE_TO` directive, causing the pipeline to error before the routing chain can proceed. Sprint 2 must add: `'chief-of-staff': 'ROUTE_TO: chief-counsel\nRationale: Incoming matter is a legal request; routing to the legal domain router.'` to `OFFLINE_FIXTURES`.

---

## Stubs to Delete in Sprint 2

The following stub artefacts are placeholders and must be replaced (not deleted outright — replace the stub logic with real implementation):

| File | What to remove/replace |
|---|---|
| `layer/tests/groundedness.yaml` | The `stub_result` block and `type: stub` field. Replace with real evaluator configuration. |
| `layer/guardrails/risk-gates/signed-document.yaml` | The `stub_result` block and `type: stub` field. Replace with real guardrail logic. |
| `cli/pipeline.ts` — Phase 3 | The `if (testConfig.type === 'stub')` short-circuit (currently lines ~154–158). Replace with a dispatch to the real test runner function. |
| `cli/pipeline.ts` — Phase 4 | The `if (guardrailConfig.type === 'stub')` short-circuit (currently lines ~187–190). Replace with a dispatch to the real guardrail runner function. |

Do not delete the YAML files themselves — they define the test/guardrail metadata (name, description, triggers, threshold) that the real runner will still use.
