# Build — CourtListener Legal-Data MCP (claim the data layer)

*Standalone build spec. Independent of the sign-off-bundle build; can be
scheduled and shipped separately. Status: **SHIPPED** — `mcp-servers/legal-data/`,
17/17 tests green (commit f9986de).*

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
`learning-loop/`: standalone TypeScript, node:test) that exposes U.S. case law
as MCP tools with a provenance envelope on every result.

**Location:** `mcp-servers/legal-data/` (new top-level component). Wire the
existing empty `layer/mcp/legal/` and the `connector-courtlistener` skill to
point at it.

### Tools

| Tool | Input | Output |
|---|---|---|
| `search_opinions` | `query`, `court?`, `date_range?` | ranked opinion stubs (id, caption, court, date, snippet) + provenance |
| `get_opinion` | `id` | full opinion text + parse + provenance |
| `get_citation` | `cite` (reporter string) | resolved opinion + **decided_date + court + citation** + provenance |
| `get_docket` | `id` | docket metadata + provenance |

Backed by CourtListener REST v4 (`/api/rest/v4/`).

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

- Import `extractCitations()` and `documentSha256()` from
  `gate-proxy/src/citations.ts` so a fetched authority's fingerprint is the
  **same** sha the citation gate checks against. Data-provenance in →
  output-provenance out, one hashing scheme.
- Local cache keyed by `sha256` to absorb CourtListener rate limits and make
  results deterministic for tests.

### Privacy

CourtListener search is a read to a third party. Mirror the neutral-terms rule
already in `docs/connectors-inventory.md:40` and the `privacy-encoder` skill:
for `confidential`/`privileged` matters, strip client identifiers from the
outbound `query` before the search. Document this in the server README.

## Evals (TDD — happy / edge / failure, per repo contract)

- **Happy:** `get_citation("410 U.S. 113")` → returns the Roe v. Wade opinion
  with `decided_date: 1973-01-22`, a `source_url`, and a stable `sha256`.
- **Edge:** ambiguous / parallel cite with multiple matches → returns ranked
  candidates; never silently picks one.
- **Failure/security:** CourtListener 5xx/timeout → structured `unavailable`
  error, never a fabricated opinion; and a confidential-matter query path
  strips client identifiers before the outbound search.

Write the failing tests first (node:test under `mcp-servers/legal-data/src/`),
then implement to green.

## Out of scope (follow-ons)

- Statute/regulation corpus (CourtListener is case law). A later build can add
  a statutes source for the Lawstronaut-style "version-in-force" story.
- Westlaw/Lexis behind the same MCP interface (enterprise-contract gated).
- Embedding/vector search over opinions.

## Effort & risk

~1 focused sprint. Read-only, no credentials, no gate changes. Main risk is
CourtListener rate limits → the `sha256` cache mitigates. Lowest-risk way to
make the strategic data-layer claim.

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
