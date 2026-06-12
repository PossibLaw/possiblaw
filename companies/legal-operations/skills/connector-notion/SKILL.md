---
name: connector-notion
description: Read pages and databases in a Notion workspace via the Notion REST API. Upload deliverables (page creation) through the gate proxy upload_document tool (destination notion) with receipted writes.
metadata:
  sources:
    - path: layer/connectors/notion.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Notion Connector

## What This Is

Notion is where many small-firm operators run their internal knowledge base, matter trackers, and SOPs. Agents call Notion to query a database for status reporting and to read existing pages. Creating or writing pages goes through the gate proxy `upload_document` tool — the proxy holds the credential, writes the receipt, and enforces policy.

**Credentials live in the gate proxy only.** If you see `credential_missing: NOTION_API_KEY`, the operator must export it before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Read operations (search, query, fetch) use an agent-accessible token. Writes go through the proxy and need no token in the agent environment.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `NOTION_API_KEY` | Internal integration token sent as `Authorization: Bearer <token>` (read path) | — | https://www.notion.so/my-integrations → New integration |
| `NOTION_VERSION` | Required `Notion-Version` header value | `2022-06-28` | Notion API release notes |

The integration must be **explicitly shared** with each page or database it needs to access — Notion does not grant workspace-wide access by default. After creating the integration, the operator clicks "Share" on the target page and adds the integration.

## When to Invoke

- A workflow produces a structured retro / debrief that belongs in the firm's Notion knowledge base (write via proxy).
- A matter tracker (Notion database) needs a new row when a new matter opens, or a status update when an existing matter advances (write via proxy).
- A reporting agent needs to query a Notion database for active matters in a given pipeline state (read directly).

Do not invoke for client-privileged content unless the Notion workspace is explicitly approved for that classification.

## Authentication

Bearer-token auth via `Authorization: Bearer $NOTION_API_KEY`. The `Notion-Version` header is **required** on every request. Official docs: https://developers.notion.com/reference/intro

## Operation Patterns

### Search pages the integration can see (read)

`Method: POST https://api.notion.com/v1/search`

Headers:
- `Authorization: Bearer $NOTION_API_KEY`
- `Notion-Version: 2022-06-28`
- `Content-Type: application/json`

Body: `{"query":"NDA","filter":{"property":"object","value":"page"}}`

### Query a database (read)

`Method: POST https://api.notion.com/v1/databases/<database_id>/query`

Body: `{"filter":{"property":"Status","status":{"equals":"In progress"}},"page_size":25}`

Pagination: response includes `has_more` and `next_cursor`; pass `start_cursor` to fetch the next page.

### Create a page via the gate proxy

To create a page in a parent database or page, call the gate proxy — never the Notion API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg name "$TITLE" \
    --arg content "$BODY" \
    --arg parentPageId "$DATABASE_OR_PAGE_ID" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{destination:"notion",name:$name,content:$content,parentPageId:$parentPageId},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/upload_document"
```

For `confidential` or `privileged` matter content, set `meta.confidentiality` accordingly — the proxy enforces policy per `gate-policy.yaml`.

**202 `{status:"pending_approval", approvalId, resumeHint}`** — the page creation is waiting for a human to approve in the dashboard. End your turn: post a Paperclip comment with the `approvalId`. When a human approves, Paperclip wakes you — re-call the SAME endpoint with the IDENTICAL payload plus `meta.approvalId`.

**200** — page created; receipt written; response includes `id`.

**403** — blocked by policy (reason in body); post the reason as a comment and mark blocked.

**502 `credential_missing: NOTION_API_KEY`** — the proxy lacks the credential; the operator must set `NOTION_API_KEY` in the launcher environment (never agent env).

### Append blocks to a page (via proxy pattern)

For appending blocks to an existing page, use the same `upload_document` proxy call with `destination: "notion"`, `parentPageId` set to the target page ID, and `content` carrying the text to append. The proxy creates a child page; if true block-append is needed, file as a follow-on operator task.

Failure modes:
- 401 → token invalid (read path). Post `BLOCKED: NOTION_API_KEY rejected`.
- 403 / `restricted_resource` → integration not shared with the target page or database. Post `BLOCKED: NOTION_INTEGRATION_NOT_SHARED <id>` with instructions to add the integration via the Share menu.
- 404 → wrong page/database ID.
- 429 → rate-limited (3 req/sec average per integration). Backoff per `Retry-After`.

## Output Convention

After a proxy-written page, post a Paperclip comment with the page title and the `id` returned from the proxy (use the Notion URL `https://www.notion.so/<id-without-hyphens>` as a convenience link). For database queries, summarize the row count and first 10 titles in a Paperclip comment; save the full JSON to the deliverables tree if more than 10 rows.

## Given / When / Then

- **Happy path** — Token valid (read), integration shared with target database; proxy upload returns 200 with page `id`; agent posts the Notion URL to Paperclip.
- **Edge** — Database query returns `has_more: true`; agent paginates fully (up to a sane cap), notes the total count in the Paperclip comment, and does not silently truncate.
- **Failure / security** — Integration not shared with the target page (403 `restricted_resource`); agent posts `[CONNECTOR:NOTION_INTEGRATION_NOT_SHARED]` with the exact share-menu instructions and never retries blindly. Token contents are never logged.
