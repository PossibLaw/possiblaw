# Legal-Data MCP (`mcp-servers/legal-data/`)

Standalone MCP server that exposes U.S. case law (CourtListener REST v4) as MCP
tools, each result wrapped in a **provenance envelope**. Same posture as
`gate-proxy/`, `eval-harness/`, and `learning-loop/`: standalone TypeScript,
`node:test`, minimal dependencies, never modifies the pinned `paperclip/`
submodule.

This is PossibLaw's first **data-layer** surface: agents get the legal slice
**and** where it came from, when, and a fingerprint — not just an opaque vendor
read.

## Tools

| Tool | Input | Output |
|---|---|---|
| `search_opinions` | `query`, `court?`, `date_range?` | ranked opinion stubs + provenance |
| `get_opinion` | `id` | full opinion text + provenance |
| `get_citation` | `cite` (reporter string) | resolved opinion + decided_date + court + citation + provenance |
| `get_docket` | `id` | docket metadata + provenance |

Backed by CourtListener REST v4 (`https://www.courtlistener.com/api/rest/v4/`).
Free and public — no enterprise contract, no credential required (an optional
`COURTLISTENER_API_KEY` raises rate limits).

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
  "sha256": "<documentSha256 of the normalized fingerprint text>",
  "payload": { ... }
}
```

The `sha256` reuses gate-proxy's `documentSha256`/`normalizeText`
(`src/hash.ts`, copied verbatim from `gate-proxy/src/citations.ts` — that file is
the source of truth). So a fetched authority's fingerprint is the **same** sha
the citation gate computes over agent output: data-provenance in →
output-provenance out, one hashing scheme.

## Resolution semantics (no fabrication)

- **Resolved** cite → a single provenance envelope.
- **Ambiguous / parallel** cite (CourtListener status `300`, or any multi-cluster
  match) → `{ status: "ambiguous", candidates: [...] }` — ranked provenance
  envelopes, **never silently picks one**.
- **Miss** (`404` / empty) or **upstream failure** (5xx, timeout, network) →
  `{ status: "unavailable", reason, http_status? }` — **never a fabricated
  opinion**.

## Privacy (`sanitizeQuery`)

A CourtListener search is a read to a third party; the query string itself can
carry privileged facts (client names, matter captions). For matters whose
privacy tier is `confidential` or `privileged`, `sanitizeQuery` strips client
identifiers (legal-entity names, emails, SSNs, EINs, phones) from the outbound
`query` before the search, leaving neutral legal terms. This mirrors the
neutral-terms rule in `docs/connectors-inventory.md` and the `privacy-encoder`
skill's detection rules. Set the tier via env `POSSIBLAW_MATTER_PRIVACY_TIER`.

Unlike `privacy-encoder` (reversible placeholders for round-trip cloud calls), a
search query is one-way, so identifiers are **deleted** rather than placeheld —
a placeholder token would pollute search relevance.

## Cache

`MemoryCache` keyed by the authority's `sha256` (plus a per-URL GET cache) absorbs
CourtListener rate limits and makes repeated lookups deterministic. A cache hit is
provably the same authority a previous fetch fingerprinted.

## Design: injectable fetch, no live calls in tests

The HTTP fetch is injected (`fetchFn` in `ClientOptions`). Tests stub it with
fixture JSON under `src/fixtures/` and make **zero** network calls. Production
(`src/server.ts`) passes node's global `fetch`.

## Commands

```sh
pnpm -C mcp-servers/legal-data install     # install deps
pnpm -C mcp-servers/legal-data test        # node:test suite (17 tests)
pnpm -C mcp-servers/legal-data typecheck   # tsc --noEmit
pnpm -C mcp-servers/legal-data start       # run the stdio MCP server
```

## MCP wiring

`src/server.ts` is a thin stdio JSON-RPC server using the official
`@modelcontextprotocol/sdk` (installed via the agent proxy). It maps the four
tools onto `LegalDataClient` and wires the real `fetch`, the optional
`COURTLISTENER_API_KEY`, and `POSSIBLAW_MATTER_PRIVACY_TIER`. All testable value
lives in `src/client.ts`; the server file is intentionally thin.

## Source-of-truth notes

- Hashing: `gate-proxy/src/citations.ts` (`normalizeText`, `documentSha256`).
  `src/hash.ts` is a verbatim copy with a pointer comment — if gate-proxy's
  normalization changes, update `src/hash.ts` to match.
- Connector wiring: `companies/legal-operations/skills/connector-courtlistener/`
  and the pointer at `layer/mcp/legal/README.md`.
