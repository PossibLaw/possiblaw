# Legal MCP — pointer

The legal-data MCP server lives at **`mcp-servers/legal-data/`** (top-level
standalone component, same posture as `gate-proxy/` and `eval-harness/`).

It exposes U.S. case law (CourtListener REST v4) as four MCP tools —
`search_opinions`, `get_opinion`, `get_citation`, `get_docket` — each result
wrapped in a provenance envelope (`source`, `source_url`, `retrieved_at`,
`court`, `decided_date`, `citation`, `sha256`, `payload`). The `sha256` reuses
gate-proxy's `documentSha256` so a fetched authority fingerprints the same way
the citation gate checks agent output.

See `mcp-servers/legal-data/README.md` for tools, provenance, privacy
(`sanitizeQuery`), caching, and run commands.

This directory was previously an empty `.gitkeep`; it now just points at the
real component so the historical `layer/mcp/legal/` path resolves.
