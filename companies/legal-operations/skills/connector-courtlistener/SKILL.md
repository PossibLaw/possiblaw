---
name: connector-courtlistener
description: Search U.S. federal and state legal opinions, dockets, and judges via the CourtListener REST API (Free Law Project). Free tier works without a key; an optional token raises rate limits.
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

CourtListener is a free, public legal-research database maintained by the Free Law Project. It exposes opinions, dockets, oral arguments, and PACER-sourced documents through a REST API at `https://www.courtlistener.com/api/rest/v4/`. Agents use it as the open-access stand-in for paid platforms (Westlaw, Lexis) during the PoC and for any matter where free coverage is sufficient.

**Provisioning path:** the `mcp-servers/legal-data/` MCP server (`search_opinions`, `get_opinion`, `get_citation`, `get_docket`, each wrapped in a provenance envelope with a gate-compatible `sha256`) is the preferred way to wire this connector into paperclip; this skill remains the raw-curl fallback. See `mcp-servers/legal-data/README.md`.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `COURTLISTENER_API_KEY` | Token used as `Authorization: Token <key>` for higher rate limits. Optional — anonymous use works at low volume. | unset | Free account at https://www.courtlistener.com → Profile → API |

## When to Invoke

- An agent needs to surface a U.S. federal or state opinion by citation, party name, or keyword.
- A matter-intake agent wants to confirm a docket exists for a referenced case number.
- A research agent needs full opinion text or metadata (court, date filed, judge, citations) for a brief.

Do not invoke for non-U.S. jurisdictions, secondary sources (treatises, ALR), or KeyCite/Shepard-style negative-treatment checks — CourtListener does not provide those.

## Query Privacy Caveat

Queries themselves can carry privileged facts — a search string like `"Acme Holdings v. Smith arbitration clause 2025"` may identify a matter, client, or litigation strategy. Keep queries to neutral legal terms for confidential or privileged matters (e.g. `indemnification software license` rather than the client's name). Firms that need all research queries gated and receipted can promote research connectors behind the gate via policy — see the comments in `companies/legal-operations/gate-policy.yaml` for the pattern.

## Authentication

Token auth via the `Authorization` HTTP header (Django REST framework style). Anonymous calls are accepted on `/search/` at limited throughput. Official docs: https://www.courtlistener.com/help/api/rest/

## Operation Patterns

### Search opinions

`Method: GET https://www.courtlistener.com/api/rest/v4/search/`

Headers:
- `Authorization: Token $COURTLISTENER_API_KEY` (omit header entirely if unset)
- `Accept: application/json`

Query params: `q` (search text), `type=o` (opinions), `court` (court id), `filed_after`, `filed_before`.

Example:
```sh
AUTH=""
if [ -n "${COURTLISTENER_API_KEY:-}" ]; then
  AUTH="-H \"Authorization: Token ${COURTLISTENER_API_KEY}\""
fi
eval curl -sS "$AUTH" \
  "'https://www.courtlistener.com/api/rest/v4/search/?q=indemnification+software+license&type=o&filed_after=2020-01-01'" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(r['caseName'],'-',r.get('citation',[])) for r in d.get('results',[])[:10]]"
```

Response: paginated `{count, next, previous, results: [...]}` where each result has `id`, `caseName`, `court`, `dateFiled`, `citation`, `absolute_url`.

### Get a single opinion

`Method: GET https://www.courtlistener.com/api/rest/v4/opinions/<id>/`

Returns the cluster metadata and links to plain-text / HTML opinion bodies.

### Get a docket

`Method: GET https://www.courtlistener.com/api/rest/v4/dockets/<id>/`

Returns docket-level metadata; iterate `docket_entries` for filings.

Failure modes:
- 401/403 → token invalid. Post `BLOCKED: COURTLISTENER_API_KEY rejected` to Paperclip; ask operator to refresh.
- 429 → rate-limited. Sleep 60s and retry once; if still 429 post a Paperclip comment and pause.
- 5xx → upstream issue. Post the status and response body to a Paperclip comment.

## Output Convention

Agents should write the parsed result (case name, citation, court, date filed, URL, and a short relevance note) into a Paperclip comment on the originating issue. For full opinion text used as a research deliverable, save the JSON or plain-text body to the deliverables tree via `output-local-markdown` rather than pasting multi-page opinions inline.

## Given / When / Then

- **Happy path** — `COURTLISTENER_API_KEY` set, search returns >=1 hit; agent posts a Paperclip comment with the top 5 results (case name, court, date, citation, URL).
- **Edge** — anonymous call hits a 429 rate limit; agent backs off once, retries, and on second failure posts `[CONNECTOR:COURTLISTENER_RATE_LIMIT]` to Paperclip and proceeds with degraded coverage.
- **Failure / security** — `COURTLISTENER_API_KEY` unset and query requires authenticated endpoint (e.g. PACER-sourced PDF): agent does **not** attempt the call, posts `[CONNECTOR:COURTLISTENER_UNCONFIGURED]`, and never logs the env variable contents.
