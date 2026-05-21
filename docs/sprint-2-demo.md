# Sprint 2 Demo Walkthrough

## Overview

The Sprint 2 demo shows: a deliberately bad input causes a groundedness test failure, triggers an automatic retry on Opus 4.7, the retry also fails, and escalation fires. The full chain is reproducible from the audit log.

---

## Setup

```bash
cd /Users/salvadorcarranza/possiblaw
pnpm build
```

No API key is required. All steps use offline fixtures.

---

## Step 1 — Run the BAD_INPUT_DEMO

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "BAD_INPUT_DEMO draft an NDA"
```

### What happens

1. **Router chain** — `chief-counsel` → `commercial-lead` → routes to `nda-drafter`.
2. **Specialist** — `nda-drafter` (offline) returns `[INVALID DRAFT] xjq8wz lorem ipsum...` because the prompt contains `BAD_INPUT_DEMO`.
3. **Groundedness test** — offline judge returns `{ pass: false, score: 0.2, rationale: "Draft is incoherent." }`.
4. **Failure handler** — `retry_with_better_model_then_escalate` fires `retry_with: anthropic/claude-opus-4-7`.
5. **Specialist retry** — `nda-drafter` is re-invoked with Opus 4.7. Offline mode still returns the invalid draft.
6. **Groundedness re-test** — judge returns `{ pass: false, ... }` again (same offline fixture logic).
7. **Escalation** — `escalate_to: human` fires. Escalation card prints with the failure rationale.

### Expected output (excerpt)

```
✘ test:groundedness — FAILED
▶ specialist:nda-drafter:retry | nda-drafter | claude-opus-4-7 (offline)
✘ test:groundedness:retry — FAILED
╔══════════════════════════════════════════════════════════════════════╗
║                        ESCALATION CARD                              ║
╚══════════════════════════════════════════════════════════════════════╝
Reason:
  Test 'groundedness' failed after retry. Draft is incoherent.
Audit log: layer/audit/<matter-id>.jsonl
```

---

## Step 2 — Audit log replay

Copy the matter ID from the `Audit log:` line in the previous output, then:

```bash
node dist/cli/index.js audit show <matter-id>
```

This prints every event in the chain:

1. `route:chief-counsel` — routing call
2. `route:commercial-lead` — routing call
3. `specialist:nda-drafter` — initial specialist call
4. `test:groundedness` — test failure (pass: false, score: 0.2)
5. `test-failure-action:groundedness` — retry_with: claude-opus-4-7
6. `specialist:nda-drafter:retry` — Opus retry call
7. `test:groundedness:retry` — retry test failure
8. `escalation:groundedness` — escalate_to: human

---

## Offline Fixture Mechanics

- If user prompt contains `BAD_INPUT_DEMO`, `cli/anthropic.ts::offlineFixture` returns `[INVALID DRAFT]` for `nda-drafter` (both initial and retry calls — model override does not affect offline fixtures).
- If `context.offline && context.userPrompt.includes('BAD_INPUT_DEMO')` and `config.name === 'groundedness'`, `cli/test-runner.ts::runTest` returns `{ pass: false, score: 0.2, rationale: "Draft is incoherent." }` regardless of retry count.
- Both mechanisms together guarantee the full retry+escalation flow is exercisable offline.

---

## Normal Flow (regression check)

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft an NDA for ACME for a mutual disclosure with a 2-year term"
```

Expected: groundedness passes (offline stub_result), signed-document guardrail fires (real regex matches `Signature: ___` in NDA fixture), escalation card with signature-block reason.

---

## Multi-hop Flow (Sprint 1b regression)

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel-with-cos "draft an NDA for ACME"
```

Expected: 3 routing hops (chief-of-staff → chief-counsel → commercial-lead → nda-drafter), then test + guardrail, then escalation.
