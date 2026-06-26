# Legal-Data MCP (`mcp-servers/legal-data/`)

A thin **trust-adapter / proxy** in front of the **official CourtListener MCP**.
Same posture as `gate-proxy/`, `eval-harness/`, and `learning-loop/`: standalone
TypeScript, `node:test`, minimal dependencies, never modifies the pinned
`paperclip/` submodule.

This is PossibLaw's **data-layer** surface: agents get the legal slice **and**
where it came from, when, and a fingerprint — not just an opaque vendor read.

## Data source: the official CourtListener MCP

The data source is **CourtListener's official hosted MCP server** at
**`https://mcp.courtlistener.com`** (OAuth auth; listed in Anthropic's connector
directory). It requires a free CourtListener account. It exposes:

- case law and full opinions
- PACER documents and dockets
- the citation network
- oral arguments
- judges
- keyword **and** semantic search
- alerts
- a **grounded citation-verification** tool

We do **not** re-implement CourtListener's REST API (the previous version of this
component did, with reconstructed v4 response shapes — that was fragile and
redundant). Instead we **consume** the official MCP and add only our genuine
value-add.

> **Schema-agnostic on purpose.** We do not pin the upstream tool names or
> parameter schemas. Confirm them at runtime via `tools/list`; the adapter
> forwards args verbatim (after sanitization) and extracts provenance
> best-effort from the result.

## What our adapter adds

For **every** proxied tool call (`adapter.proxyToolCall`):

1. **`sanitizeArgs(args, tier)`** — strips client identifiers (legal-entity
   names, emails, SSNs, EINs, phones) from query/search-like string args for
   `confidential` / `privileged` matters, **before** anything is forwarded
   upstream. Standard tier is a pass-through. (`src/sanitize.ts`.)
2. **forward** — calls the injected `UpstreamCaller` (the official MCP) with the
   sanitized args.
3. **`wrapWithProvenance(result, { now })`** — wraps the upstream result in a
   **provenance envelope** with a `sha256` aligned with gate-proxy's citation
   gate.

Any upstream throw / rejection / timeout becomes a structured
`{ status: "unavailable", tool, reason }` — **never** a fabricated opinion and
**never** an envelope with invented fields.

## Provenance envelope

Every **successful** result is wrapped:

```json
{
  "source": "courtlistener",
  "source_url": "https://www.courtlistener.com/opinion/108713/roe-v-wade/",
  "retrieved_at": "2026-06-26T12:00:00.000Z",
  "court": "Supreme Court of the United States",
  "decided_date": "1973-01-22",
  "citation": "410 U.S. 113",
  "sha256": "<documentSha256 of the result's canonical fingerprint text>",
  "payload": { ...the upstream result, verbatim... }
}
```

- **`sha256`** is **always** computed via `documentSha256` (`src/hash.ts`, a
  verbatim copy of `gate-proxy/src/citations.ts` — that file is the source of
  truth). It hashes the result's **primary text** when an obvious text field is
  present (`plain_text`, `text`, `opinion_text`, `body`, `content`, `snippet`,
  `summary`, `case_name`/`caseName`), otherwise the **canonical (key-sorted)
  JSON** of the whole result (illustrative `_`-prefixed keys stripped first).
  `documentSha256` then NFKC-normalizes and collapses whitespace before hashing,
  keeping us byte-aligned with the citation gate: data-provenance in →
  output-provenance out, one hashing scheme.
- **`source_url` / `court` / `decided_date` / `citation`** are extracted
  **best-effort** from common field names and **omitted when absent** — never
  invented:
  - `source_url` ← `source_url`, `absolute_url`, `url`, `uri`, `html_link`
    (site-relative paths are resolved against `https://www.courtlistener.com`)
  - `court` ← `court`, `court_name`, `court_id`, `courtName`
  - `decided_date` ← `decided_date`, `date_filed`, `dateFiled`, `date_decided`,
    `filed`, `date`
  - `citation` ← `citation`, `cite`, `citation_string`, `reporter_citation`
  - Extraction probes the top-level object and a single wrapped record
    (`result` / `data` / `opinion` / `cluster` / `docket`) or the first hit of a
    list (`results` / `hits` / `items`).
- **`retrieved_at`** is **injected** (`now` in `ProxyContext`) — the pure core
  never calls `Date.now()`, so tests are deterministic.

## No fabrication

- Upstream throw / reject / timeout → `{ status: "unavailable", tool, reason }`.
- Missing provenance facets are **omitted**, never filled with placeholders.
- The full upstream result is preserved verbatim under `payload`.

## Privacy (`sanitizeQuery` / `sanitizeArgs`)

A search is a read to a third party; the query string itself can carry
privileged facts (client names, matter captions). For matters whose privacy tier
is `confidential` or `privileged`, query/search-like args are stripped of client
identifiers **before** the call leaves the boundary, leaving neutral legal terms.
This mirrors the neutral-terms rule in `docs/connectors-inventory.md` and the
`privacy-encoder` skill's detection rules. Set the tier via env
`POSSIBLAW_MATTER_PRIVACY_TIER`.

Unlike `privacy-encoder` (reversible placeholders for round-trip cloud calls), a
search query is one-way, so identifiers are **deleted** rather than placeheld — a
placeholder token would pollute search relevance.

## Cache

`MemoryCache` (`src/cache.ts`) keyed by the authority's `sha256` absorbs upstream
rate limits and makes repeated lookups deterministic. A cache hit is provably the
same authority a previous fetch fingerprinted.

## Design: injected upstream, no live calls in tests

The upstream MCP is injected as `UpstreamCaller` (`src/types.ts`). The pure,
fully-tested core (`src/adapter.ts`) is exercised by `node:test` with a
**stubbed** `UpstreamCaller` and makes **zero** network calls and uses **no**
OAuth. The real wiring (`src/upstream.ts`, `src/server.ts`) connects the live
OAuth-gated CourtListener MCP and is intentionally thin; it is **not** exercised
by the test suite (no OAuth credentials in CI).

## Commands

```sh
pnpm -C mcp-servers/legal-data install     # install deps
pnpm -C mcp-servers/legal-data test        # node:test suite (14 tests, zero network)
pnpm -C mcp-servers/legal-data typecheck   # tsc --noEmit
pnpm -C mcp-servers/legal-data start        # run the stdio MCP proxy (needs OAuth wiring)
```

## MCP wiring

- `src/upstream.ts` — `createCourtListenerUpstream(config)` connects to
  `https://mcp.courtlistener.com` using the official `@modelcontextprotocol/sdk`
  **client** over the Streamable-HTTP transport with an injected
  `OAuthClientProvider`. Thin; forwards `callTool` verbatim. **Requires a
  CourtListener account + a completed OAuth flow — not unit-tested.**
- `src/server.ts` — a thin stdio MCP **proxy**: on startup it connects upstream,
  runs `tools/list`, and re-exposes each upstream tool as a pass-through whose
  every invocation runs `proxyToolCall`. The OAuth `OAuthClientProvider` is
  host-supplied via `POSSIBLAW_CL_AUTH_PROVIDER_MODULE` (credential storage is a
  host concern); the SDK ships no persistent provider.

## Source-of-truth notes

- Hashing: `gate-proxy/src/citations.ts` (`normalizeText`, `documentSha256`).
  `src/hash.ts` is a verbatim copy with a pointer comment — if gate-proxy's
  normalization changes, update `src/hash.ts` to match.
- Connector wiring: `companies/legal-operations/skills/connector-courtlistener/`
  and the pointer at `layer/mcp/legal/README.md`.
