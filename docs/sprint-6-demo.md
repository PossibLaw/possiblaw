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

---

## Sprint 6B — All 14 connectors operational

Sprint 6B adds 8 live adapters: 4 legal enterprise and 4 business open-access.

### Updated architecture

```
cli/connectors/
  ...  (6A files unchanged)
  imanage.ts        — live: HTTP Bearer. iManage Work API v2.
  netdocuments.ts   — live: HTTP OAuth Bearer. NetDocuments REST API v2.
  westlaw.ts        — live: HTTP key. UNCONFIRMED endpoint — see westlaw.README.md.
  lexis.ts          — live: HTTP key. UNCONFIRMED endpoint — see lexis.README.md.
  quickbooks.ts     — live: node-quickbooks SDK. Intuit QBO.
  hubspot.ts        — live: @hubspot/api-client SDK.
  notion.ts         — live: @notionhq/client SDK.
  linear.ts         — live: @linear/sdk.
  imanage.README.md — OAuth setup + Bearer token flow docs.
  westlaw.README.md — UNCONFIRMED reconciliation checklist.
  lexis.README.md   — UNCONFIRMED reconciliation checklist.

layer/connectors/
  imanage.yaml / netdocuments.yaml / westlaw.yaml / lexis.yaml
  quickbooks.yaml / hubspot.yaml / notion.yaml / linear.yaml

docs/
  connectors-inventory.md — Full v1 connector inventory (14 live + 14 deferred).
```

---

## Demo 6B-1 — List all 14 connectors

```bash
node dist/cli/index.js connectors list
```

Expected output (stand-ins always `yes`; live connectors `no` without creds):

```
ID                       CATEGORY     TIER           CONFIGURED
----------------------------------------------------------------------
local-fs-doc-store       stand-in     open-access    yes
no-op-signature          stand-in     open-access    yes
courtlistener            stand-in     open-access    yes
stripe                   business     open-access    no
midpage                  legal        paid           no
docusign                 legal        paid           no
imanage                  legal        paid           no
netdocuments             legal        paid           no
westlaw                  legal        paid           no
lexis                    legal        paid           no
quickbooks               business     open-access    no
hubspot                  business     open-access    no
notion                   business     open-access    no
linear                   business     open-access    no
```

---

## Demo 6B-2 — Healthcheck new connectors (not configured)

```bash
node dist/cli/index.js connectors check imanage
node dist/cli/index.js connectors check westlaw
node dist/cli/index.js connectors check hubspot
node dist/cli/index.js connectors check notion
```

Each returns `ok: false` with a clear "Missing env vars: <X>" message.

---

## Demo 6B-3 — HubSpot (open-access, dev account)

```bash
export HUBSPOT_ACCESS_TOKEN=<your-private-app-token>
node dist/cli/index.js connectors check hubspot
```

Expected:
```
Running healthcheck for connector: hubspot
  ok:     true
  detail: HubSpot reachable — contacts paged (has_more: false)
```

---

## Demo 6B-4 — Notion (open-access, integration token)

```bash
export NOTION_API_KEY=<your-integration-token>
node dist/cli/index.js connectors check notion
```

Expected:
```
Running healthcheck for connector: notion
  ok:     true
  detail: Notion reachable — bot user: <integration-name>
```

---

## Demo 6B-5 — Agent connector declarations

Agents that declare connectors in their frontmatter as of Sprint 6B:

| Agent | Connectors |
|---|---|
| `nda-drafter` | `[local-fs-doc-store]` |
| `billing-prep` | `[stripe, quickbooks]` |
| `pitch-polisher` | `[hubspot, notion]` |
| `intake-form-drafter` | `[hubspot, notion]` |
| `calendar-coordinator` | `[]` (Google Workspace / M365 deferred — see connectors-inventory.md) |

---

## UNCONFIRMED connectors

`westlaw` and `lexis` use placeholder base URLs and request shapes. They will
return 404 or connection errors until reconciled with the TR/LN API spec.
The `westlaw.README.md` and `lexis.README.md` files list the full reconciliation
checklist.

When credentials arrive:
1. Update `BASE_URL` in the respective `.ts` file.
2. Verify auth headers match the TR/LN spec.
3. Remove UNCONFIRMED comments.
4. Run `pnpm typecheck && pnpm build` and test `connectors check westlaw`.

---

## Connector inventory

`docs/connectors-inventory.md` documents all 14 live connectors plus 14 deferred
targets from the v1 PossibLaw plan: Clio, MyCase, Filevine, Smokeball, Rocket
Matter, Tabs3, Litera, Kira, Relativity (legal); Slack, Zoom, Google Workspace,
Microsoft 365, Salesforce, Zapier (business).
