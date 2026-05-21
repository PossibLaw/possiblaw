# Sprint 5 Demo: Per-Agent Model Overrides + Cost Transparency

This walkthrough covers Sprint 5's operator-legible model routing and cost
visibility features. All steps run in offline mode (no API key required).

---

## Prerequisites

```bash
pnpm build
```

---

## Step 1 — `workflows show`: pipeline shape + estimated cost

```bash
node dist/cli/index.js workflows show quick-counsel
```

Expected output shows:
- Pipeline steps (route chain → specialist → tests → guardrails)
- Resolved agents with their effective models (overrides applied)
- Estimated typical cost per run broken down by routing / specialist / tests / guardrails

```bash
node dist/cli/index.js workflows show quick-invoice-review
```

The `quick-invoice-review` workflow routes via `chief-of-staff → finance-lead → billing-prep`.
Notice that the `expense-categorizer` (used in invoice side-flows) now defaults to
`ollama/llama3.1:8b` — it shows $0.0000 cost in estimates.

---

## Step 2 — Run offline, observe cost report

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft NDA for ACME"
```

After the deliverable/escalation card you will see:

```
─────────────────────────────────────────────
Cost report (pricing snapshot 2026-05-20)
─────────────────────────────────────────────
  (offline — model costs not incurred)
─────────────────────────────────────────────
  Note: Pricing snapshot 2026-05-20. Update cli/pricing.ts to refresh.
```

---

## Step 3 — Override `nda-drafter` to Haiku

```bash
node dist/cli/index.js team set-model nda-drafter anthropic/claude-haiku-4-5
```

Confirms the write to `.possiblaw/overrides.yaml`. Verify:

```bash
node dist/cli/index.js team show-model nda-drafter
```

Expected:

```
Agent: nda-drafter
Effective model: anthropic/claude-haiku-4-5
(override active)
```

Now `workflows show quick-counsel` will reflect the cheaper Haiku price for
the nda-drafter specialist call.

---

## Step 4 — Override `expense-categorizer` to local Llama

```bash
node dist/cli/index.js team set-model expense-categorizer ollama/llama3.1:8b
```

Verify:

```bash
node dist/cli/index.js team show-model expense-categorizer
```

Expected:

```
Agent: expense-categorizer
Effective model: ollama/llama3.1:8b
(override active)
```

---

## Step 5 — Invoice review with local model override

```bash
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-invoice-review \
  "draft May invoice for ACME — 12.5 partner hours, 8 associate hours"
```

The run:
1. Routes: `chief-of-staff → finance-lead → billing-prep` (offline fixtures)
2. Runs tests and the `signed-document` guardrail (triggers escalation)
3. Shows cost report:
   - Offline mode → `(offline — model costs not incurred)`

When Ollama is running (`ollama serve`) and `ANTHROPIC_API_KEY` is set, routing
calls incur Anthropic cost but the `expense-categorizer` specialist run is $0
because `ollama/*` is always free in `cli/pricing.ts`.

---

## Pricing reference

File: `cli/pricing.ts` — update token prices here when Anthropic pricing changes.

| Model | Input / 1M | Output / 1M |
|---|---|---|
| claude-opus-4-7 | $15.00 | $75.00 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| ollama/* | $0.00 | $0.00 |

Pricing snapshot: 2026-05-20.

---

## Override file format

`.possiblaw/overrides.yaml` (repo-local, gitignored):

```yaml
overrides:
  nda-drafter:
    model: anthropic/claude-haiku-4-5
  expense-categorizer:
    model: ollama/llama3.1:8b
```

Delete the file or remove an entry to revert to agent defaults.
