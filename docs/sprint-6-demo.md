# Sprint 6 Demo — MCP Connector Buildout

Sprint 6 adds a connector framework and external service integrations to PossibLaw.

- **Sprint 6A** (this sprint): Framework + open-access stand-ins + 3 reference live connectors.
- **Sprint 6B** (next sprint): iManage, NetDocuments, Westlaw, Lexis, QuickBooks, HubSpot, Notion, Linear, and remaining v1 connectors.

---

## Architecture

```
cli/connectors/
  types.ts              — ConnectorMetadata, ConnectorClient, ConnectorFactory
  registry.ts           — registerConnector / getConnector / listConnectors / listConfigured
  index.ts              — imports all connectors (self-registration)
  local-fs-doc-store.ts — stand-in: iManage / NetDocuments
  no-op-signature.ts    — stand-in: DocuSign
  courtlistener.ts      — stand-in: Westlaw / Lexis
  stripe.ts             — live: official SDK pattern
  midpage.ts            — live: HTTP-only pattern
  docusign.ts           — live: OAuth-ish enterprise pattern

layer/connectors/
  <id>.yaml             — declarative descriptor for each connector
  local-docs/           — backing store for local-fs-doc-store
  local-signatures/     — backing store for no-op-signature
```

---

## Demo 6A-1 — List all connectors

```bash
node dist/cli/index.js connectors list
```

Expected output:

```
ID                       CATEGORY     TIER           CONFIGURED
----------------------------------------------------------------------
local-fs-doc-store       stand-in     open-access    yes
no-op-signature          stand-in     open-access    yes
courtlistener            stand-in     open-access    yes
stripe                   business     open-access    no
midpage                  legal        paid           no
docusign                 legal        paid           no
```

Stand-ins show `yes` (no credentials needed). Live connectors show `no` until env vars are set.

---

## Demo 6A-2 — Healthcheck stand-ins (always ok)

```bash
node dist/cli/index.js connectors check local-fs-doc-store
node dist/cli/index.js connectors check no-op-signature
```

Expected:

```
Running healthcheck for connector: local-fs-doc-store
  ok:     true
  detail: local-docs directory ready at <repo>/layer/connectors/local-docs
```

---

## Demo 6A-3 — CourtListener (real HTTP, no auth)

```bash
node dist/cli/index.js connectors check courtlistener
```

Expected:

```
Running healthcheck for connector: courtlistener
  ok:     true
  detail: CourtListener reachable — 1559192 total opinions indexed
```

This is a real HTTP call to `https://www.courtlistener.com/api/rest/v4/search/`.

---

## Demo 6A-4 — Stripe (live, not configured)

```bash
node dist/cli/index.js connectors check stripe
```

Expected (exit code 1):

```
Running healthcheck for connector: stripe
  ok:     false
  detail: STRIPE_API_KEY not set
```

To activate: set `STRIPE_API_KEY=sk_test_...` and re-run. Stripe's free test mode works immediately.

---

## Demo 6A-5 — Capabilities listing

```bash
node dist/cli/index.js connectors capabilities stripe
node dist/cli/index.js connectors capabilities local-fs-doc-store
```

---

## Demo 6A-6 — Agent connector declarations

The `nda-drafter` and `billing-prep` agents now declare connectors in their frontmatter:

- `nda-drafter` — `connectors: [local-fs-doc-store]` (drafts get persisted)
- `billing-prep` — `connectors: [stripe]` (invoice send path)

These are declarations only in Sprint 6A. Runtime tool-use integration is Sprint 6B.

---

## Sprint 6B Roadmap

Sprint 6B will add live adapters for:

| Connector | Category | Pattern |
|---|---|---|
| iManage | legal | HTTP-only (OAuth) |
| NetDocuments | legal | HTTP-only (OAuth) |
| Westlaw | legal | HTTP-only (key) |
| Lexis | legal | HTTP-only (key) |
| QuickBooks | business | OAuth (PKCE) |
| HubSpot | business | OAuth |
| Notion | business | official SDK |
| Linear | business | GraphQL |

Plus: runtime connector dispatch from agent tool-use loop.
