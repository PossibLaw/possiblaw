# PossibLaw — Handoff for Next Coding Agent

**As of:** 2026-05-21
**Branch:** `main` (pushed to https://github.com/PossibLaw/possiblaw)
**Last commit:** `c708d01 chore: gitignore privacy-filter per-matter key stores`
**Plan of record:** `/Users/salvadorcarranza/.claude/plans/possiblaw-poc-clean-rebuild.md`

---

## TL;DR

Sprints 0 through 10 of the clean-rebuild plan are **complete and pushed**. The PoC works end-to-end in offline mode (deterministic fixtures, $0 cost, no API keys). Live mode needs auth. The plan author's preferred auth path is **subscription-based via local CLIs (`claude`, `codex`)**, not direct API keys. That work is Sprint 11 and has been scoped but not built. Live eval numbers in the README are also pending Sprint 11.

---

## What's done (and verified)

| Sprint | Commit | What landed |
|---|---|---|
| 0 + 1a | `fd47e8e` | Repo skeleton; paperclip submodule; Chief Counsel → Commercial Lead → nda-drafter slice with stubs; offline demo |
| 1b | `cc1e7df` | Chief of Staff prototype (opt-in); model-field locked as string; Sprint 2 handoff doc; ARCHITECTURE.md seeded |
| 2 | `58d9446` | Real LLM-as-judge test runner; rule-based + LLM guardrail runner; retry/escalate/route failure handlers; per-matter audit log; `BAD_INPUT_DEMO` triggers retry path |
| 3 | `575a80a` | Marketing/Finance/Admin Leads + 5 specialists; small-firm template; quick-invoice-review + quick-intake-reply workflows |
| 4 | `8111b47` | Privacy Filter encoder-decoder via Ollama (with rule-based offline fallback); per-matter reversible key store; privacy-filter-required risk gate; threat-model doc + 8 adversarial tests |
| 5 | `cf2baf4` | Per-operator model overrides in `.possiblaw/overrides.yaml`; pricing module; cost report per run + on `workflows show`; expense-categorizer default switched to `ollama/llama3.1:8b` |
| 6A | `9fbd67a` | Connector framework + 3 open-access stand-ins (local-fs-doc-store, no-op-signature, courtlistener) + 3 reference live (stripe, midpage, docusign) |
| 6B | `6b5fc79` | 8 more live connectors (imanage, netdocuments, westlaw, lexis, quickbooks, hubspot, notion, linear) + v1 inventory documented |
| 7 | `dff9c84` | `team add/remove/rename/export/diff` CLI; `.possiblaw/custom-agents/` + `.possiblaw/template-overrides.yaml`; `docs/customize-your-team.md` for non-engineers |
| 8 | `e45a1c2` | Pipeline `parallel`/`reconcile`/`debate` step kinds; reconciler + debate-judge + risk-spotter meta-agents; deep-review, stress-test, roundtable, quick-pitch-polish, quick-expense-categorize workflows; `workflows list/show/pick` |
| 9 | `46c9a73` | Eval harness for CUAD/MAUD/ACORD/UNFAIR-ToS/LEDGAR (fetch + adapter + scorer per dataset); Markdown + JSON output; $50 default budget; `eval list-datasets`, `eval fetch`, `eval --dataset --workflow` |
| 10 | `921b7fb` | Hero README rewrite (≤300 lines, badges, disclaimer in lead); SECURITY.md; 5 `docs/extending/*` guides; getting-started; outreach drafts; announcement draft; version 0.0.1 → 0.1.0 |
| chore | `2db038d`, `c708d01` | gitignored runtime artifacts (audit jsonl, privacy keys, eval results, dataset caches) |

Counts:
- 16 agents (2 routers + 4 leads + 7 specialists + 3 meta agents)
- 9 workflows
- 14 connectors (3 stand-ins + 11 named live)
- 5 eval datasets wired
- 5 starter templates (solo-lawyer, small-firm; the plan mentioned in-house-dept, business-owner, blank — those are unimplemented)

## What's NOT done (the next agent's pile)

### Sprint 11 — Subscription-auth providers (scoped, not built)

**Why this matters.** The plan author does not want to set up direct ANTHROPIC_API_KEY / OPENAI_API_KEY billing. Both `claude` (Claude Code 2.1.146) and `codex` (Codex 0.132.0) CLIs are already installed at `/Users/salvadorcarranza/.local/bin/claude` and `/opt/homebrew/bin/codex`. Both support non-interactive output and both hold OAuth/subscription auth.

**Verified working** (this session):
```bash
echo "Reply with exactly: ROUTE_TO: commercial-lead" | \
  claude -p --model sonnet --output-format text
# → ROUTE_TO: commercial-lead
```

**Scope:**
1. Extend `cli/anthropic.ts` (or split into `cli/llm.ts`) with two new providers:
   - `claude-cli/<model>` → shell out to `claude -p --model <name> --system-prompt "<system>" --max-budget-usd <n> --output-format text`. Pass user prompt via stdin. Strip CLI banners from output.
   - `codex-cli/<model>` → `codex exec --model <name>` (similar shape; check stdin behavior).
2. Update the model-string parser: providers are now `anthropic/`, `ollama/`, `claude-cli/`, `codex-cli/`. Default for offline-mode lookup unchanged.
3. The eval harness's `--budget <n>` flag should pass through to `claude -p --max-budget-usd <n>` when the active provider is `claude-cli/*`.
4. Demo: `bin/possiblaw run quick-counsel "draft NDA for ACME" --provider claude-cli` runs the full pipeline with subscription auth, no API key.
5. Document in `docs/auth.md`: the four provider options, when to use each, how to switch.

**Implementer note.** The `claude --bare` flag is interesting — it disables Claude Code's session machinery (hooks, LSP, plugin sync, auto-memory). For PossibLaw's CLI invocations of `claude`, **use `--bare`** to avoid Claude Code's own context leaking into PossibLaw's agent prompts. See the help output for the exact constraint: with `--bare`, Anthropic auth comes from `ANTHROPIC_API_KEY` or `apiKeyHelper`, NOT from Claude Code's OAuth/keychain. So `--bare` *can't* use subscription auth — choose between `--bare` (no Claude Code context, but needs API key) and not `--bare` (has Claude Code context but uses subscription). The plan author's intent is subscription auth, so **don't use `--bare`** initially; instead, ensure system prompts are crisp enough that any leaked Claude Code context doesn't poison the agent.

### Live evals (gated on Sprint 11)

Once Sprint 11 is shipped, run:
```bash
bin/possiblaw eval --dataset cuad --workflow quick-counsel --sample-size 20 --budget 50 --provider claude-cli
```

Populate the README table at `README.md` ("Evals" section). Commit + push.

The plan author's earlier preference: $50 cap on CUAD + quick-counsel as the first pass (smallest reasonable scope).

### Sprint 0 leftover — paperclip extension-point inventory

`FOUNDATION.md` has a table of paperclip primitives with all stability ratings marked `UNCONFIRMED`. Sprint 2's audit-trail decision was made under that uncertainty (chose `layer/audit/` over paperclip primitive). The next agent should do the **deep-dive into paperclip's source** (now on disk under `paperclip/`) and update the inventory with real stability ratings. paperclip's relevant packages: `paperclip/server/src/auth/better-auth.ts`, `paperclip/packages/adapters/*`, `paperclip/packages/db/`, `paperclip/server/src/middleware/`.

### Definition-of-Done items that need humans, not agents

Per plan §12:
- **Outside operator validation.** Draft email at `docs/outreach/outside-operator.md`. The plan author places the ask.
- **Outside reviewer validation of `docs/extending/*`.** Draft at `docs/outreach/outside-reviewer.md`. The plan author places the ask.
- **Public README announcement.** Draft at `docs/announcement.md`. The plan author decides when to publish to HN/LinkedIn.

These are not agent tasks. Don't try to ship them.

### Known small follow-ups

- **`<pattern>` placeholder in escalation card.** Sprint 2 left `<pattern>` as a literal placeholder in `signed-document.yaml`'s `reason_template`. The escalation card prints the raw regex string. Cosmetic — replace with a friendlier substitution.
- **`dist/cli/fixtures/fixtures` nested dir.** Cosmetic build-script artifact from Sprint 3. Could be cleaned with `rm -rf` in the build script.
- **MAX_HOPS = 4** in `cli/pipeline.ts`. If someone adds another routing layer beyond Chief-of-Staff → Chief-Counsel → Lead → Specialist, bump it.
- **Westlaw + Lexis endpoints UNCONFIRMED.** Sprint 6B left placeholder URLs documented as such. When you have real endpoints from those vendors, update `cli/connectors/westlaw.ts` and `cli/connectors/lexis.ts`.
- **midpage schema UNCONFIRMED.** Same. See `cli/connectors/midpage.README.md`.
- **Ollama not installed.** Sprint 4's Privacy Filter runs in rule-based offline-fallback mode without it. To activate the LLM encoder-decoder: `brew install ollama && ollama serve & ollama pull llama3.1:8b`.

---

## How to resume

```bash
cd /Users/salvadorcarranza/possiblaw
git status
git log --oneline | head -15
pnpm install   # in case deps drifted
pnpm typecheck && pnpm build

# Sanity check before changing anything:
env -u ANTHROPIC_API_KEY node dist/cli/index.js run quick-counsel "draft an NDA for ACME"
# → should escalate on signed-document and print escalation card
```

Then read this file + `.agent/PLAN.md` for the live state.

---

## Files the next agent will care about

| Path | Why |
|---|---|
| `/Users/salvadorcarranza/.claude/plans/possiblaw-poc-clean-rebuild.md` | The plan of record. Authoritative. |
| `.agent/PLAN.md` | Sprint 11 spec + remaining work checklist |
| `.agent/HANDOFF.md` | This file |
| `.claude/history.md` | Session log (this session's work) |
| `docs/ARCHITECTURE.md` | Decision log; Sprint 1b decisions; add Sprint 11 decision here |
| `docs/sprint-2-handoff.md` | The original interface contract for tests + guardrails |
| `cli/anthropic.ts` | Where the new providers attach |
| `cli/types.ts` | Strict TypeScript types — extend if needed |
| `paperclip/docs/agents-runtime.md` | paperclip's own doc that confirms subscription-login auth path |

## Conventions to keep

- All net-new code under `layer/` (content) and `cli/` (runtime). Never touch `paperclip/`.
- Strict TypeScript, no `any`. Use NodeNext / ES modules with `.js` extensions on relative imports.
- One sprint per commit. Co-author every commit `Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
- Per-sprint demo docs at `docs/sprint-N-demo.md`.
- No new top-level deps unless genuinely required.
- Don't push without explicit operator OK (plan §11 lock + safety boundary).
