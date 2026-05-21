# PossibLaw — Architecture Decisions

## Overview

PossibLaw is a layer on top of [paperclip](../paperclip/), a multi-agent orchestration framework. This document captures the architectural decisions that shaped the runtime structure of the PossibLaw layer: the agent graph, workflow pipelines, model configuration, and integration patterns. Decisions are recorded here after evidence is collected (typically from a sprint prototype or comparison run) so the reasoning survives across sessions and sprints.

---

## Decision: Chief of Staff (Sprint 1b)

### Context

Plan §5 describes a multi-domain routing hierarchy with a Chief of Staff above domain-specific routers (Chief Counsel for legal, and future leads for marketing, finance, admin, ops). Plan §9 (Sprint 1b) required a prototype comparison to determine whether to adopt Chief of Staff immediately or defer.

### Prototype

Sprint 1b implemented:
- `layer/agents/chief-of-staff.md` — top-level domain router (`manages: [chief-counsel]`)
- `layer/workflows/quick-counsel-with-cos.yaml` — canonical NDA workflow with CoS inserted as first hop

Both workflows were run in **offline mode** (deterministic, no real LLM calls) on the Sprint 1a demo prompt `"draft an NDA for ACME"`.

### Comparison Results

| Metric | `quick-counsel` (no CoS) | `quick-counsel-with-cos` (CoS) |
|---|---|---|
| Router LLM calls | 2 (chief-counsel, commercial-lead) | 3 (chief-of-staff, chief-counsel, commercial-lead) |
| Specialist calls | 1 (nda-drafter) | 1 (nda-drafter) |
| Total LLM calls | 3 | 4 |
| Added routing overhead | — | +1 CoS call |
| Estimated token cost (CoS call) | — | ~400 in + 80 out on Opus ≈ $0.011/run |
| Domains available | 1 (legal) | 1 (legal) |
| Routing value added by CoS | — | None — only one domain wired |

**Known limitations (Sprint 1b):** Two gaps prevent end-to-end validation of the CoS workflow without modifying `cli/`:

1. **Missing offline fixture** — `cli/anthropic.ts` has no deterministic `OFFLINE_FIXTURES` entry for `chief-of-staff`. In offline mode the fallback stub `[OFFLINE STUB for chief-of-staff]` contains no `ROUTE_TO` directive, causing the pipeline to error immediately. Adding the fixture requires a `cli/` change; deferred to Sprint 2.

2. **MAX_HOPS = 3** — `cli/pipeline.ts` enforces `MAX_HOPS = 3`. The CoS chain requires 3 router/lead hops (CoS → chief-counsel → commercial-lead) before reaching the specialist, exhausting the budget before commercial-lead runs. The fix (raise to 4 or make workflow-configurable) is deferred to Sprint 2.

See `docs/sprint-2-handoff.md` §Breaking Changes for both items.

### Decision

**Defer Chief of Staff adoption to Sprint 3.**

At Sprint 1b's scale — one legal domain, one specialist — Chief of Staff adds one Opus-class LLM call (~$0.011) and one additional routing hop with zero routing value: there is nothing to choose between because only one domain is wired. The overhead is real; the benefit is not yet real.

`quick-counsel.yaml` remains the **canonical workflow**. `quick-counsel-with-cos.yaml` is preserved as an **opt-in prototype** for testing the multi-domain pattern.

### Revisit Criteria

Re-run this comparison when ≥ 2 non-legal domain routers are live (e.g., `marketing-lead`, `finance-lead`). At that point Chief of Staff provides genuine domain disambiguation and the overhead is justified.

---

## Decision: model-field schema (Sprint 1b)

### Context

Plan §11.2 proposed two candidate schemas for the `model` field in agent frontmatter:

1. **String form**: `provider/name` (e.g., `anthropic/claude-opus-4-7`)
2. **Object form**: `{ provider: string; name: string; params?: Record<string, unknown> }` (e.g., `{ provider: "anthropic", name: "claude-opus-4-7", temperature: 0.2 }`)

Sprint 1a surfaced no requirement to pass per-call parameters in agent definitions; all model calls used runtime defaults.

### Decision

**Lock the model field as a plain string: `provider/name`.**

All agent definitions use the string form. The loader (`cli/loader.ts`) reads `model` and `fallback_model` as strings. No object form is needed or supported.

### Migration Criteria

Migrate to object form only if an agent definition needs to declare a **per-call parameter that cannot be expressed in the string** — for example, a fixed temperature, top-p, or stop sequence that must differ from the runtime default for a specific agent. A hypothetical example of the trigger:

```yaml
# This would require object form:
model:
  provider: anthropic
  name: claude-opus-4-7
  temperature: 0.2
```

Until such a requirement arises, all agents use the string form. Any agent that adds a `params` key in a future sprint should open an architecture decision record in this file before merging.

---

## Decision Log

| Date | Sprint | Decision | Rationale | Revisit Criteria |
|---|---|---|---|---|
| 2026-05-20 | Sprint 1b | Defer Chief of Staff to Sprint 3 | Zero routing value at 1-domain scale; adds ~$0.011/run overhead | ≥ 2 non-legal domain routers live |
| 2026-05-20 | Sprint 1b | Lock model-field schema as string `provider/name` | Sprint 1a surfaced no per-call parameter requirement; string is simpler | Any agent declares a parameter that can't be expressed in the string |
| 2026-05-21 | Sprint 2 | LLM-as-judge (Haiku-4.5) as default evaluator | Best cost/capability tradeoff for groundedness; tunable per-test via `judge_model` | Any test type that needs stronger guarantees (e.g. formal verification) |
| 2026-05-21 | Sprint 2 | MAX_HOPS raised from 3 to 4 | CoS chain requires 3 router hops before specialist; limit was 3 | If chains exceed 4 hops, make workflow-configurable (`max_hops` field) |
| 2026-05-21 | Sprint 2 | Audit log stores plaintext in Sprint 2 (hash-only deferred to Sprint 3) | No Privacy Filter implemented yet; Sprint 3 removes plaintext for privileged matters | Sprint 3 Privacy Filter implementation |
| 2026-05-21 | Sprint 2 | Regex inline flags `(?im)` stripped and applied as JS RegExp flags | JavaScript RegExp does not support inline flag syntax in pattern strings | N/A — permanent fix |

---

## Forthcoming Decisions

The following items from plan §11 remain `UNCONFIRMED` and will be resolved in later sprints:

| Item | Plan Ref | Resolving Sprint | Notes |
|---|---|---|---|
| Test framework selection (real groundedness evaluator) | §11.3 | Sprint 2 | Options include LLM-as-judge, embedding-cosine, rule-based. Sprint 2 stub uses deterministic pass. |
| Privacy Filter detector implementation | §11.4 | Sprint 2–3 | Determines how privileged-matter prompts/outputs are identified for hash-only audit logging. |
| Eval output format (structured vs. human-readable) | §11.5 | Sprint 2 | Output shape for `cli eval` command when real test/guardrail results are available. |
| Audit log storage backend | §11.6 | Sprint 3–4 | JSONL files on disk (Sprint 2), migration to append-only store or S3 (Sprint 3–4). |
| Sprint 4 key store interface for prompt/output rehydration | §11.7 | Sprint 4 | Required to decrypt hashed privileged-matter content for authorized review. |
| MAX_HOPS configurability | §11.8 | Sprint 2 | Current hard-coded limit of 3 blocks the CoS workflow; Sprint 2 should make this workflow-configurable. |
| Offline fixture for chief-of-staff | — | Sprint 2 | `cli/anthropic.ts` OFFLINE_FIXTURES has no entry for chief-of-staff; CoS workflow errors in offline mode. Sprint 2 adds the fixture entry. |
