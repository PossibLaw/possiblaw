# Build — CourtListener Legal-Data MCP (claim the data layer)

*Standalone build spec. Independent of the sign-off-bundle build; can be
scheduled and shipped separately. Status: **SHIPPED** — `mcp-servers/legal-data/`
is now a thin trust-adapter/proxy in front of the official CourtListener MCP
(pivoted away from re-implementing REST v4); 14/14 adapter tests green, typecheck
clean.*

## Why

Market thesis (LegalTechTalk / Andrew Bird, June 2026): when agents do 80% of
the work, value moves to whoever owns **the data layer (legal data as an API/MCP
with provenance)** and **the guardrails layer**. Wrappers without data
interoperability die. Lawstronaut and Moonlit.AI are the purest data-layer plays.

Today PossibLaw **delegates** all law to vendor reads (`connector-westlaw`,
`connector-lexis`, `connector-courtlistener`, `connector-midpage`) and
`layer/mcp/legal/` is an empty `.gitkeep`. Our citation system
(`gate-proxy/src/citations.ts`) tracks provenance of *agent outputs*, not of
*source authorities*. This build gives us a real data-with-provenance surface.

CourtListener is **free and public** (no enterprise contract), which makes it
the cheapest path to the property the thesis rewards.

## Scope

A standalone MCP server (same posture as `gate-proxy/`, `eval-harness/`,
`learning-loop/`: standalone TypeScript, node:test) that **consumes the official
CourtListener MCP via a thin provenance + sanitization adapter**.

CourtListener ships an **official hosted MCP** at `https://mcp.courtlistener.com`
(OAuth auth; in Anthropic's connector directory) exposing case law, PACER, the
citation network, oral arguments, judges, keyword + semantic search, alerts, and
a grounded citation-verification tool. Re-implementing its REST v4 API with
reconstructed response shapes (the original approach) was fragile and redundant,
so we pivoted: our component is now a **thin trust-adapter / proxy** that, for
every upstream tool call, (1) sanitizes confidential/privileged query args,
(2) forwards to the official MCP, and (3) wraps the result in our sha256-aligned
provenance envelope. The adapter is **schema-agnostic** about upstream result
shapes — exact tool names/params are confirmed at runtime via `tools/list`, not
hard-coded.

**Location:** `mcp-servers/legal-data/` (top-level component). Wire the existing
empty `layer/mcp/legal/` and the `connector-courtlistener` skill to point at it.

### Shape

- `src/adapter.ts` — the pure, fully-tested core: `sanitizeArgs`,
  `wrapWithProvenance`, `proxyToolCall`.
- `src/upstream.ts` — `createCourtListenerUpstream(config)`: the real, thin MCP
  **client** (Streamable-HTTP + OAuth) to `https://mcp.courtlistener.com`. Needs
  a CourtListener account + OAuth; not unit-tested.
- `src/server.ts` — thin stdio MCP **proxy**: connect upstream, `tools/list`,
  re-expose each tool as a `proxyToolCall` pass-through.

The upstream MCP is injected as `UpstreamCaller`, so tests run with a stub and
make zero network/OAuth calls.

### Provenance envelope (the differentiator)

Every tool result wraps payload in:

```json
{
  "source": "courtlistener",
  "source_url": "https://www.courtlistener.com/opinion/...",
  "retrieved_at": "2026-06-26T...Z",
  "court": "...",
  "decided_date": "1973-01-22",
  "citation": "410 U.S. 113",
  "sha256": "<documentSha256 of the normalized text>",
  "payload": { ... }
}
```

Agents get the slice **and** where it came from, version, and a fingerprint.

### Reuse (close the provenance loop)

- `documentSha256()` / `normalizeText()` are copied verbatim from
  `gate-proxy/src/citations.ts` into `src/hash.ts` so a fetched authority's
  fingerprint is the **same** sha the citation gate checks against.
  Data-provenance in → output-provenance out, one hashing scheme.
- Local cache keyed by `sha256` to absorb upstream rate limits and make results
  deterministic for tests.

### Privacy

CourtListener search is a read to a third party. Mirror the neutral-terms rule
already in `docs/connectors-inventory.md:40` and the `privacy-encoder` skill:
for `confidential`/`privileged` matters, strip client identifiers from the
outbound `query` before the search. Document this in the server README.

## Evals (TDD — happy / edge / failure, per repo contract)

Driven by `src/adapter.test.ts` against a **stubbed** `UpstreamCaller` (zero
network, zero OAuth):

- **Happy:** an opinion-like upstream result → `wrapWithProvenance` yields an
  envelope with a stable `sha256`, best-effort-extracted `decided_date` +
  `source_url` + `citation`, and the upstream `payload` preserved verbatim.
- **Edge:** confidential tier → `sanitizeArgs` strips a client identifier (e.g.
  `ACME Inc.`) from the forwarded query *before the stub upstream sees it*; and a
  result MISSING provenance fields still gets a `sha256` and simply **omits** the
  absent facets (no fabrication).
- **Failure/security:** the upstream caller throws / rejects / times out →
  `proxyToolCall` returns `{ status: "unavailable", tool, reason }`, never a
  fabricated opinion; and a confidential query is never forwarded containing the
  raw client identifier (asserted even when the upstream then fails).

Tests were written first (node:test under `mcp-servers/legal-data/src/`), then
implemented to green. The live OAuth upstream wiring (`src/upstream.ts`,
`src/server.ts`) is intentionally thin and **not** covered by the suite — no
OAuth credentials in CI.

## Out of scope (follow-ons)

- Statute/regulation corpus (CourtListener is case law). A later build can add
  a statutes source for the Lawstronaut-style "version-in-force" story.
- Westlaw/Lexis behind the same MCP interface (enterprise-contract gated).
- Embedding/vector search over opinions.

## Effort & risk

~1 focused sprint. Read-only, no gate changes. The live upstream now requires a
CourtListener account + OAuth (the official MCP is OAuth-gated), but the adapter
core stays credential-free and fully tested with a stubbed upstream. Main risk is
upstream rate limits → the `sha256` cache mitigates. Lowest-risk way to make the
strategic data-layer claim.

## Dependencies

None on the sign-off-bundle build. Touches a new component + two existing
pointers (`layer/mcp/legal/`, `connector-courtlistener` skill). Does **not**
touch `gate-proxy` trust surfaces except importing two pure functions.

## References

- Market analysis & company map: this session's analysis (data layer =
  Lawstronaut, Moonlit.AI, DeepJudge).
- Reuse target: `gate-proxy/src/citations.ts` (`extractCitations`,
  `documentSha256`, `normalizeText`).
- Connector to rewire: `companies/legal-operations/skills/connector-courtlistener/`.
