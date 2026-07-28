---
name: scaling-up-with-graphify
version: 1.0.0
description: Use when a codebase has grown large (roughly 40–50+ source files) or you are working inside an existing large repo and re-reading files is wasteful; this is the skill behind Tier 2 Scale mode — build a Graphify index once, then query the index instead of re-reading source.
---

# Scaling Up With Graphify

Scale mode (Tier 2) turns on indexed retrieval so the agent **queries an index
instead of re-reading files**. Graphify builds a queryable knowledge graph of the
code plus a pre-summarized wiki layer. Tier 2 is additive — all Tier 1 rules stay on.
Full reference: `docs/workflows/graphify.md`.

## Inputs
- the repo root (`git rev-parse --show-toplevel`)
- confirmation that the codebase is large enough to warrant indexing
- explicit user approval before installing anything

## Steps
1. **Confirm it's worth it.** Only index when the repo is large (~40–50+ source
   files) or orientation keeps costing real time. Small repos stay in Tier 1.
2. **Ask before installing.** Get the user's approval before installing any tool.
3. **Install the Graphify CLI** (package name is `graphifyy` — the double-y is
   correct; the CLI entry point is `graphify`):
   - `uv tool install graphifyy` (preferred), or
   - `pipx install graphifyy`, or
   - `pip install graphifyy`
4. **Build the index** with `/graphify .` at the repo root. Run inside the IDE
   session: no API key is needed and extraction uses tree-sitter locally, so the
   code never leaves the machine.
5. **Query the index instead of re-reading files:**
   - `/graphify query "..."` — ask about the code
   - `/graphify path "A" "B"` — how two things connect
   - `/graphify explain "Thing"` — explain a symbol/module
   - read the pre-summarized wiki layer first: `graphify-out/wiki/index.md`
   - optional MCP server: `/graphify ./ --mcp` (tools: `query_graph`, `get_node`,
     `get_neighbors`, `shortest_path`, `god_nodes`)
6. **Record the mode.** Set `Tier: 2 (Scale)` and `Scale mode: ON` in
   `.agent/HANDOFF.md`, and set `Wiki backend: graphify` in `.agent/WIKI.md`.
7. **Treat output as advisory.** Verify any graph- or wiki-derived claim against
   the source before implementing. If they disagree, the source wins.

## Outputs
- a built index under `graphify-out/` with a usable wiki layer
- `.agent/HANDOFF.md` and `.agent/WIKI.md` updated to reflect Scale mode
- the agent answering "where does X live?" by query, not by re-reading files

## Common Mistakes
- installing anything without explicit user approval
- re-reading source files after the index already exists
- treating graph/wiki output as authoritative instead of verifying against source
- enabling Scale mode on a small repo that Tier 1 already handles
