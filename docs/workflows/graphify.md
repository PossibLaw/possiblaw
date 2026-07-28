# Graphify Indexing (Tier 2 — Scale Mode)

Graphify is the engine behind **Tier 2 Scale mode**. It reads your source files,
builds a queryable knowledge graph, and writes a pre-summarized **wiki layer** plus
a JSON graph. The whole point: once the index exists, **query the index instead of
re-reading files**. On a large repo that is dramatically cheaper than re-reading
source every session.

(Reference: Graphify ~v0.1.8. PyPI package is `graphifyy` — the double-y is correct.
The CLI entry point is `graphify`. Upstream: <https://github.com/safishamsi/graphify>.)

Source of truth is always live code and tests. Graphify output is **advisory** and
must be verified against source before you implement anything.

## When to Use

Turn this on with `/possiblaw-starter:scale` when:

- the repo is large (roughly 40–50+ source files) and "where does X live?" keeps
  costing real search time, or
- you're working inside an existing large codebase across several sessions.

Skip it (stay in Tier 1) when:

- the repo is small or the task is narrowly scoped,
- the user hasn't asked for persistent context, or
- a generated artifact would just add confusion over what's authoritative.

## Install

The agent does the setup — don't hand a non-developer a wall of commands unless
you're blocked on permissions. **Ask for approval before installing anything.**

Install the CLI (package `graphifyy`, command `graphify`):

```bash
uv tool install graphifyy   # preferred
# or
pipx install graphifyy
# or
pip install graphifyy
```

## Build the Index

From the repo root:

```bash
/graphify .
```

Run inside the IDE session: **no API key is needed**, and extraction uses
tree-sitter **locally**, so your code never leaves the machine. An LLM is only
involved for non-code content (e.g. summarizing prose), and the local run is free.

For an incremental rebuild after changes — much cheaper than a full re-index:

```bash
/graphify --update
```

## Query Instead of Re-Reading

Once the index exists, ask it questions rather than re-opening source files:

```bash
/graphify query "how does authentication work"
/graphify path "LoginForm" "Database"     # how two things connect
/graphify explain "PaymentService"          # explain a symbol or module
```

**Consult the wiki layer first.** `graphify-out/wiki/index.md` is a pre-summarized,
human-readable memory tier — cheaper to read than the raw graph. Start there for
orientation, then drill into focused queries, and only open `graphify-out/graph.json`
for targeted lookups. Do not paste the whole `graph.json` into a prompt.

## Optional MCP Server

If the user approves, expose the graph to tools over MCP:

```bash
/graphify ./ --mcp
```

Tools exposed: `query_graph`, `get_node`, `get_neighbors`, `shortest_path`,
`god_nodes`.

## Expected Local Output

```text
graphify-out/
├── wiki/
│   └── index.md        # pre-summarized memory tier — read this first
├── graph.json          # the queryable graph
├── graph.html          # optional visual
└── cache/
```

Record the mode after a successful build: set `Tier: 2 (Scale)` and
`Scale mode: ON` in `.agent/HANDOFF.md`, and `Wiki backend: graphify` in
`.agent/WIKI.md` (with the output root and a Last Sync timestamp).

## Baseline `.graphifyignore`

Create or update this before running Graphify so secrets and noise stay out:

```gitignore
.env
.env.*
*.pem
*.key
*.p12
*.log
node_modules/
vendor/
dist/
build/
coverage/
.cache/
graphify-out/
.git/
.claude/
.agent/
```

Add `graphify-out/` to `.gitignore` unless the user explicitly wants generated
graph output committed.

## Contract

- **Ask before installing** the CLI or any optional piece.
- **Output is advisory.** Verify any graph- or wiki-derived claim against the
  source before implementing. If they disagree, the source code wins; treat the
  graph as stale and regenerate or ignore it.
- **Do not install always-on tooling without explicit user approval** — that
  includes watch mode, git hooks, the MCP server, Neo4j export/push, and Obsidian
  sync.

## Final Response Shape (Non-Technical)

- state whether indexing completed
- give the output folder and name the wiki index to open first
  (`graphify-out/wiki/index.md`)
- list any skipped optional integrations
- list any blocker and the exact approval or missing dependency needed

For "review the entire repo" requests: start with the wiki index, then verify
critical claims in code. See `docs/workflows/wiki.md` for wiki-mode trust order and
`docs/workflows/token-management.md` for why querying the index beats re-reading.
