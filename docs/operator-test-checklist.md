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
- **Harvey LAB — orchestration eval (curated subset, operator-gated):** the `lab` adapter and `orchestration-eval/` runner are built. A curated subset of 9 tasks (structural-fit only; non-fitting tasks SKIPPED) is measured via the A/B experiment. See **G** below for the full runbook.

## F. Don't-bother list (stubs/deferred — will fail or refuse if invoked)
- Tier-2 learn-from-edits Box connector + native Google Docs export (deferred).
- `share_external` connector writes (HubSpot, Linear, Clio, iManage, NetDocuments) — **visibly refused** in v1 by design (`502 not_implemented`).
- In-paperclip eval-judge loop (deferred; the harness is CLI-only in v1).

## G. Orchestration eval (Harvey LAB A/B)

Run the Harvey LAB A/B thesis experiment on a **disposable** Paperclip instance. Never use port 3100.

### Prerequisites

```bash
git submodule update --init harvey-lab   # pull the pinned LAB dataset
pnpm -C orchestration-eval install       # install orchestration-eval deps
```

Also required (install once):
- `uv` — Python package runner for `parse_doc` (Harvey doc parser). Install: https://github.com/astral-sh/uv
- `pandoc` — DOCX → text fallback. Install: `brew install pandoc`
- `ANTHROPIC_API_KEY` — judge model (`claude-sonnet-4-6`). Export in the launching shell.
- `OPENROUTER_API_KEY` — cost runs (`openrouter-cost` variant). Export in the launching shell.

### Step 1 — Launch a disposable instance (NEVER port 3100)

```bash
export DATA_DIR="$(mktemp -d)"
./bin/possiblaw \
  --variant openrouter-cost \
  --port 3199 \
  --gate-port 3899 \
  --data-dir "$DATA_DIR" \
  --non-interactive --yes \
  --mission "lab eval"
```

Wait for the launcher to print the dashboard URL (http://127.0.0.1:3199) and the import to finish.

### Step 2 — Collect IDs and mint a key

```bash
# Company ID (printed by the launcher; or query):
CO_ID=$(curl -s http://127.0.0.1:3199/api/companies | python3 -c "import sys,json; print(json.load(sys.stdin)['companies'][0]['id'])")

# Chief-of-staff agent ID (Arm B delegator):
CHIEF_ID=$(curl -s "http://127.0.0.1:3199/api/companies/$CO_ID/agents" | \
  python3 -c "import sys,json; agents=json.load(sys.stdin)['agents']; print(next(a['id'] for a in agents if 'chief-of-staff' in a.get('slug','')))")

# Per-practice lead ID for Arm A — example: immigration-lead
LEAD_ID=$(curl -s "http://127.0.0.1:3199/api/companies/$CO_ID/agents" | \
  python3 -c "import sys,json; agents=json.load(sys.stdin)['agents']; print(next(a['id'] for a in agents if 'immigration-lead' in a.get('slug','')))")

# Mint a company-scoped agent key:
API_KEY=$(curl -s -X POST "http://127.0.0.1:3199/api/agents/$CHIEF_ID/keys" \
  -H "content-type: application/json" -d '{"label":"lab-eval"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

The arm_a_agent for each task is declared in `layer/evals/datasets/lab/lab-manifest.yaml`; look up the slug and resolve its ID the same way as `LEAD_ID`.

### Step 3 — Run the eval (start with --limit 2 to validate before a full run)

```bash
REPO_ROOT="$(pwd)" \
PAPERCLIP_BASE_URL=http://127.0.0.1:3199 \
PAPERCLIP_COMPANY_ID="$CO_ID" \
PAPERCLIP_API_KEY="$API_KEY" \
CHIEF_OF_STAFF_AGENT_ID="$CHIEF_ID" \
ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
OPENROUTER_API_KEY="$OPENROUTER_API_KEY" \
  ./orchestration-eval/bin/orchestration-eval run \
    --benchmark lab \
    --limit 2 \
    --runs 3 \
    --config openrouter-cost \
    --arms A,B \
    --budget 2000
```

Report lands in `orchestration-eval/results/`. Increase `--limit` toward 9 (the full curated set) once the two-task smoke passes.

### Step 4 — Teardown

```bash
kill "$(cat "$DATA_DIR/possiblaw.pid")"  2>/dev/null || true
kill "$(cat "$DATA_DIR/gate-proxy.pid")" 2>/dev/null || true
rm -rf "$DATA_DIR"
rm -rf orchestration-eval/results/          # optional — keep for analysis
```

Verify port 3100 is untouched: `lsof -i :3100` should return nothing (or your pre-existing instance).

## H. Walls + Firm Overview (authenticated multi-lawyer)
<!-- verify-after-T4: the --auth-mode and restart re-wiring steps below were written against Task 4's spec -->

Manual, multi-human test this build defers to the operator — it needs two
real lawyer logins and a browser, which nothing in this repo's automated
battery drives. Full command reference: `docs/workflows/ethical-walls.md`.
Use a **disposable** instance (never port 3100 or your real data dir).

### Prerequisites

```bash
export DATA_DIR="$(mktemp -d)"
```

### Step 1 — Launch authenticated, then wall a client

```bash
./bin/possiblaw --variant codex --port 3199 --gate-port 3899 \
  --data-dir "$DATA_DIR" --auth-mode authenticated \
  --non-interactive --yes --mission "walls smoke test"

# fresh authenticated data dir → bootstrap the first admin:
pnpm -C paperclip paperclipai auth bootstrap-ceo

./bin/possiblaw --add-wall "Conflicted Client Inc" --variant codex \
  --port 3199 --data-dir "$DATA_DIR"
```

### Step 2 — Claim the board, invite two lawyers

- Accept the bootstrap-ceo invite as **Lawyer A** (becomes instance admin).
- In paperclip's dashboard, open **Company Invites**
  (`/:companyPrefix/company/settings/invites`) for the **main** company and
  invite **Lawyer B**. Do **not** invite Lawyer B to the walled `CON` company.
- Verify **Company Access** (`/:companyPrefix/company/settings/access`) on
  the walled company lists only the intended screened team.

### Step 3 — Verify Lawyer B cannot see the walled client

- Signed in as Lawyer B in paperclip's own dashboard: the walled company must
  not appear in the company switcher (`GET /api/companies` is
  membership-filtered).
- Launch the overview and connect as Lawyer B:

```bash
PAPERCLIP_BASE_URL=http://127.0.0.1:3199 pnpm -C firm-overview start
```

  Open `http://127.0.0.1:3860`, click **Connect**, approve as Lawyer B. The
  merged board must show the main company only — no row, no error chip, no
  name referencing the walled client anywhere in the page.

### Step 4 — Approve-from-overview as each lawyer

- As Lawyer A (invited to both companies, or connect a second overview
  instance / browser profile pointed at the same `PAPERCLIP_BASE_URL`):
  create a pending approval in the walled company, then approve it from the
  overview. Confirm the decision lands in paperclip (`GET
  /api/companies/:id/approvals`) exactly as a native-dashboard approval
  would.
- As Lawyer B: confirm no walled-company approval is ever visible or
  actionable, in either paperclip's dashboard or the overview.

### Step 5 — Teardown

```bash
kill "$(cat "$DATA_DIR/possiblaw.pid")"        2>/dev/null || true
kill "$(cat "$DATA_DIR/gate-proxy.pid")"       2>/dev/null || true
kill "$(cat "$DATA_DIR/gate-proxy-CON.pid")"   2>/dev/null || true
rm -rf "$DATA_DIR"
```

Verify port 3100 is untouched: `lsof -i :3100` should return nothing (or your pre-existing instance).
