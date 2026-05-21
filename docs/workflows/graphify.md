# Graphify Indexing (Optional)

Graphify is an optional codebase-indexing tool. It reads source files, builds a queryable knowledge graph, and emits a short report (`GRAPH_REPORT.md`) plus a JSON graph.

Use Graphify when generated structure would cut orientation time on a repo too large to read top-to-bottom each session. For small or simple repos, the file-based artifact pipeline is enough — do not use Graphify as a default.

Source of truth: live code and tests. Graphify output is advisory only.

## When to Use

- Repo is large enough that "where does X live?" takes >15 minutes of searching.
- Same repo is picked up across 3+ sessions and re-orientation is costly.
- A non-developer user asks for "codebase indexing", "create a codebase graph", or similar.

Skip when:
- The repo is small or the task is narrowly scoped.
- The user has not asked for persistent context.
- Adding a generated artifact would create confusion over what is authoritative.

## Graphify Indexing Request Contract

Use this contract when a non-developer user asks for "Graphify indexing", "codebase indexing", "create a codebase graph", "make a wiki graph", or similar wording.

The agent should do the setup and run the workflow. Do not hand the user a list of developer commands unless blocked by permissions or missing approvals.

Required steps:

1. Resolve the repo root with `git rev-parse --show-toplevel` and confirm it is not a temp directory.
2. Read `.agent/WIKI.md` and this file.
3. Update `.agent/WIKI.md` so `Enabled` is `ON` and `Wiki backend` is `graphify`.
4. Set `Graphify output root` to `graphify-out/` unless the user requested another path.
5. Create or update `.graphifyignore` before running Graphify.
6. Add `graphify-out/` to `.gitignore` unless the user explicitly wants generated graph output committed.
7. Check whether the `graphify` command is available.
8. If Graphify is missing, ask for approval before installing the official package. The upstream PyPI package is `graphifyy` (the double-y is correct — the CLI entry point is `graphify`). Canonical install: `pip install graphifyy`. Upstream project: <https://github.com/safishamsi/graphify>.
9. Run a one-time graph build for the repo root, normally `graphify .`.
10. If the user asked for Obsidian output, use Graphify's Obsidian option and write to the configured vault path. Otherwise keep output in `graphify-out/`.
11. Read `graphify-out/GRAPH_REPORT.md` enough to confirm the graph was created.
12. Update `.agent/WIKI.md` Last Sync with timestamp, output root, and notes.
13. Report the exact output paths and remind the user that generated graph claims must be verified against source before implementation.

## Baseline `.graphifyignore`

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

## Do Not Install Without Explicit User Approval

- always-on assistant hooks
- git hooks
- watch mode
- MCP server
- Neo4j export or push
- Obsidian sync

## Expected Local Output

```text
graphify-out/
├── graph.html
├── GRAPH_REPORT.md
├── graph.json
└── cache/
```

## Final Response Shape (Non-Technical)

- state whether indexing completed
- give the output folder
- identify the report file to open first
- list any skipped optional integrations
- list any blocker and the exact approval or missing dependency needed

## Using the Output

- Read `GRAPH_REPORT.md` for high-level structure.
- Use focused graph queries for specific questions; do not paste raw `graph.json` wholesale into prompts.
- Verify any graph-derived claim against source code before using it in implementation.
- If graph output contradicts the code, treat the graph as stale and either regenerate or ignore it.

For "review the entire repo" requests: start with the wiki index and map pages first, then verify critical claims in code. See `docs/workflows/wiki.md` for wiki-mode trust order.
