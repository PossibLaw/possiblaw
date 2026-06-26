# Build — MCP-server registry + renderer (declare MCP once)

*Standalone build spec. Status: **SHIPPED** — `companies/legal-operations/mcp-servers.yaml`
(registry), `bin/_possiblaw_mcp.py` (stdlib-only renderer + `--self-test`), and a
dry-run-aware registration step in `bin/possiblaw` (gated behind a default-ON
flag, skippable with `--skip-mcp`).*

## Why

PossibLaw uses many MCP servers (today `legal-data` + the official CourtListener
MCP; tomorrow statutes, docket monitors, internal tools). Paperclip does **not**
manage MCP — each variant's adapter wraps a model-runtime CLI that reads MCP
from **its own** config file, in **four different schemas**. Hand-editing four
files per server, per machine, is the failure mode this build removes.

Declare each server **once** in `mcp-servers.yaml`; the launcher renders it into
whichever CLI config the chosen variant's adapter uses.

## Registry schema (`companies/legal-operations/mcp-servers.yaml`)

Top-level `mcpServers:` is a list. Each entry:

| Field | Type | Meaning |
|---|---|---|
| `name` | string (unique) | Server id, used as the config key in every target. |
| `transport` | `stdio` \| `http` | stdio launches a local command; http is a remote URL. |
| `command` | string (stdio) | Launch command, e.g. `tsx mcp-servers/legal-data/src/server.ts`. |
| `url` | string (http) | Remote endpoint, e.g. `https://mcp.courtlistener.com`. |
| `auth` | `none` \| `token-env:<VAR>` \| `oauth` | See "Auth handling". |
| `grantTo` | list of agent slugs | **Advisory** scoping — see the limitation below. |
| `privacy` | short string | Posture tag (`sanitize-queries`, `gate-routed`, `standard`). Documentation / forward hook only. |
| `description` | one line | Human summary. |

## The four render targets

The renderer (`bin/_possiblaw_mcp.py --adapter <type>`) emits the documented
shape per paperclip adapter type. The launcher writes/merges it into:

| Adapter (`variants.<slug>.default.adapterType`) | Variants | Config file | Write mode |
|---|---|---|---|
| `opencode_local` | opencode, ollama, llamacpp, openrouter | `~/.config/opencode/opencode.json` | merge `"mcp"` block |
| `codex_local` | codex, codex-api | `~/.codex/config.toml` | append TOML fragment |
| `claude_local` | claude, claude-api | `$REPO_ROOT/.mcp.json` | merge `"mcpServers"` |
| `gemini_local` | gemini, gemini-api | `~/.gemini/settings.json` | merge `"mcpServers"` |

Rendered shapes (one stdio + one http example each):

**opencode_local** — `{"mcp": {...}}`, `type: local|remote`, `command` as argv array:
```json
{ "mcp": {
  "legal-data": { "type": "local", "command": ["tsx","mcp-servers/legal-data/src/server.ts"], "enabled": true },
  "courtlistener-official": { "type": "remote", "url": "https://mcp.courtlistener.com", "enabled": true }
} }
```

**codex_local** — TOML `[mcp_servers.<name>]`:
```toml
[mcp_servers.legal-data]
command = "tsx"
args = ["mcp-servers/legal-data/src/server.ts"]

[mcp_servers.courtlistener-official]
url = "https://mcp.courtlistener.com"
```

**claude_local** — `{"mcpServers": {...}}`, `command`/`args` (stdio) or `type:http` (http):
```json
{ "mcpServers": {
  "legal-data": { "command": "tsx", "args": ["mcp-servers/legal-data/src/server.ts"] },
  "courtlistener-official": { "type": "http", "url": "https://mcp.courtlistener.com" }
} }
```

**gemini_local** — `{"mcpServers": {...}}`, `command`/`args` (stdio) or `httpUrl` (http):
```json
{ "mcpServers": {
  "legal-data": { "command": "tsx", "args": ["mcp-servers/legal-data/src/server.ts"] },
  "courtlistener-official": { "httpUrl": "https://mcp.courtlistener.com" }
} }
```

### Auth handling

- `none` → no credential rendered.
- `token-env:VAR` → the runtime gets an env passthrough **by name only** — never
  the secret value. Value form is per-runtime: `{env:VAR}` for opencode,
  `${VAR}` for claude/gemini/codex.
- `oauth` → **http only**; the renderer emits the URL entry and **no secret**.
  First run is interactive inside the CLI (browser/device OAuth).

The launcher never writes secrets — only env var **names** pass through.

## `grantTo` is advisory (honest limitation)

All four CLI MCP configs are **GLOBAL per runtime, not per-subagent**. None of
the four CLIs lets you scope an MCP server to a single agent today. So `grantTo`
**cannot be enforced at the CLI layer**. The launcher renders the **UNION** of
all registry servers into the runtime config; `grantTo` is **documentation and a
forward hook** describing which agents are *intended* to use each server.

The renderer's optional `--agent <slug>` filter (include servers whose `grantTo`
contains the slug, plus empty-`grantTo` globals) is a convenience view for
callers — it does **not** create real per-agent isolation in the runtime.

## Seed entries

- **`legal-data`** — stdio, `command: tsx mcp-servers/legal-data/src/server.ts`
  (the real `start` script from that package). `auth: none` — the adapter's
  upstream (official CourtListener MCP) is **OAuth**, not a token/REST upstream,
  so the server reads no `COURTLISTENER_API_KEY`. `grantTo`:
  legal-research-analyst, case-law-summarizer, legal-citation-checker,
  litigation-docket-monitor, ip-infringement-analyst. `privacy: sanitize-queries`.
- **`courtlistener-official`** — http, `https://mcp.courtlistener.com`,
  `auth: oauth`, `grantTo: [legal-research-analyst]`, `privacy: standard`.

## Evals (the `--self-test` cases)

`python3 bin/_possiblaw_mcp.py --self-test` covers:

- **Happy** — each of the 4 adapters renders a stdio entry and an http entry
  under the correct top-level key (`mcp` / `mcpServers` / TOML `[mcp_servers.*]`).
- **Auth** — `token-env:VAR` injects the env passthrough per runtime; `oauth`
  renders no secret on the http entry.
- **Filter** — `--agent` includes granted servers, excludes non-granted, always
  includes empty-`grantTo` globals.
- **Merge** — `--merge-into` preserves existing keys (e.g. `provider`, a
  pre-existing `mcp` entry) and adds the rendered block; originals not mutated;
  codex + `--merge-into` is rejected (TOML, append-only).
- **Failure** — invalid adapter and missing `mcpServers` exit non-zero with a
  clear message.

## How to add the Nth MCP

Append a block to `companies/legal-operations/mcp-servers.yaml` — **no code
changes**:

```yaml
  - name: my-server
    transport: stdio            # or: http
    command: node tools/my-server.js   # or: url: https://example.com/mcp
    auth: token-env:MY_API_KEY  # or: none / oauth
    grantTo: [some-agent-slug]  # advisory
    privacy: standard
    description: One line.
```

Re-run `./bin/possiblaw --variant <v>` (or `--skip-mcp` to bypass). Dry-run
prints what *would* be registered and to which file, writing nothing.

## UNCONFIRMED schema fields (verify against installed CLI versions)

Marked in `bin/_possiblaw_mcp.py` comments. Best-documented forms used:

- OpenCode `mcp` entry: `type: local|remote`, `command` argv array, `environment`
  map, `enabled`.
- Codex `~/.codex/config.toml`: `[mcp_servers.<name>]` with `command`/`args`
  (stdio) or `url` (http) and an `[mcp_servers.<name>.env]` table.
- Claude `.mcp.json` http form: `{"type":"http","url":...}`.
- Gemini `settings.json` http form: `{"httpUrl":...}`.

## References

- Renderer: `bin/_possiblaw_mcp.py` (stdlib-only; mirrors `bin/_possiblaw_variants.py`).
- Registry: `companies/legal-operations/mcp-servers.yaml`.
- Launcher step: `bin/possiblaw` (MCP-server registration block).
- Seed server: `mcp-servers/legal-data/` and `docs/builds/courtlistener-legal-data-mcp.md`.
