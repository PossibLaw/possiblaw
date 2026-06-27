# Operator Test Checklist — running the full PossibLaw suite

Manual, operator-side prerequisites to exercise every tool. Most items are **optional** — only do the ones for the feature you're testing. The **critical path** (A + B + C) gets the trust pipeline running with no third-party tokens.

> Authoritative sources for exact values: `./bin/possiblaw --list-variants`, `docs/operator-walkthrough.md` (per-variant + per-feature setup), `docs/connectors-inventory.md` (exact env var per connector + which are refused in v1), `docs/known-limitations.md`.

## A. One-time installs (REQUIRED — the launcher does NOT auto-install)
```bash
pnpm -C paperclip install          # required for any launch
pnpm -C gate-proxy install         # the trust gate (egress + receipts)
pnpm -C deadline-engine install    # Phase 4 — deadline-calculator fails without it
pnpm -C eval-harness install       # to run the CUAD benchmark
pnpm -C learning-loop install      # only if testing the learning loop
pnpm -C mcp-servers/firm-facade install   # only if testing --firm-facade
pnpm -C mcp-servers/legal-data install    # only if testing CourtListener research
```
Globals the launcher checks: Node ≥ 20, pnpm, python3, curl.

## B. Pick ONE model-provider variant + authenticate (REQUIRED for live runs)
| Variant | Manual step |
|---|---|
| `codex` (subscription) | install Codex CLI → `codex login --device-auth` (ChatGPT account; gpt-5.5 serves) |
| `claude` (subscription) | install Claude CLI → `claude login` |
| `gemini` (subscription) | install Gemini CLI → OAuth login |
| `codex-api` | `export OPENAI_API_KEY=…` (OpenAI console) |
| `claude-api` | `export ANTHROPIC_API_KEY=…` (Anthropic console) |
| `gemini-api` | `export GEMINI_API_KEY=…` (Google Cloud console) |
| `openrouter` | `export OPENROUTER_API_KEY=…` (openrouter.ai/keys) |
| `opencode` | `opencode auth login` → `OPENCODE_API_KEY` (Zen gateway) |
| `ollama` | `ollama serve` + `ollama pull llama3.1:8b` (+ `:70b`) + an OpenCode provider config |
| `llamacpp` | `llama-server -hf <org>/<gguf> --port 8080` + an OpenCode provider config |

Live runs probe each lane model before starting (`--skip-model-probe` to skip; dry-runs never probe).

## C. Core smoke test (verify Phases 0–2 with just A + B — no third-party tokens)
```bash
./bin/possiblaw --variant codex     # server + package import + gate proxy
```
Then the README "5-minute path": trigger a gated court filing → approve in the dashboard → `curl /receipts/verify` (see the hash-chained receipt). Exercises boundary classify → policy → human gate → citation gate → receipt.

## D. Optional feature tokens (only for the feature under test)
- **Egress writes (proxy-only; export in the launching shell — the launcher scrubs them from agents):** `GMAIL_TOKEN`, `MS_GRAPH_TOKEN` (OneDrive/SharePoint), `GDRIVE_ACCESS_TOKEN`, `NOTION_API_KEY`.
- **Read-back / learning loop (agent-side, read-scoped):** `MS_GRAPH_READ_TOKEN`, `GDRIVE_READ_TOKEN`, `NOTION_READ_KEY`, plus `./bin/possiblaw --business <slug>`.
- **Research:** `COURTLISTENER_API_KEY` (optional — anonymous works at low volume).
- **Notifications:** Slack / Teams incoming-webhook URLs.
- **Delivery layer:** the egress write tokens above + a `POSSIBLAW_DELIVERY_POLICY` YAML (destinations + auto/on-request rules).
- **Privacy encoder (confidential/privileged matters):** Ollama running + a model pulled (`POSSIBLAW_PRIVACY_MODEL`, default `llama3.1:8b`).
- **Firm-facing facade:** `./bin/possiblaw --firm-facade` mints a company-scoped key + writes `<data-dir>/firm-facade-mcp.json` (0600). Paste that `possiblaw-firm-facade` block into your MCP host (Claude Desktop `claude_desktop_config.json` / Codex `config.toml`), then drive `create_matter → get_matter_status → request_approval` (a human approves in the dashboard) `→ fetch_work_product`.
- **Deadline engine:** `POSSIBLAW_REPO_ROOT` (the launcher injects it; set it manually if invoking the engine directly) + the install above.

> The exact env var per connector is in `docs/connectors-inventory.md` and each `skills/connector-*/SKILL.md`. Cross-check there before assuming a name.

## E. Evals & benchmarks
- **CUAD — runnable today:** `pnpm -C eval-harness install` then `./bin/eval run --benchmark cuad --variant <v>`. Ships synthetic offline fixtures (`layer/evals/datasets/cuad/fixtures.jsonl`) — no data or key needed.
- **Seed agent/skill cases:** `companies/legal-operations/evals/cases/*.md` (incl. the 4 new `deadline-*` cases) run via the harness.
- **Harvey LAB — NOT runnable (stub):** `eval-harness/src/adapters/lab.ts` throws `"lab adapter not implemented"`. Harvey LAB is a **real public MIT dataset** (~1,200 tasks), not something you synthesize — but the adapter + an orchestration runner must be **built** first. See `docs/superpowers/plans/2026-06-27-harvey-lab-orchestration-eval.md`.

## F. Don't-bother list (stubs/deferred — will fail or refuse if invoked)
- Harvey **LAB** benchmark (stub — see the plan above).
- Tier-2 learn-from-edits Box connector + native Google Docs export (deferred).
- `share_external` connector writes (HubSpot, Linear, Clio, iManage, NetDocuments) — **visibly refused** in v1 by design (`502 not_implemented`).
- In-paperclip eval-judge loop (deferred; the harness is CLI-only in v1).
