# Connector Inventory

Complete inventory of all PossibLaw connectors — operational and planned.

All egress writes go through the Gate Proxy (`POST $GATE_PROXY_URL/egress/<tool>`). The proxy holds every egress credential, writes a receipt for each call, and enforces the firm's `gate-policy.yaml`. Agents hold no credentials for the proxied egress paths; agent-side read tokens must be read-scoped (see each connector skill). Read-only operations go directly to the vendor API using agent-scoped read tokens. If a `502 credential_missing` response arrives from the proxy, the operator must export the named credential in the launcher environment and restart; never set egress write credentials in an agent environment.

---

## Egress-via-gate (writes route through the Gate Proxy)

| Connector | Gate tool | Destination key | v1 status |
|---|---|---|---|
| `connector-gmail` | `send_email` | `to` / `subject` / `body` | Human-gated or receipted per `THIRD_PARTY_EGRESS` policy |
| `connector-outlook` | `send_email` | `to` / `subject` / `body` | Human-gated or receipted per `THIRD_PARTY_EGRESS` policy |
| `connector-google-drive` | `upload_document` | `destination: "gdrive"` | Receipted; 202 on pending approval |
| `connector-onedrive` | `upload_document` | `destination: "onedrive"`, `driveId`, `parentItemId` | Receipted; 202 on pending approval |
| `connector-notion` | `upload_document` | `destination: "notion"`, `parentPageId` | Receipted; 202 on pending approval |
| `connector-docusign` | `sign_document` | action package (v1: human executes) | `SIGNATURE: human` in policy |
| `connector-no-op-signature` | `sign_document` | action package (v1: local stub) | `SIGNATURE: human` in policy |
| `connector-stripe` | `send_payment` | action package (v1: human executes) | `MONEY_MOVEMENT: human` in policy |
| `connector-quickbooks` | `send_payment` | action package (v1: human executes) | `MONEY_MOVEMENT: human` in policy |
| `connector-hubspot` | `share_external` | v1: `not_implemented` — writes visibly blocked | Future gate work |
| `connector-linear` | `share_external` | v1: `not_implemented` — writes visibly blocked | Future gate work |
| `connector-clio` | `share_external` | v1: `not_implemented` — writes visibly blocked | Future gate work |
| `connector-imanage` | `share_external` | v1: `not_implemented` — writes visibly blocked | Future gate work |
| `connector-netdocuments` | `share_external` | v1: `not_implemented` — writes visibly blocked | Future gate work |

**Note on `share_external` connectors:** The gate returns `502 not_implemented` for all `share_external` calls in v1. This is a deliberate posture — writes are visibly refused rather than silently credentialed. Operator must execute writes manually until gate v2 adds per-vendor support.

**Note on notify-slack / notify-teams webhooks:** These remain direct in v1. They are operator-configured, low-payload notification surfaces (no matter content) and are listed as future gate candidates when the gate adds webhook egress support.

---

## Citation gate (Phase 2 — OUTBOUND_QUALITY)

On the boundaries listed in `gate-policy.yaml` `citationGate.boundaries` (default `COURT_FILING` + `THIRD_PARTY_EGRESS`), the gate inspects the outbound document text **before** any policy dispatch. If the text carries detectable legal citations, the egress is blocked `403 {reason: "citation_gate_unverified"}` until a passing citation verification has been registered for that exact text. Text with no detectable citations passes untouched. A gated egress whose payload carries no reviewable document text at all is blocked `403 {reason: "citation_gate_no_document"}` (fail-closed — the gate cannot rule out citations it cannot see).

The document text the gate reads, per tool:

| Gate tool | Document field |
|---|---|
| `send_email` | `body` |
| `upload_document` | `content` |
| `share_external` | `content` |
| `file_court_document` | `documentText` |

`file_court_document` is not a connector in the egress table above — it is the action-package egress tool for the `COURT_FILING` boundary (the gate produces a local action package for a human to file in v1; see "The Gate Proxy" in the operator walkthrough).

**Agent remediation flow on a `403 citation_gate_unverified`:** do NOT remove or trim the citations to get past the gate. Route the draft to the citation checker (via `research-lead` → `legal-citation-checker`). After the checker registers a passing verification (`POST $GATE_PROXY_URL/quality/citation`, see `citation-verification-checklist` → "Gate Registration"), re-call the same egress endpoint with the identical document text. Editing the text after verification changes its sha and re-blocks.

**Honest scope:** the gate proves every detectable citation has a registered, all-`Yes` verification row bound to this exact text, and that any attested quote is verbatim in the draft. It does not prove the cited authority is good law, nor that the source passage genuinely came from the cited authority — those stay the checker's workflow plus the operator's citator follow-up. Extractor coverage is curated common classes, not full Bluebook (see `docs/known-limitations.md` → "Citation gate").

---

## Read-only direct (reads go directly to vendor API)

Agents use their own scoped tokens for these connectors. No egress credential lives in the gate proxy for read paths.

**MCP-registered connectors.** MCP-server connectors are declared once in `companies/legal-operations/mcp-servers.yaml` (seeded with `legal-data` and `courtlistener-official`). At launch, `bin/possiblaw` renders the registry into whichever model-runtime CLI config the chosen variant's adapter uses, via the stdlib-only helper `bin/_possiblaw_mcp.py` (`--self-test` covered). `grantTo` in the registry is **advisory** — CLI MCP configs are global per runtime, not per-subagent. See `docs/builds/mcp-registry.md`.

| Connector | What it reads | Query privacy caveat |
|---|---|---|
| `connector-courtlistener` | U.S. federal and state opinions, dockets | Keep queries to neutral terms for confidential/privileged matters; avoid embedding client names or matter identifiers in search strings |
| `connector-westlaw` | Case law, KeyCite, secondary sources (enterprise contract required) | Keep queries to neutral terms; Westlaw queries transmit to Thomson Reuters infrastructure |
| `connector-lexis` | Case law, Shepard's, secondary sources (enterprise contract required) | Keep queries to neutral terms; Lexis queries transmit to LexisNexis infrastructure |
| `connector-midpage` | Brief summarization, citation extraction (API access required) | Keep prompts minimal; strip client-identifying content before sending to midpage AI |

Firms wanting all research queries gated and receipted can promote research connectors behind the gate via policy — see the comments in `companies/legal-operations/gate-policy.yaml`.

---

## Local (no network egress)

| Connector | What it does |
|---|---|
| `connector-local-fs-doc-store` | Read/write documents to a local filesystem path; no credentials, no network |

---

## Firm-facing MCP facade (Phase 3)

An outside assistant (Claude Desktop, Codex, or any MCP client that speaks stdio) connects to the firm through the facade server (`mcp-servers/firm-facade/`). The facade is spawned by the outside assistant as a subprocess — it is not a listening TCP server. Every call writes a `firm_facade` receipt through the gate proxy, so facade actions appear in the whole-chain tamper-evident audit (`GET /receipts/verify`) alongside internal egress. They are not yet surfaced in the per-matter `GET /receipts/bundle` Matter Trust Report — facade receipts carry `meta.matterId` while the bundle filters on the top-level `issueId` field; bundle inclusion is a planned enhancement (see `docs/known-limitations.md`).

| Tool | Required inputs | Returns | Receipt written |
|---|---|---|---|
| `create_matter` | `title` (required), `description?`, `projectId?` | `{ matterId, status }` | `firm_facade` / `performed`; `matterId` in receipt field |
| `get_matter_status` | `matterId` | `{ matterId, status, workProductCount, documentCount }` | `firm_facade` / `performed`; `matterId` in receipt field |
| `list_work_products` | `matterId` | array of `{ id, type, title, status, reviewState, isPrimary, url }` | `firm_facade` / `performed`; `matterId` in receipt field |
| `fetch_work_product` | `matterId`, `workProductId`, `include_text?` | metadata + link by default; full text when policy opt-in + `include_text: true` | `firm_facade` / `performed`; `meta.textDisclosed` boolean flag; no document body in receipt |
| `request_approval` | `matterId`, `action`, `summary` | `{ status: "pending_approval", approvalId, deepLink }`; plus a `note` when deepLink is null (deep-link config missing) | `firm_facade` / `pending`; `approvalId` + `matterId` in receipt; no action/summary text in receipt |

**Human-only approval.** `request_approval` creates a `request_board_approval` in Paperclip and always returns `status: "pending_approval"`. The facade exposes no approve or decide tool; the company-scoped agent key 403s on Paperclip's `assertBoard` board-decide endpoints on authenticated instances. A human approves or rejects in the Paperclip dashboard.

**Default-closed work-product text.** `fetch_work_product` withholds document body text unless `firmFacade.allowWorkProductText: true` is set in `gate-policy.yaml` AND the caller passes `include_text: true`. Full text is resolvable only when the work product carries a document key (`externalId` or `metadata.documentKey`); URL-only work products (pull requests, preview links) return a link and `textWithheld: true` with a note.

**No privileged text in receipts.** `payloadSha256` for every call is computed over tool name and IDs only — never over titles, descriptions, action or summary text, or document bodies. `meta.textDisclosed` in a `fetch_work_product` receipt is a boolean flag, not the text itself.

Spawn the facade: `./bin/possiblaw --firm-facade` (live run; requires the gate proxy). Implementation: `mcp-servers/firm-facade/`. Walkthrough: "Drive your firm from your assistant" in `docs/operator-walkthrough.md`. Honest limits: `docs/known-limitations.md` → "Firm-facing MCP facade (v1)".

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
