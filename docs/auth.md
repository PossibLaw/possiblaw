# Authentication: Choose Your LLM Provider

> **DISCLAIMER: PossibLaw does not practice law. Treat all AI output as a starting point for licensed-lawyer review.**

PossibLaw routes LLM calls through one of four providers. Pick the one that matches how you want to be billed and what auth you have set up.

---

## At-a-glance table

| Provider | Auth | Best for | Setup time |
|---|---|---|---|
| `--provider anthropic` | `ANTHROPIC_API_KEY` env var | Production, batch evals, programmatic use | 5 min — get key from [console.anthropic.com](https://console.anthropic.com) |
| `--provider claude-cli` | Existing Claude Code subscription (OAuth) | Operators who already use Claude Code; want subscription-bundled billing | 0 min if `claude` CLI is installed and logged in |
| `--provider codex-cli` | Existing OpenAI Codex subscription (OAuth) | Operators who already use Codex CLI; want subscription-bundled billing | 0 min if `codex` CLI is installed and logged in |
| `--provider ollama` | None (local daemon) | Privileged matters, offline-only environments, free runs | 10 min — `brew install ollama && ollama serve` |
| _(no flag)_ | Per-agent `.model` field | Default — uses whatever each agent declares | n/a |

---

## How to switch

`--provider` is a per-run override. It applies uniformly to every agent in the workflow for that run only — the per-agent `.model` field on disk is not touched.

```bash
bin/possiblaw run quick-counsel "draft an NDA for ACME" --provider claude-cli
bin/possiblaw run quick-counsel "draft an NDA for ACME" --provider claude-cli --model haiku
bin/possiblaw run quick-counsel "draft an NDA for ACME" --provider ollama --model llama3.1:8b
```

Same flag on `eval`:

```bash
bin/possiblaw eval --dataset cuad --workflow quick-counsel --sample-size 20 --budget 50 --provider claude-cli
```

To make the override persistent for one agent only, use `team set-model` instead:

```bash
bin/possiblaw team set-model nda-drafter claude-cli/sonnet
```

---

## Provider details

### anthropic (API key)

Direct Anthropic SDK calls. The default path when `ANTHROPIC_API_KEY` is set and no `--provider` flag is given.

- **Auth:** `ANTHROPIC_API_KEY` env var.
- **Default model when `--provider anthropic` is used without `--model`:** `claude-sonnet-4-6`.
- **Cost:** real dollar amounts reported per call (see `cli/pricing.ts` for the price snapshot).
- **Billing:** via the Anthropic console; cap with the `--budget <usd>` flag in `eval`.
- **When the key is absent and no `--provider` is set:** PossibLaw enters offline mode and uses deterministic fixtures.

### claude-cli (subscription via Claude Code)

Shells out to your local `claude -p` CLI. Auth flows through the Claude Code OAuth subscription, so no API key is needed.

- **Auth:** existing Claude Code login. Run `claude --help` once to confirm the CLI is installed and authenticated.
- **Default model:** `sonnet`. Override with `--model haiku` for faster/cheaper runs.
- **`ANTHROPIC_API_KEY` is automatically removed from the child env** before each call. This prevents the CLI from silently falling back to API-key billing when both auth modes are present (see `cli/llm.ts` `callClaudeCli`).
- **`--bare` is never passed** to `claude` — `--bare` disables subscription auth.
- **Cost reporting:** rows show the literal string `subscription` instead of a dollar amount.
- **Budget cap:** when `eval --budget <n>` is used together with `--provider claude-cli`, the dollar amount is forwarded to `claude -p --max-budget-usd <n>` for each call.

### codex-cli (subscription via OpenAI Codex)

Shells out to your local `codex exec` CLI. Auth flows through the Codex OAuth subscription.

- **Auth:** existing Codex login. Run `codex --help` once to confirm the CLI is installed and authenticated.
- **Default model:** `gpt-5.5`. Override with `--model <name>` when needed.
- **Sandbox:** invocations run with `-s read-only` so the LLM cannot write files outside its workspace.
- **Banner suppression:** stdout is captured cleanly; the codex CLI banner is stripped.
- **Cost reporting:** rows show the literal string `subscription`.
- **Budget cap:** `--max-budget-usd` is **not** forwarded to codex-cli (only claude-cli supports that flag today). Track Codex spend on the OpenAI side.

### ollama (local, free)

Calls your local Ollama daemon over HTTP.

- **Auth:** none. Requires the daemon to be running (`ollama serve`).
- **Default model:** `llama3.1:8b`. Override with `--model <model:tag>`.
- **Cost:** $0.00 per call.
- **Privacy:** data never leaves the machine — appropriate for privileged matters.
- **Fallback:** if the daemon is unreachable when the provider would otherwise be invoked, PossibLaw falls back to offline fixtures rather than erroring (see `cli/anthropic.ts`).
- **Speed:** local inference is generally slower than cloud calls; pick smaller models for interactive runs.

---

## Privacy Filter interaction

The Privacy Filter (Sprint 4) automatically masks sensitive entities before any **cloud** provider call. The cloud set is:

| Provider | Treated as cloud by Privacy Filter? |
|---|---|
| `anthropic/*` | Yes — masked |
| `claude-cli/*` | Yes — masked (cloud via Anthropic subscription) |
| `codex-cli/*` | Yes — masked (cloud via OpenAI subscription) |
| `ollama/*` | No — local; not masked |

When the matter is tagged `privileged`, `sensitive`, or `client-confidential`, the `privacy-filter-required` guardrail forces `--privacy-profile always` regardless of provider.

See [docs/privacy-filter.md](privacy-filter.md) for the full threat model.

---

## Cost tracking

| Provider | Cost reported as |
|---|---|
| `anthropic/*` | $X.XXXX per call (real dollar amounts) |
| `claude-cli/*` | `subscription` (billed via your Claude Code subscription) |
| `codex-cli/*` | `subscription` (billed via your Codex subscription) |
| `ollama/*` | $0.00 (local, no cost) |
| Offline mode | $0.00 (no LLM calls made) |

The `--budget <usd>` flag in `eval` acts as a safety cap. For `--provider claude-cli`, it is passed to `claude -p --max-budget-usd` directly. For `--provider anthropic`, it is compared against the per-call cost ledger and aborts the eval at 95% utilization (exit code 2).

---

## Security notes

- `claude-cli` runs with `ANTHROPIC_API_KEY` removed from the child env to prevent silent fallback to API-key billing. (See `cli/llm.ts` `callClaudeCli`.)
- `--bare` is **not** passed to `claude` since `--bare` disables subscription auth.
- `codex-cli` runs with sandbox `read-only` so the LLM cannot write files outside its workspace.
- A 120-second default timeout applies to both shell-out calls; empty output is rejected with a thrown error rather than passed through.

---

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| `claude-cli produced empty output` | Check `which claude` and confirm the CLI is logged in: `claude --help` should print without prompting for auth. |
| `Could not resolve authentication method` with `--provider anthropic` | `ANTHROPIC_API_KEY` is unset. Either export it or pick a different `--provider`. |
| `claude-cli` call times out | Try `--model haiku` (smaller/faster), or verify `claude -p --model sonnet "ping"` works standalone. |
| `codex-cli invocation failed` | Run `codex --help` to verify the CLI is installed and authenticated. |
| Cost report shows `subscription` instead of a dollar amount | Expected for `claude-cli/*` and `codex-cli/*`. Per-call dollar accounting is not available; bills land on the subscription. |
| Privacy Filter not applied when using `--provider claude-cli` | Confirm `--privacy-profile cloud-only` (or `always`) is set; the default is `cloud-only`. |
