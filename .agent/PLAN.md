# PossibLaw — Active Plan State

**Updated:** 2026-05-21
**Plan of record:** `/Users/salvadorcarranza/.claude/plans/possiblaw-poc-clean-rebuild.md` (sprint structure, decision log, anti-patterns — all binding).

This file tracks what's pending against that plan and gives the next coding agent a focused work queue.

---

## Completed work (frozen)

Sprints 0 → 10, plus interstitial chores. See `.agent/HANDOFF.md` for the per-sprint commit map. The PoC is shippable as-is in offline mode.

---

## Active sprint — Sprint 11: subscription-auth providers

**Why this exists.** Plan §0 says "public-but-not-productized" and the operator wants to avoid setting up new API-key billing. Both Claude Code (`claude` CLI) and OpenAI Codex (`codex` CLI) are installed locally with OAuth/subscription auth. PossibLaw should route LLM calls through those CLIs instead of (or in addition to) direct SDK calls.

**Status.** Scoped, verified feasible, **not yet built**.

**Verified feasibility (this session):**

```bash
$ which claude codex
/Users/salvadorcarranza/.local/bin/claude
/opt/homebrew/bin/codex

$ claude --version
2.1.146 (Claude Code)

$ codex --version
codex-cli 0.132.0

$ echo "Reply with exactly: ROUTE_TO: commercial-lead" | claude -p --model sonnet
ROUTE_TO: commercial-lead
```

### Tasks

1. **`cli/llm.ts` (split from `cli/anthropic.ts`).** Provider registry that dispatches by the `provider/<id>` prefix of the model string:
   - `anthropic/<name>` — existing SDK path.
   - `ollama/<name>` — existing HTTP path.
   - `claude-cli/<name>` — **new.** Shell out to `claude -p --model <name> --system-prompt "<system>" --output-format text`. Pass user prompt via stdin. Strip any leading Claude Code banner lines (the disclaimer prefix). Reject empty output.
   - `codex-cli/<name>` — **new.** Shell out to `codex exec --model <name>`. Same shape; verify stdin behavior with a probe.
2. **Output capture.** Both CLIs print to stdout in their non-interactive modes. Use `execa` (already vendored if not, add it) or `child_process.spawn` with stream capture. Time out after 120s by default.
3. **Token + cost accounting.** Subscription auth means no per-call token cost from PossibLaw's POV (operator already pays via subscription). Report this clearly in the cost breakdown: rows with `subscription` instead of dollar amounts. The `--max-budget-usd` flag on `claude -p` is the safety net for runaway evals.
4. **Eval harness integration.** Add `--provider claude-cli` (or `--provider codex-cli`) flag to `bin/possiblaw eval`. When the active provider is `claude-cli`, pass `--max-budget-usd <budget>` to each `claude -p` invocation.
5. **Per-agent override path.** `bin/possiblaw team set-model nda-drafter claude-cli/opus` should already work via the Sprint 5 override machinery once the provider is recognized. Verify.
6. **`docs/auth.md`** — new doc explaining the four provider options + which to use when. Cross-reference from README + getting-started.
7. **`docs/sprint-11-demo.md`** — walkthrough: same NDA prompt run four ways (offline / ollama / claude-cli / anthropic-api).
8. **CHANGELOG + ARCHITECTURE Decision Log entry.** Record the decision and why (operator preference + subscription bundling + zero new auth surface).

### Constraint reminder (from paperclip's docs)

paperclip/docs/agents-runtime.md explicitly notes:
> "If `ANTHROPIC_API_KEY` is set in adapter env or host environment, Claude uses API-key auth instead of subscription login."

When invoking `claude -p` from PossibLaw, ensure `ANTHROPIC_API_KEY` is **unset** in the child process env, otherwise the CLI will silently use the API key (and bill the operator's API account) instead of the subscription. Use `env: { ...process.env, ANTHROPIC_API_KEY: undefined }`.

Also: `claude --bare` *disables* subscription auth — only use it for API-key flows. Do NOT pass `--bare` when routing via subscription.

### Verification gates

- `pnpm typecheck && pnpm build` clean.
- `bin/possiblaw run quick-counsel "..." --provider claude-cli` runs the full pipeline using subscription auth.
- `bin/possiblaw eval --dataset cuad --workflow quick-counsel --sample-size 5 --provider claude-cli --budget 5` produces a real eval report with real LLM output.
- All Sprint 1a–10 offline demos still work.

### Commit

```
git add -A
git commit -m "Sprint 11: subscription-auth via claude-cli + codex-cli providers"
```

---

## After Sprint 11 — live evals

Per the plan author's earlier preference: $50 cap on CUAD + quick-counsel as the first pass. Once Sprint 11 ships, run:

```bash
bin/possiblaw eval --dataset cuad --workflow quick-counsel \
  --sample-size 20 --budget 50 --provider claude-cli
```

Then:
1. Update `README.md` "Evals" section with the real numbers (mean score, sample size, cost shown as "subscription" or actual $, date 2026-05-21+, workflow + model mix).
2. Commit `chore(eval): populate README with first CUAD numbers`.
3. Push.

Optionally repeat for `--workflow deep-review` to compare workflow quality on the same dataset.

---

## Plan §11 open questions still UNCONFIRMED

These are explicitly deferred in the plan and remain open. The next agent shouldn't try to resolve them without operator input:

1. ~~Chief of Staff vs no-Chief-of-Staff~~ — **resolved in Sprint 1b**: kept as opt-in prototype; default workflow remains Chief-Counsel-rooted.
2. ~~Per-agent model field schema~~ — **resolved in Sprint 1b**: string form `provider/name` locked. Sprint 11 extends the provider list; schema unchanged.
3. ~~Test framework~~ — **resolved in Sprint 2**: built minimal in-tree runner.
4. ~~Privacy Filter entity detector~~ — **resolved in Sprint 4**: encoder-decoder via local LLM (Ollama) with rule-based fallback; operator preference confirmed mid-session.
5. ~~Eval harness output format~~ — **resolved in Sprint 9**: both Markdown + JSON.

All §11 questions are now answered in the codebase. New decisions belong in `docs/ARCHITECTURE.md` Decision Log.

---

## Plan §12 Definition-of-Done checklist

| Criterion | Status |
|---|---|
| Stranger clone → first matter in <15 min | ✅ `docs/getting-started.md` Quickstart verified Sprint 10 |
| Non-engineer customizes template in <30 min | ✅ `docs/customize-your-team.md` Sprint 7 |
| 3 surfaces demonstrate end-to-end | ✅ legal + marketing + finance Sprint 3 |
| Test/guardrail layer + useful approval card | ✅ Sprint 2 |
| Privacy Filter works on privileged matter (cloud model) | ⚠ Sprint 4 implemented; live cloud-mode verification pending Sprint 11 |
| Per-agent model choice + cost report | ✅ Sprint 5; local-model demo currently fixture-based (Ollama not installed) |
| Contribution surface | ✅ Sprint 10 |
| Outside operator using PossibLaw on real work | ❌ External — operator's task |
| Outside reviewer validates extending docs | ❌ External — operator's task |
| README has live eval numbers | ❌ Pending Sprint 11 + eval run |
| Public launch (discoverable, announcement-quality) | ✅ Repo public, README announcement-quality, posture clear |

Net: 7 ✅ / 1 ⚠ / 3 ❌. Sprint 11 + eval run flips ⚠ → ✅ and one ❌ → ✅. The two remaining ❌ are operator-task items (placing outreach asks), not agent work.

---

## How to engage as the next agent

1. Read `/Users/salvadorcarranza/.claude/plans/possiblaw-poc-clean-rebuild.md` first.
2. Read `.agent/HANDOFF.md` second.
3. Read this file third.
4. Confirm `git status` is clean and `pnpm typecheck` passes before touching anything.
5. Sprint 11 is the next concrete chunk of code. Use the subagent-driven-development pattern (one implementer per task) if available.
