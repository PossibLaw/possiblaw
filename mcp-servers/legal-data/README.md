# Legal-Data MCP (`mcp-servers/legal-data/`)

A thin **trust-adapter / proxy** over **CourtListener**. Same posture as
`gate-proxy/`, `eval-harness/`, and `learning-loop/`: standalone TypeScript,
`node:test`, minimal dependencies, never modifies the pinned `paperclip/`
submodule.

This is PossibLaw's **data-layer** surface: agents get the legal slice **and**
where it came from, when, and a fingerprint — not just an opaque vendor read.

## Two upstream modes

The adapter abstracts its upstream as `UpstreamCaller = (toolName, args) =>
Promise<unknown>` (`src/types.ts`). Two upstreams are available; the server
selects one at startup:

### Default — headless token-REST (`createCourtListenerRestUpstream`)

The **default**. Plain HTTPS GETs against **CourtListener REST v4**
(`https://www.courtlistener.com/api/rest/v4/`). **No OAuth, no browser redirect,
no account required** — a filed matter can research CourtListener end-to-end,
headless. A `COURTLISTENER_API_KEY` (DRF token) raises rate limits; when unset
the `Authorization` header is **omitted entirely** and anonymous access works at
low volume.

In this mode the server EXPOSES a **fixed set of 4 tools** with proper MCP
inputSchemas (so the agent runtime sees them via `tools/list`):

| Tool | Params | Maps to |
|---|---|---|
| `search_opinions` | `query`, `court?`, `filed_after?`, `filed_before?` | `GET /search/?q=<query>&type=o[&court=][&filed_after=][&filed_before=]` |
| `get_opinion` | `id` | `GET /opinions/<id>/` |
| `get_citation` | `cite` | `GET /search/?q="<cite>"&type=o` |
| `get_docket` | `id` | `GET /dockets/<id>/` |

The REST upstream is **schema-agnostic**: it returns the parsed JSON verbatim and
does not reconstruct or validate the response shape beyond what is needed to
issue the request. On any non-2xx (401/403/429/5xx) or network error it
**throws** — `proxyToolCall` converts that into a structured `unavailable` result
(never a fabricated opinion). `fetchFn` is injected so tests stub it (zero
network).

### Optional — OAuth MCP (`createCourtListenerUpstream`)

The **official hosted CourtListener MCP** at **`https://mcp.courtlistener.com`**
(OAuth; in Anthropic's connector directory; requires a free CourtListener
account). Exposes case law, PACER, citation network, oral arguments, judges,
keyword + semantic search, alerts, and a grounded citation-verification tool.
**Enable it by setting `POSSIBLAW_CL_UPSTREAM=mcp`** (or by configuring the OAuth
provider module via `POSSIBLAW_CL_AUTH_PROVIDER_MODULE`). In this mode the server
discovers the upstream catalog via `tools/list` and re-exposes each tool as a
schema-agnostic passthrough.

> **Schema-agnostic on purpose.** For the OAuth-MCP upstream we do not pin tool
> names or parameter schemas — confirm them at runtime via `tools/list`. Either
> way the adapter forwards args verbatim (after sanitization) and extracts
> provenance best-effort from the result.

## What our adapter adds

For **every** proxied tool call (`adapter.proxyToolCall`):

1. **`sanitizeArgs(args, tier)`** — applies best-effort defense-in-depth
   redaction to query/search/citation string args for `confidential` /
   `privileged` matters, **before** anything is forwarded upstream. Detectors
   cover common legal-entity names, person-name captions, role-labeled person
   names, docket/matter numbers, emails, SSNs, EINs, and phones. Standard tier
   is a pass-through. Neutral legal terms remain the primary control because
   deterministic redaction cannot prove a query contains no privileged fact.
   (`src/sanitize.ts`.)
2. **forward** — calls the injected `UpstreamCaller` (the default token-REST
   upstream, or the optional OAuth MCP) with the sanitized args.
3. **`wrapWithProvenance(result, { now })`** — wraps the upstream result in a
   **provenance envelope** with a `sha256` aligned with gate-proxy's citation
   gate.
4. **best-effort authority-provenance reporting** — when the envelope carries a
   citation, the adapter registers the retrieved authority with the gate
   (`POST /quality/authority`) so the gate can later flag any authority an agent
   **cites** in an outbound filing that was **never retrieved**
   (anti-hallucination). This is **best-effort**: if the gate is down or
   `GATE_PROXY_URL` is unset, the failure is swallowed and the tool call still
   succeeds — provenance reporting is additive, never blocking. (See
   "Authority provenance" below.)

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

## Authority provenance (anti-hallucination)

The `sha256` is not just a fingerprint — it closes a real trust loop. After a
successful retrieval that yields a citation, the adapter calls an injectable
**`ProvenanceReporter`**. The production reporter
(`createGateProvenanceReporter(gateUrl)`, `gateUrl` from `GATE_PROXY_URL`) does:

```
POST ${GATE_PROXY_URL}/quality/authority
{ citation, sha256, source, sourceUrl?, retrievedAt? }
```

The gate registers that this authority was **actually retrieved** from a real
source (appending a hash-chained `quality` receipt). Later, when an agent's
outbound **court filing / third-party egress** is inspected, the gate runs
`AuthorityRegistry.verifyDocument(...)` and flags any cited authority that was
**never retrieved** — a strong hallucination signal.

- **Default = flag/record, not block.** The gate records `unbackedCitations` on
  the egress receipt (surfaced in the Matter Trust Report) without changing
  pass/block behavior.
- **Blocking is policy-opt-in** via `citationGate.requireAuthorityProvenance:
  true` in `gate-policy.yaml`. When on, an outbound document that cites a
  never-retrieved authority is blocked with a clear reason.
- **Best-effort by contract.** The reporter never throws: a missing
  `GATE_PROXY_URL`, gate downtime, or a network error is swallowed. Retrieval
  succeeds regardless. The reporter is **injected** (`ProxyContext.reportProvenance`)
  so the test suite uses a stub and makes zero network calls.

## No fabrication

- Upstream throw / reject / timeout → `{ status: "unavailable", tool, reason }`.
- Missing provenance facets are **omitted**, never filled with placeholders.
- The full upstream result is preserved verbatim under `payload`.

## Privacy (`sanitizeQuery` / `sanitizeArgs`)

A search is a read to a third party; the query string itself can carry
privileged facts (client names, person-name captions, docket numbers, strategy).
Agents and operators must use neutral legal terms and must not send privileged
identifiers. For matters whose privacy tier is `confidential` or `privileged`,
query/search/citation-like args also receive best-effort redaction **before** the
call leaves the boundary. This is defense in depth, not proof that a query is
safe. It mirrors the neutral-terms rule in `docs/connectors-inventory.md` and the
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

The upstream is injected as `UpstreamCaller` (`src/types.ts`). The pure,
fully-tested core (`src/adapter.ts`) is exercised by `node:test` with a
**stubbed** `UpstreamCaller`, and the default REST upstream
(`createCourtListenerRestUpstream`, `src/rest-upstream.test.ts`) is exercised
with a **stubbed `fetchFn`** — both make **zero** network calls and use **no**
OAuth. The OAuth-MCP wiring (`createCourtListenerUpstream`) connects the live
OAuth-gated CourtListener MCP and is intentionally thin; it is **not** exercised
by the test suite (no OAuth credentials in CI).

## Commands

```sh
pnpm -C mcp-servers/legal-data install     # install deps
pnpm -C mcp-servers/legal-data test        # node:test suite (30 tests, zero network)
pnpm -C mcp-servers/legal-data typecheck   # tsc --noEmit
pnpm -C mcp-servers/legal-data start        # run the stdio MCP proxy (default: headless REST)
```

## MCP wiring

- `src/upstream.ts` —
  - `createCourtListenerRestUpstream({ apiKey?, fetchFn?, baseUrl? })` — the
    **default headless** upstream. Maps the fixed 4 tools to CourtListener REST
    v4 GETs, injects `Authorization: Token <key>` **only** when `apiKey` is set,
    and throws on non-2xx / network error. `fetchFn` is injected for tests.
  - `createCourtListenerUpstream(config)` — the **optional OAuth-MCP** upstream:
    connects to `https://mcp.courtlistener.com` using the official
    `@modelcontextprotocol/sdk` **client** over Streamable-HTTP with an injected
    `OAuthClientProvider`. Forwards `callTool` verbatim. **Requires a
    CourtListener account + a completed OAuth flow — not unit-tested.**
- `src/server.ts` — a thin stdio MCP **proxy** that selects the upstream at
  startup: **default = headless token-REST** (exposes the fixed 4 tools with real
  inputSchemas, reads optional `COURTLISTENER_API_KEY`). Set
  `POSSIBLAW_CL_UPSTREAM=mcp` (or configure
  `POSSIBLAW_CL_AUTH_PROVIDER_MODULE`) to use the OAuth-MCP upstream instead, in
  which case it runs `tools/list` and re-exposes each upstream tool as a
  pass-through. Either way every invocation runs `proxyToolCall`
  (sanitize → forward → wrap) with the gate provenance reporter wired in.

## Source-of-truth notes

- Hashing: `gate-proxy/src/citations.ts` (`normalizeText`, `documentSha256`).
  `src/hash.ts` is a verbatim copy with a pointer comment — if gate-proxy's
  normalization changes, update `src/hash.ts` to match.
- Connector wiring: `companies/legal-operations/skills/connector-courtlistener/`
  and the pointer at `layer/mcp/legal/README.md`.
