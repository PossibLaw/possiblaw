# Connector Inventory

Complete inventory of all PossibLaw MCP connectors — operational and planned.

---

## Live (operational with credentials)

Connectors that self-register and respond to `possiblaw connectors list`.
14 connectors total as of Sprint 6B: 3 stand-ins + 11 live.

### Stand-ins (no credentials — always available)

| ID | Name | Category | Tier | Capabilities |
|---|---|---|---|---|
| `local-fs-doc-store` | Local FS Doc Store | stand-in | open-access | documents.list, documents.get, documents.put |
| `no-op-signature` | No-Op Signature | stand-in | open-access | signature.request, signature.status |
| `courtlistener` | CourtListener | stand-in | open-access | cases.search, cases.get |

Stand-ins are iManage/NetDocuments, DocuSign, and Westlaw/Lexis equivalents respectively.
They require zero credentials and are the default for offline demos and development without
enterprise contracts.

### Legal — live connectors (paid tier)

| ID | Name | Tier | Stand-in | Auth Pattern |
|---|---|---|---|---|
| `midpage` | midpage | paid | — | HTTP Bearer (UNCONFIRMED schema) |
| `docusign` | DocuSign | paid | no-op-signature | OAuth/JWT (docusign-esign SDK) |
| `imanage` | iManage | paid | local-fs-doc-store | HTTP Bearer (OAuth documented) |
| `netdocuments` | NetDocuments | paid | local-fs-doc-store | HTTP OAuth Bearer |
| `westlaw` | Westlaw | paid | courtlistener | HTTP key (UNCONFIRMED endpoint) |
| `lexis` | Lexis | paid | courtlistener | HTTP key (UNCONFIRMED endpoint) |

### Business — live connectors (open-access tier)

| ID | Name | Tier | Auth Pattern |
|---|---|---|---|
| `stripe` | Stripe | open-access | Official SDK (stripe npm) |
| `quickbooks` | QuickBooks | open-access | Official SDK (node-quickbooks) |
| `hubspot` | HubSpot | open-access | Official SDK (@hubspot/api-client) |
| `notion` | Notion | open-access | Official SDK (@notionhq/client) |
| `linear` | Linear | open-access | Official SDK (@linear/sdk) |

---

## Documented for future implementation

These connectors appear in the v1 PossibLaw plan (§1, "19 MCP connector targets") and were
not carried forward as live adapters in Sprint 6A/6B. Each is documented here so the
inventory persists. Status: **Documented for Sprint 6B+; not yet implemented as live connector.**

---

### Clio

**One-line description:** Cloud-based legal practice management system (matters, contacts, billing, calendars).
**Category:** legal
**Likely API surface:** REST (Clio REST API v4 — documented at `https://app.clio.com/api/v4`). OAuth 2.0 PKCE auth.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** None directly. For document workflows use `local-fs-doc-store`; for billing use `stripe` or `quickbooks`.

---

### MyCase

**One-line description:** Cloud legal practice management targeting solo and small-firm lawyers (client portal, billing, scheduling).
**Category:** legal
**Likely API surface:** REST. MyCase has a public API; exact endpoint and auth scheme vary by subscription. OAuth 2.0 expected.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** None directly. Partial coverage via `local-fs-doc-store` (documents) and `stripe` (billing).

---

### Rocket Matter

**One-line description:** Legal practice management with time tracking, billing, and client management.
**Category:** legal
**Likely API surface:** REST API. OAuth 2.0. Endpoint: `https://app.rocketmatter.com/api/`.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** None directly. Partial coverage via `stripe` (billing).

---

### Filevine

**One-line description:** Case management platform for plaintiff litigation firms with strong automation and document generation features.
**Category:** legal
**Likely API surface:** REST (Filevine API v2 — `https://api.filevine.io/v2/`). API key + org ID auth.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for document/note retrieval workflows.

---

### Smokeball

**One-line description:** Legal practice management platform with matter-centric documents and automated time tracking.
**Category:** legal
**Likely API surface:** REST API. OAuth 2.0. Primarily US/AU markets. Endpoint: `https://api.smokeball.com/`.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for document workflows.

---

### Tabs3

**One-line description:** On-premises legal billing and practice management software (Tabs3 Billing, PracticeMaster, Trust Accounting).
**Category:** legal
**Likely API surface:** REST (Tabs3 Connect API). On-premise deployments vary; cloud-hosted variant is available. Endpoint: `https://<firm-host>/tabs3connect/api/`.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `stripe` or `quickbooks` for billing workflows.

---

### Litera

**One-line description:** Document drafting and review platform for law firms — contract review, clause library, document comparison.
**Category:** legal
**Likely API surface:** REST. Litera has a developer ecosystem; API endpoints vary by product (Litera Desktop, Litera Transact). OAuth 2.0 expected.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for document storage; `midpage` for AI-assisted review.

---

### Kira (contract analysis)

**One-line description:** AI-powered contract analysis and due diligence platform — machine learning extraction of key provisions.
**Category:** legal
**Likely API surface:** REST API. OAuth 2.0. Endpoint: `https://app.kirasystems.com/api/`. Acquired by Litera in 2021; may share API infrastructure.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for document ingestion; `midpage` as AI-review stand-in.

---

### Relativity (e-discovery)

**One-line description:** Enterprise e-discovery and document review platform with AI-assisted review workflows.
**Category:** legal
**Likely API surface:** REST (Relativity REST API — `https://<host>/relativity.rest/api/`). OAuth 2.0 or API key. Requires Relativity server (on-prem or RelativityOne SaaS).
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for document ingestion and retrieval.

---

### Slack

**One-line description:** Team messaging and notification platform — channels, direct messages, webhooks.
**Category:** business
**Likely API surface:** REST (Slack Web API — `https://slack.com/api/`) + WebSocket (Events API). OAuth 2.0 with bot token scopes.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** None. Outbound webhook posting is usable via the `SLACK_WEBHOOK_URL` global config (see `~/.claude/CLAUDE.md`) independently of this connector.

---

### Zoom

**One-line description:** Video conferencing and meeting scheduling — meeting creation, participant management, recordings.
**Category:** business
**Likely API surface:** REST (Zoom API v2 — `https://api.zoom.us/v2/`). OAuth 2.0 server-to-server app auth.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** None. Calendar coordinator agent proposes slots without calendar system integration.

---

### Google Workspace (Drive / Calendar / Gmail)

**One-line description:** Google's suite — document storage (Drive), scheduling (Calendar), and email (Gmail).
**Category:** business
**Likely API surface:** REST (Google APIs — `https://www.googleapis.com/`). OAuth 2.0. Three separate APIs: Drive v3, Calendar v3, Gmail v1. Official `googleapis` npm SDK available.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for Drive document workflows. Calendar coordinator has no live connector yet (noted in agent frontmatter).

---

### Microsoft 365 (OneDrive / Outlook / Teams)

**One-line description:** Microsoft's cloud suite — document storage (OneDrive/SharePoint), email/calendar (Outlook), and team messaging (Teams).
**Category:** business
**Likely API surface:** REST (Microsoft Graph API — `https://graph.microsoft.com/v1.0/`). OAuth 2.0 (MSAL). Single `@microsoft/microsoft-graph-client` SDK covers all three surfaces.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `local-fs-doc-store` for OneDrive document workflows. Calendar coordinator has no live connector yet.

---

### Salesforce

**One-line description:** Enterprise CRM — leads, opportunities, accounts, contacts, and custom objects.
**Category:** business
**Likely API surface:** REST + SOAP (Salesforce REST API — `https://<instance>.salesforce.com/services/data/vXX.0/`) or `jsforce` npm SDK. OAuth 2.0 connected app auth.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** `hubspot` (for CRM-adjacent use cases in HubSpot-only deployments).

---

### Zapier (universal pipe)

**One-line description:** Automation platform connecting 7,000+ apps via triggers and actions — acts as a universal integration bus.
**Category:** business
**Likely API surface:** REST (Zapier NLA API — `https://nla.zapier.com/api/v1/`). API key auth. Alternatively, Zapier webhooks (inbound/outbound) can be consumed without the SDK.
**Status:** Documented for Sprint 6B+; not yet implemented as live connector.
**Stand-in equivalent:** None. When implemented, Zapier can proxy any of the deferred connectors above that have Zapier apps.
