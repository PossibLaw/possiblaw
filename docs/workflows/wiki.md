# Wiki Mode (Optional)

Use this mode when repo orientation costs too much time each session.
Default is `OFF`.

## Purpose

A wiki is a persistent, LLM-maintained knowledge layer that accelerates context loading.
It is not a replacement for source code verification.

## Trust Order (Required)

1. Source code, tests, and runtime behavior
2. Active state artifacts (`PLAN.md`, `TEST.md`, `REVIEW.md`, `HANDOFF.md`)
3. Curated wiki pages and summaries with source citations
4. Generated graph/wiki output, including Graphify reports and query results

If wiki content conflicts with code, treat wiki content as stale and update it.

## Backend Selection

Configure the backend in `.agent/WIKI.md`:

- `manual`: the default Markdown/Obsidian workflow. Agents or humans maintain `index.md`, `log.md`, and `pages/*`.
- `graphify`: optional generated graph backend. Graphify may create `graphify-out/`, `GRAPH_REPORT.md`, `graph.json`, cache files, visualizations, and optional wiki pages.

Do not enable service-backed or always-on memory/indexing by default. Ix is intentionally out of scope for this Starter Pack workflow unless the project later adopts a separate advanced integration.

## Setup

You may keep the wiki:
- Inside the repo (example: `docs/wiki/`)
- In an external Obsidian vault on local disk
- As local Graphify output under `graphify-out/` when `Wiki backend` is `graphify`

Required config file:
- `.agent/WIKI.md` stores `Enabled`, `Wiki backend`, vault path, wiki root, Graphify output paths, and sync rules.

Recommended core files:
- `index.md` (topic/page index)
- `log.md` (append-only operations log)
- `pages/*` (entity/concept/project pages)

Path convention:
- `wiki_root = {vault_root}/codebases/{repo_name}`
- First-time setup should write this path into `.agent/WIKI.md`.

## Startup Flow (Wiki Enabled)

1. Read `.agent/WIKI.md`, then active `HANDOFF.md` and `PLAN.md`.
2. If `Wiki backend` is `graphify` and `graphify-out/GRAPH_REPORT.md` exists, read it for orientation.
3. Read configured wiki index and 1-3 relevant wiki pages when a wiki root is configured.
4. Verify wiki and graph claims against live code before editing files.
5. Execute task and checks.
6. Update wiki pages and append `log.md` with what changed.

For `manual`, the wiki index is the main entry point.

For `graphify`, use `GRAPH_REPORT.md` for high-level structure and focused graph queries for specific questions. Sync generated pages into a manual wiki only when the team explicitly wants that extra artifact. Do not paste raw `graph.json` wholesale into prompts.

## Graphify Backend (Optional)

Graphify is the optional generated-graph backend for wiki mode. It is advisory only — source code, tests, runtime behavior, and active state artifacts remain higher authority.

Full setup, the Graphify Indexing Request Contract, baseline `.graphifyignore`, and expected outputs live in `docs/workflows/graphify.md`. Do not use Graphify as the default path for small repos or simple tasks.

For "review the entire repo" requests: start with the wiki index and map pages first, then verify critical claims in code.

## Source Ingest Flow

When new source material is added:
1. Add raw source reference to `log.md`.
2. Update relevant wiki pages with summaries and cross-links.
3. Tag uncertain claims as `UNCONFIRMED`.
4. Record exact file path and timestamp for each new claim.
5. Update `.agent/HANDOFF.md` and `.claude/history.md` with wiki sync details.

## Required Page Metadata

Every wiki page should include:
- Source paths or URLs
- Last verified date (`YYYY-MM-DD`)
- Confidence (`CONFIRMED`, `PROVISIONAL`, `UNCONFIRMED`)

## Wiki Lint (Periodic)

Run a periodic pass to detect:
- stale claims
- contradictions
- orphan pages
- missing source references

Useful baseline command:
- `rg -n "UNCONFIRMED|TODO|TBD|FIXME" docs/wiki`

## Rules

Always:
- Use wiki for orientation, not final authority.
- Verify critical claims in code before implementation.
- Update wiki after validated changes.

Never:
- Ship code based only on wiki summaries.
- Treat generated wiki pages as evidence without source citations.
