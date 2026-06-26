---
name: connector-courtlistener
description: Research U.S. federal and state legal opinions, dockets, and citations through the legal-data MCP server (CourtListener REST v4, headless). Call the MCP tools by name; each result is a provenance envelope. Raw curl REST is a fallback only.
metadata:
  sources:
    - path: layer/connectors/courtlistener.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# CourtListener Connector

## What This Is

CourtListener is a free, public legal-research database maintained by the Free Law Project: U.S. federal and state opinions, dockets, oral arguments, and PACER-sourced documents. It is PossibLaw's open-access stand-in for paid platforms (Westlaw, Lexis) during the PoC and for any matter where free coverage is sufficient.

**The connector is delivered as an MCP server, not a curl recipe.** PossibLaw runs a thin trust-adapter MCP — `legal-data` (`mcp-servers/legal-data/`) — registered once in `companies/legal-operations/mcp-servers.yaml`. At launch, `bin/possiblaw` renders that registry entry into the active variant's runtime CLI MCP config (opencode.json / `~/.codex/config.toml` / `.mcp.json` / `~/.gemini/settings.json`) via `bin/_possiblaw_mcp.py`, so the tools appear in the agent's runtime and the agent **calls the tools by name**. See `docs/builds/mcp-registry.md`.

The adapter's default upstream is **headless token-REST** against CourtListener REST v4 (`https://www.courtlistener.com/api/rest/v4/`): no OAuth, no browser redirect, no account required. A `COURTLISTENER_API_KEY` raises rate limits; when unset, anonymous access works at low volume. (An optional OAuth-MCP upstream mode exists behind `POSSIBLAW_CL_UPSTREAM=mcp` — see `mcp-servers/legal-data/README.md` — but the default executable path is headless and needs no credentials.)

## MCP Tools (the executable path)

The `legal-data` server exposes a fixed set of four tools. Call them by name through the runtime's MCP tool interface:

| Tool | Params | Maps to (REST v4) |
|---|---|---|
| `search_opinions` | `query` (required), `court?`, `filed_after?` (YYYY-MM-DD), `filed_before?` (YYYY-MM-DD) | `GET /search/?q=<query>&type=o[&court=][&filed_after=][&filed_before=]` |
| `get_opinion` | `id` (required) | `GET /opinions/<id>/` |
| `get_citation` | `cite` (required, e.g. `410 U.S. 113`) | `GET /search/?q="<cite>"&type=o` |
| `get_docket` | `id` (required) | `GET /dockets/<id>/` |

### Every result is a provenance envelope

Each tool returns a **provenance envelope** wrapping the upstream payload:

```json
{
  "source": "courtlistener",
  "source_url": "https://www.courtlistener.com/opinion/108713/roe-v-wade/",
  "retrieved_at": "2026-06-26T12:00:00.000Z",
  "court": "Supreme Court of the United States",
  "decided_date": "1973-01-22",
  "citation": "410 U.S. 113",
  "sha256": "<documentSha256 of the result's fingerprint text>",
  "payload": { "...": "the upstream REST result, verbatim" }
}
```

- `source_url` / `court` / `decided_date` / `citation` are extracted **best-effort** and **omitted when absent** — never invented.
- `sha256` is **always** present.
- The raw CourtListener data is preserved verbatim under `payload`.

**Cite from the envelope.** Use the envelope's `citation` and `source_url` (and `court` / `decided_date`) when recording a finding — not anything reconstructed from memory. If a facet is absent from the envelope, read it from `payload`, do not fabricate it.

## Authority provenance (anti-hallucination)

On every successful retrieval that yields a citation, the adapter **registers the authority with the gate** (`POST /quality/authority`, best-effort — swallowed if the gate is down or `GATE_PROXY_URL` is unset). The gate records that this authority was actually retrieved. Later, when an outbound court filing / third-party egress is inspected, the gate flags any cited authority that was **never retrieved** — a hallucination signal. Default is **flag/record, not block**: the gate records `unbackedCitations` on the egress receipt (surfaced in the Matter Trust Report) without changing pass/block behavior. Blocking is **policy-opt-in** via `citationGate.requireAuthorityProvenance` in `gate-policy.yaml`. Practically: cite only what you retrieved through these tools, and the loop stays clean.

## Query Privacy

Queries themselves can carry privileged facts — a search string like `"Acme Holdings v. Smith arbitration clause 2025"` may identify a matter, client, or strategy. Keep queries to neutral legal terms (e.g. `indemnification software license` rather than the client's name).

For **confidential** or **privileged** matters the adapter **enforces** this: `sanitizeArgs` strips client identifiers (legal-entity names, emails, SSNs, EINs, phones) from the `query` **before** the request leaves the boundary, leaving neutral legal terms. Set the matter tier via env `POSSIBLAW_MATTER_PRIVACY_TIER`. This is enforcement, not just advice — but write neutral queries anyway so the search stays relevant after redaction.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `COURTLISTENER_API_KEY` | DRF token sent as `Authorization: Token <key>` for higher rate limits. **Optional** — anonymous use works at low volume; when unset the header is omitted entirely. | unset | Free account at https://www.courtlistener.com → Profile → API |
| `POSSIBLAW_MATTER_PRIVACY_TIER` | `standard` \| `confidential` \| `privileged`; gates query sanitization. | `standard` | Matter context |

## When to Invoke

- An agent needs to surface a U.S. federal or state opinion by citation, party name, or keyword → `search_opinions` or `get_citation`.
- A research agent needs full opinion text or metadata (court, date filed, citations) → `get_opinion`.
- A matter-intake agent wants to confirm a docket exists for a referenced case → `get_docket`.

Do not invoke for non-U.S. jurisdictions, secondary sources (treatises, ALR), or KeyCite/Shepard-style negative-treatment checks — CourtListener does not provide those.

## Failure Handling

If a tool returns an **`unavailable`** result (`{ source: "courtlistener", status: "unavailable", tool, reason }`), the upstream threw, rejected, or timed out (e.g. 401/403/429/5xx or network error). **Note the gap and never fabricate a citation** — consistent with the legal-research-analyst's research rules. Record the outage as a coverage gap, log which tool was unavailable, and proceed with degraded coverage or mark the issue blocked if the missing coverage is essential. Never reconstruct or "remember" an authority to fill the hole.

## Output Convention

Write the parsed result (case name, citation, court, date filed, `source_url`, and a short relevance note — read from the envelope) into a Paperclip comment on the originating issue. For full opinion text used as a research deliverable, save the JSON or plain-text body to the deliverables tree via `output-local-markdown` rather than pasting multi-page opinions inline.

## Given / When / Then

- **Happy path** — agent calls `search_opinions` with neutral terms; one or more hits return; agent records the top results from each envelope's `citation` / `source_url` in a Paperclip comment.
- **Edge** — `search_opinions` returns `{ status: "unavailable", reason: "...429..." }` (rate limited); agent notes the coverage gap, posts `[CONNECTOR:COURTLISTENER_RATE_LIMIT]`, and proceeds with degraded coverage. It does not fabricate.
- **Failure / security** — a confidential matter: the agent writes the client name into the query; the adapter strips it before egress (`sanitizeArgs`), and if the upstream is unreachable the tool returns `unavailable` — the agent records the gap and never invents an authority.

## Fallback (no MCP runtime)

If the agent's runtime cannot surface MCP tools, fall back to raw CourtListener REST v4 over HTTPS. **This is a fallback only — prefer the MCP tools above**, which add provenance, sanitization enforcement, and the gate authority loop that raw curl does not.

Auth header: `Authorization: Token $COURTLISTENER_API_KEY` (omit entirely if unset). Add `Accept: application/json`.

```sh
# Search opinions (fallback)
AUTH=""
if [ -n "${COURTLISTENER_API_KEY:-}" ]; then
  AUTH="-H \"Authorization: Token ${COURTLISTENER_API_KEY}\""
fi
eval curl -sS "$AUTH" \
  "'https://www.courtlistener.com/api/rest/v4/search/?q=indemnification+software+license&type=o&filed_after=2020-01-01'"
```

- Single opinion: `GET https://www.courtlistener.com/api/rest/v4/opinions/<id>/`
- Citation lookup: `GET https://www.courtlistener.com/api/rest/v4/search/?q="<cite>"&type=o`
- Docket: `GET https://www.courtlistener.com/api/rest/v4/dockets/<id>/`

Fallback failure modes: 401/403 → token invalid (post `BLOCKED: COURTLISTENER_API_KEY rejected`); 429 → rate-limited (sleep 60s, retry once, then pause); 5xx → upstream issue (post status + body). In the fallback you must apply the query-privacy rule yourself — the adapter's `sanitizeArgs` enforcement is only on the MCP path. Official docs: https://www.courtlistener.com/help/api/rest/
