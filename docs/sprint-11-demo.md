# Sprint 11 Demo: Same NDA, Four Providers

> **DISCLAIMER: PossibLaw does not practice law. Treat all AI output as a starting point for licensed-lawyer review.**

This demo shows the same `quick-counsel` workflow executed four different ways depending on the active provider. The prompt is identical in every run; only the `--provider` flag changes.

For the full provider comparison and choice guide, see [docs/auth.md](auth.md).

---

## The prompt

```
draft an NDA for ACME
```

The same string is reused in all four runs below.

---

## Run 1 — Offline (no auth, deterministic fixtures)

```bash
env -u ANTHROPIC_API_KEY bin/possiblaw.dev run quick-counsel "draft an NDA for ACME"
```

**What happens:**

- `ANTHROPIC_API_KEY` is explicitly unset for this invocation, so PossibLaw enters offline mode.
- Each agent call resolves to a deterministic fixture (`OFFLINE_FIXTURES` in `cli/anthropic.ts`).
- The NDA body is produced by the bundled `nda-drafter` fixture (Delaware governing law, equitable-relief clause, signature block, disclaimer).
- The `groundedness` test passes (stub).
- The `signed-document` guardrail hits and prints the escalation card — this is the canonical success state, not a failure.
- Cost report shows `(offline — model costs not incurred)` and a total of `$0.00`.

**When to use this:** smoke-testing the pipeline, demos without an API key, CI runs.

---

## Run 2 — Anthropic API

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bin/possiblaw.dev run quick-counsel "draft an NDA for ACME" --provider anthropic
```

**What happens:**

- Every agent call routes through the Anthropic SDK.
- Default model for `--provider anthropic` is `claude-sonnet-4-6` (per `DEFAULT_MODEL_PER_PROVIDER` in `cli/pipeline.ts`); override with `--model`.
- Tokens in/out are recorded per call.
- Privacy Filter masks sensitive entities before each call (default profile is `cloud-only`).
- Cost report shows real dollar amounts per agent and a running total.

**When to use this:** production-grade runs where you want per-call dollar accounting and standard Anthropic billing.

---

## Run 3 — Claude CLI (subscription)

```bash
env -u ANTHROPIC_API_KEY bin/possiblaw.dev run quick-counsel "draft an NDA for ACME" --provider claude-cli
```

**What happens:**

- Each agent call shells out to the local `claude -p` CLI.
- Auth flows through your existing Claude Code OAuth subscription — no API key needed.
- `ANTHROPIC_API_KEY` is explicitly unset above, but PossibLaw also strips it from the child env internally as a safety net (`cli/llm.ts` `callClaudeCli`).
- Default model for `--provider claude-cli` is `sonnet`. Override with `--model haiku` for faster/cheaper runs.
- Cost report shows the literal string `subscription` for each row.

**When to use this:** you already pay for Claude Code and prefer subscription-bundled billing over per-call API charges.

---

## Run 4 — Codex CLI (subscription)

```bash
env -u ANTHROPIC_API_KEY bin/possiblaw.dev run quick-counsel "draft an NDA for ACME" --provider codex-cli
```

**What happens:**

- Each agent call shells out to the local `codex exec` CLI.
- Auth flows through your existing OpenAI Codex OAuth subscription.
- The CLI is invoked with sandbox `-s read-only` so the LLM cannot write files outside its workspace.
- Default model for `--provider codex-cli` is `gpt-5.5`. Override with `--model <name>`.
- Cost report shows the literal string `subscription` for each row.

**When to use this:** you already pay for Codex and want a non-Anthropic completion path under PossibLaw's routing layer.

---

## Cost report comparison

| Run | Provider | Cost reported |
|---|---|---|
| 1 | offline | `$0.00` (no LLM calls) |
| 2 | `anthropic` | `$X.XXXX` per call (real dollar amounts) |
| 3 | `claude-cli` | `subscription` |
| 4 | `codex-cli` | `subscription` |

The `subscription` literal is emitted by `cli/pricing.ts` `formatCallCost` whenever the model string starts with `claude-cli/` or `codex-cli/`. Subscription rows cannot be converted to a dollar amount — that bill lands on the subscription, not on the per-call ledger.

---

## What this proves

- One workflow surface (`quick-counsel`) runs unchanged across four providers.
- Subscription auth works without `ANTHROPIC_API_KEY` — the same workflow that runs on the Anthropic SDK also runs through the Claude Code CLI and the Codex CLI.
- Cost reporting adapts to the provider (real dollars for API-key calls, `subscription` for OAuth-CLI calls, `$0.00` for local and offline).
- Privacy Filter cloud-mode automatically applies for `anthropic`, `claude-cli`, and `codex-cli`, and skips `ollama` (local) and offline mode.

---

## Related

- [docs/auth.md](auth.md) — full provider comparison and choice guide.
- [docs/ARCHITECTURE.md](ARCHITECTURE.md) — Sprint 11 decision log entry.
- [docs/privacy-filter.md](privacy-filter.md) — when the cloud-mode masking applies.
