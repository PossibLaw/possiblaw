# Operator Walkthrough

This is the repeatable path for proving PossibLaw as a Paperclip package.

## Goal

Start a clean Paperclip instance, import `companies/legal-operations`, open the localhost UI, and run the starter NDA matter through the imported company. The package now ships an expanded org chart, missing-info gates, notification skills, output-to-disk skills, and a reversible privacy encoder, in addition to the NDA vertical slice.

## Prerequisites

- Node.js ≥20.10 and pnpm available.
- Paperclip dependencies installed in `paperclip/`:

```bash
pnpm -C paperclip install
```

- The CLI that backs your chosen variant — only ONE is required:

  | Variant | CLI to install | Auth |
  |---|---|---|
  | `codex`  (default) | [Codex CLI](https://github.com/openai/codex-cli)  | `codex login --device-auth` |
  | `claude`           | [Claude CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/quickstart) | `claude login` |
  | `ollama`           | [OpenCode](https://opencode.ai) + [Ollama](https://ollama.com)  | none (fully local) — see Ollama section below |
  | `llamacpp`         | [OpenCode](https://opencode.ai) + [llama.cpp](https://github.com/ggml-org/llama.cpp) | none (fully local) — see llama.cpp section below |
  | `opencode`         | [OpenCode](https://opencode.ai) | `OPENCODE_API_KEY` (OpenCode Zen gateway) |
  | `openrouter`       | [OpenCode](https://opencode.ai) | `OPENROUTER_API_KEY` |

- (Optional) `pandoc` if you want DOCX deliverables in addition to Markdown:

```bash
brew install pandoc
```

## Environment Variables (Optional)

The package declares these via `inputs.env` in `.paperclip.yaml`. All are optional; sensible defaults apply when omitted. Provide them in the shell that runs `bin/possiblaw`, or wire them into agent secrets via the Paperclip UI after import.

| Variable | Used by | Purpose | Default |
|---|---|---|---|
| `PAPERCLIP_BASE_URL` | chief-of-staff, chief-counsel | Builds notification deep-links back to issues | `http://127.0.0.1:3100` |
| `POSSIBLAW_SLACK_WEBHOOK_URL` | chief-of-staff, chief-counsel | Slack incoming webhook (see `companies/legal-operations/skills/notify-slack/example-webhook-setup.md`) | unset → comment-only fallback |
| `POSSIBLAW_TEAMS_WEBHOOK_URL` | chief-of-staff | MS Teams incoming webhook | unset → comment-only fallback |
| `POSSIBLAW_DELIVERABLES_DIR` | nda-drafter, contract-reviewer | Where written deliverables land | `$HOME/PossibLaw/deliverables` |
| `POSSIBLAW_PRIVACY_KEY_DIR` | nda-drafter, contract-reviewer | Reversible privacy-encoder key store | `$HOME/.possiblaw/privacy-keys` |
| `POSSIBLAW_PRIVACY_WORDLIST` | nda-drafter, contract-reviewer | Operator-supplied confidential terms | unset |
| `POSSIBLAW_PRIVACY_MONEY_FLOOR` | nda-drafter, contract-reviewer | Currency redaction threshold (USD) | `10000` |
| `POSSIBLAW_PRIVACY_MODEL` | privacy-encoder | Ollama model the encoder calls | `llama3.1:8b` |

Webhook URLs are credentials — keep them out of the repo. Either set them per-shell or store them in Paperclip's secrets and bind by reference after import.

## One-command launch

From the repo root:

```bash
./bin/possiblaw
```

The launcher prompts for three things, then does everything else:

1. **Variant** — `codex`, `claude`, `ollama`, `llamacpp`, `opencode`, `openrouter`, or an `-api` twin. The launcher checks the matching CLI is installed and that any required local server (Ollama daemon, llama-server) is reachable.
2. **Org name** — defaults to `PossibLaw Legal Operations`. The launcher renames the imported company via `PATCH /api/companies/{id}` after import.
3. **Mission** — single line. Saved as the company description so it appears in the Paperclip UI banner.

What the launcher does:

1. Preflight checks (`pnpm`, `curl`, `python3`, paperclip submodule, the variant's CLI).
2. Privacy-lane scan — warns if the package contains `privacyTier: confidential` matters and Ollama is not running.
3. `paperclipai onboard --yes` in the background (sets up embedded Postgres, applies migrations, starts the server bound to `127.0.0.1:3100`).
4. Health-poll `/api/health` until 200.
5. Builds the `POST /api/companies/import` body from the package directory plus `companies/legal-operations/variants.yaml`, picking per-agent adapter + model overrides based on each agent's `metadata.possiblaw.modelLane`.
6. POSTs the body. Heartbeat prints elapsed seconds every 10s. After 90s without finishing it side-polls `/api/companies` to report partial progress.
7. `PATCH /api/companies/{id}` to save your mission as the company description.
8. Prints the dashboard URL and (unless `--no-browser`) opens it.

For a fresh test run from scratch:

```bash
./bin/possiblaw --reset --yes \
                --variant codex \
                --org-name "Acme Legal" \
                --mission "Litigation-first commercial-disputes boutique"
```

To preview only (no DB writes):

```bash
./bin/possiblaw --variant codex --dry-run --non-interactive --yes
# preview: agents=11 skills=38 projects=3 issues=3 warnings=0 errors=0
```

Common flags:

```
--variant <slug>      Skip the variant prompt
--mission "<text>"    Skip the mission prompt
--org-name "<text>"   Skip the org-name prompt
--non-interactive     Never prompt (requires --variant, --mission, --yes)
--dry-run             POST to /import/preview instead of /import
--reset               Wipe data dir before starting (prompts unless --yes)
--list-variants       Show available variants and exit
--no-browser          Don't auto-open the dashboard URL
--data-dir <path>     Override the Paperclip data dir (default ~/.possiblaw/paperclip-data)
--port <n>            Override the Paperclip port (default 3100)
```

## Variant setup

### codex (default)

1. Install Codex CLI: see [openai/codex-cli](https://github.com/openai/codex-cli).
2. Authenticate once: `codex login --device-auth` (opens a browser for ChatGPT subscription auth).

Per-lane reasoning effort applied at import:

- `high` — chief-of-staff, chief-counsel, commercial-lead, nda-drafter, contract-reviewer, intake-form-drafter (drafting + judgment)
- `medium` — finance-lead, marketing-lead, admin-lead, billing-prep, calendar-coordinator (routing + extractive)

### claude

1. Install Claude CLI per Anthropic's docs.
2. Authenticate once: `claude login`.

Per-lane model applied at import:

| Lane | Model |
|---|---|
| primary, drafting, review | `claude-opus-4-7` |
| routing | `claude-sonnet-4-6` |
| extractive | `claude-haiku-4-5` |

### codex-api / claude-api (API key instead of subscription)

Same models and lanes as their subscription twins, but billed against an API
key. Use these when subscription auth rejects models with "you don't have
access" errors — API auth usually unlocks the full catalog.

1. Export the key in the shell that runs the launcher:
   - `export OPENAI_API_KEY=...` for `--variant codex-api`
   - `export ANTHROPIC_API_KEY=...` for `--variant claude-api`
2. Run `./bin/possiblaw --variant codex-api` (or `claude-api`).

Where the key goes: after import, the launcher stores it **once** as a
paperclip company secret (provider `local_encrypted` — encrypted at rest),
then binds every agent to it with a `secret_ref` env reference. The raw key
never lands in package files, the import body, logs, or temp files. Rotate or
revoke it any time in the Paperclip UI under company secrets; agents pick up
the new value via the `latest` version reference.

Conversely, if you run a **subscription** variant (`codex` / `claude`) with
the matching API key exported in your shell, the CLI silently bills the API
account instead of the subscription — the launcher warns when it detects this.

### Preflight model probe (codex / codex-api / claude / claude-api)

Before starting anything, live runs probe each distinct lane model with one
minimal CLI request so "you don't have access to this model" errors surface
at launch instead of mid-issue. A failed probe blocks the launch and prints
per-model remediation options. Each probe is a tiny billable request (3
distinct models on the claude variants, 1 on codex). Skip with
`--skip-model-probe`; dry-runs never probe.

### ollama

Fully local — no cloud round-trips. Three pieces of setup:

1. **Install Ollama**: https://ollama.com
2. **Pull models** (you'll want both sizes for the lane mix):

   ```bash
   ollama pull llama3.1:8b
   ollama pull llama3.1:70b
   ```

3. **Install OpenCode**: https://opencode.ai
4. **Declare the Ollama provider** in `~/.config/opencode/opencode.json`. The launcher will offer to write this for you on first run; alternatively create it manually:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "provider": {
       "ollama": {
         "npm": "@ai-sdk/openai-compatible",
         "name": "Ollama (local)",
         "options": { "baseURL": "http://localhost:11434/v1" },
         "models": {
           "llama3.1:8b":  { "name": "Llama 3.1 8B" },
           "llama3.1:70b": { "name": "Llama 3.1 70B" }
         }
       }
     }
   }
   ```

5. Start Ollama: `ollama serve` (or rely on the auto-start launcher daemon).
6. Run `./bin/possiblaw --variant ollama`.

Quality caveat: Llama 3.1 trails the cloud variants on long legal-drafting tasks. Use this variant for fully-local development or where confidential matter content cannot leave the machine. See [known-limitations.md](known-limitations.md#ollama-variant).

### llamacpp (fully local, HF GGUF models — no Ollama client)

Runs any Hugging Face GGUF model through a local [llama.cpp](https://github.com/ggml-org/llama.cpp) server. Setup:

1. **Install llama.cpp**: `brew install llama.cpp` (provides `llama-server`).
2. **Install OpenCode**: https://opencode.ai
3. **Start llama-server with the GGUF you want** (it downloads from Hugging Face on first run):

   ```bash
   llama-server -hf bartowski/Meta-Llama-3.1-8B-Instruct-GGUF --port 8080
   ```

4. **Declare the llamacpp provider** in `~/.config/opencode/opencode.json`. The launcher offers to write this on first run; manual shape:

   ```json
   {
     "$schema": "https://opencode.ai/config.json",
     "provider": {
       "llamacpp": {
         "npm": "@ai-sdk/openai-compatible",
         "name": "llama.cpp (local llama-server)",
         "options": { "baseURL": "http://127.0.0.1:8080/v1" },
         "models": {
           "default": { "name": "llama-server loaded model" }
         }
       }
     }
   }
   ```

5. Run `./bin/possiblaw --variant llamacpp`.

llama-server serves whichever model it was started with and ignores the requested model name, so every lane pins `llamacpp/default` — you choose quality by choosing which GGUF to load. The launcher preflight checks `http://127.0.0.1:8080/v1/models` is reachable before a live run. Same quality caveat as the Ollama variant; same privacy posture (counts as the local lane for confidential matters).

### opencode (OpenCode Zen gateway)

First-class OpenCode: models served by OpenCode's own Zen gateway under a single key — no other vendor logins.

1. **Install OpenCode**: https://opencode.ai
2. Get a Zen key (`opencode auth login` → OpenCode Zen, or the OpenCode dashboard) and export it: `export OPENCODE_API_KEY=...`
3. Run `./bin/possiblaw --variant opencode`.

Lane pins mirror the `claude` variant 1:1 (`opencode/claude-opus-4-7` on judgment lanes, `claude-sonnet-4-6` routing, `claude-haiku-4-5` extractive) because Zen serves the same Claude models. Prefer a different provider you've already connected via `opencode auth login`? Edit the lane models in `companies/legal-operations/variants.yaml` to that provider's prefix (e.g. `anthropic/claude-opus-4-7`).

The key is stored the same way as the `-api` variants: once, as an encrypted paperclip company secret, bound to agents via `secret_ref` — never in package files or the import body.

### openrouter

One key, the whole multi-vendor cloud catalog.

1. **Install OpenCode**: https://opencode.ai
2. Create a key at https://openrouter.ai/keys and export it: `export OPENROUTER_API_KEY=...`
3. Run `./bin/possiblaw --variant openrouter`.

No `opencode.json` block is needed — OpenCode's native openrouter provider activates when the key is present in the agent process env. Lane pins mirror the `claude` variant via OpenRouter model IDs (`openrouter/anthropic/claude-opus-4.7` judgment, `claude-sonnet-4.6` routing, `claude-haiku-4.5` extractive — note OpenRouter uses dots where Anthropic-direct uses dashes). Live launches verify each pin against the public catalog (`openrouter.ai/api/v1/models`, keyless) and block with remediation if a pin has rotted; skip with `--skip-model-probe`.

Key storage matches the other keyed variants: encrypted company secret + per-agent `secret_ref`.

## UI Demo

1. Open the dashboard URL the launcher printed (or the browser tab it opened).
2. Select the company you just created.
3. Open `NDA Matters`.
4. Open `Draft Mutual NDA Demo`.
5. Trigger or assign the issue to `Chief of Staff`.
6. Confirm the route: `Chief of Staff` → `Chief Counsel` → `Commercial Lead` → `NDA Drafter`.
7. Confirm `NDA Drafter` writes the deliverable to `$POSSIBLAW_DELIVERABLES_DIR/possiblaw-legal-operations/nda-matters/draft-mutual-nda-demo/<timestamp>-mutual-nda-acme-globex.md` and posts the absolute path as a comment.

The starter task contains the regulated-work note at matter intake. Generated NDA work product should not append repeated disclaimer boilerplate.

## Exercising other capabilities

### Missing-information gate

Open a new issue under `NDA Matters` with only "Draft an NDA" as the body (no parties, no purpose). Chief of Staff → Commercial Lead → NDA Drafter should escalate via the `missing-info-gate` skill: the issue moves to `blocked` and a structured `Missing Information Gate` comment lists the required fields. The operator answers in a comment beginning with `RESUME:` and the agent picks back up.

### Notification

If `POSSIBLAW_SLACK_WEBHOOK_URL` is configured, the gate comment also fires a Slack message with a deep-link to the issue. With no webhook configured, the agent posts a `[NOTIFY:SLACK_UNCONFIGURED]` comment instead and continues — never silent.

### Contract review specialist

Create a new issue under `NDA Matters` with body "Review this MSA: <paste>". Commercial Lead routes to `contract-reviewer`, which uses `legal-contract-review-dispatcher` to classify, then `legal-saas-msa-review` for the actual review with structured GREEN/YELLOW/RED clause findings.

### Routines

The package declares two routines in `.paperclip.yaml`:

- `nightly-conflicts-check` — runs `0 2 * * *` America/Chicago, intended for Chief Counsel to scan open matters for conflicts notices.
- `weekly-renewal-scan` — runs `0 9 * * MON`, intended for Chief Counsel to run `legal-renewal-tracker` against contract artifacts.

Routine binding to a specific recurring issue is operator-configurable in the Paperclip UI after import.

### Privacy encoder

Mark a matter with `metadata.possiblaw.privacyTier: confidential`. `NDA Drafter` invokes the `privacy-encoder` skill before any cloud-capable call. The skill checks Ollama is reachable (`http://localhost:11434/api/version`) and the model is pulled — BLOCKS otherwise. With Ollama up, confidential party names, contact info, money figures, etc. are replaced with stable placeholders, a per-matter key file is written to `$POSSIBLAW_PRIVACY_KEY_DIR/<matter-id>.json` with `600` perms, the cloud model sees only the masked text, and the agent decodes the response before posting.

The launcher emits a non-blocking warning at startup if the package contains confidential matters and Ollama is not running.

## Adapter notes

Adapter + model + reasoning-effort per agent is no longer baked into the package markdown. The `companies/legal-operations/.paperclip.yaml` agent blocks contain a sensible default (`codex_local` + `gpt-5.3-codex`), but the launcher overrides those at import time based on the chosen variant and the agent's `metadata.possiblaw.modelLane`. See `companies/legal-operations/variants.yaml` for the matrix.

After import, use Paperclip's agent environment test for one imported agent and confirm the adapter hello probe succeeds.

## Runtime troubleshooting

If Codex reports a subscription usage limit during the demo, Paperclip leaves the affected issue visible as `blocked` with an adapter failure or recovery note. Wait for the quota reset, add credits, or switch the affected agents to another variant via the Paperclip UI before resuming.

If a recovery run reports that a fallback model is unsupported for the current ChatGPT account, keep the package default on the supported `gpt-5.3-codex` lane and resume after the account/model issue is resolved.

If `output-local-docx` reports BLOCKED with `pandoc not installed`, run `brew install pandoc` and retry; the markdown deliverable still wrote successfully.

If `privacy-encoder` reports the key directory is on a synced cloud folder (iCloud, Dropbox, OneDrive, Google Drive), the warning is non-blocking. Move the key dir off the sync target if you need the matter to be local-only.

If the launcher hangs on `paperclipai onboard`, kill it (`Ctrl-C` or `kill $(cat $DATA_DIR/possiblaw.pid)`) and inspect `$DATA_DIR/possiblaw.log` for the failure. The most common cause is port 3100 already in use; pass `--port <free-port>` to work around it.

## Reset

The launcher uses `~/.possiblaw/paperclip-data` by default. To start from scratch:

```bash
./bin/possiblaw --reset --yes
```

Or wipe the data dir manually:

```bash
rm -rf ~/.possiblaw/paperclip-data
```

Privacy-encoder key files in `$POSSIBLAW_PRIVACY_KEY_DIR` are NOT cleaned by `--reset` — they live in the operator's home directory by default. Remove explicitly if a matter must be unrecoverable:

```bash
rm -rf "${POSSIBLAW_PRIVACY_KEY_DIR:-$HOME/.possiblaw/privacy-keys}"
```
