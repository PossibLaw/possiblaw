---
name: connector-notion
description: Read and write pages and databases in a Notion workspace via the Notion REST API using an internal integration token.
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

Notion is where many small-firm operators run their internal knowledge base, matter trackers, and SOPs. Agents call Notion to create pages from a workflow output (e.g. a post-matter retrospective), update a row in a matter database, or query a database for status reporting.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `NOTION_API_KEY` | Internal integration token sent as `Authorization: Bearer <token>` | — | https://www.notion.so/my-integrations → New integration |
| `NOTION_VERSION` | Required `Notion-Version` header value | `2022-06-28` | Notion API release notes |

The integration must be **explicitly shared** with each page or database it needs to access — Notion does not grant workspace-wide access by default. After creating the integration, the operator clicks "Share" on the target page and adds the integration.

## When to Invoke

- A workflow produces a structured retro / debrief that belongs in the firm's Notion knowledge base.
- A matter tracker (Notion database) needs a new row when a new matter opens, or a status update when an existing matter advances.
- A reporting agent needs to query a Notion database for active matters in a given pipeline state.

Do not invoke for client-privileged content unless the Notion workspace is explicitly approved for that classification.

## Authentication

Bearer-token auth via `Authorization: Bearer $NOTION_API_KEY`. The `Notion-Version` header is **required** on every request. Official docs: https://developers.notion.com/reference/intro

## Operation Patterns

### Search pages the integration can see

`Method: POST https://api.notion.com/v1/search`

Headers:
- `Authorization: Bearer $NOTION_API_KEY`
- `Notion-Version: 2022-06-28`
- `Content-Type: application/json`

Body: `{"query":"NDA","filter":{"property":"object","value":"page"}}`

### Create a page in a parent database

`Method: POST https://api.notion.com/v1/pages`

```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  --data "$(jq -n --arg db "$DATABASE_ID" --arg title "$TITLE" '{
    parent: { database_id: $db },
    properties: { Name: { title: [ { text: { content: $title } } ] } }
  }')" \
  https://api.notion.com/v1/pages \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('pageId=', d['id'], 'url=', d.get('url'))"
```

### Query a database

`Method: POST https://api.notion.com/v1/databases/<database_id>/query`

Body: `{"filter":{"property":"Status","status":{"equals":"In progress"}},"page_size":25}`

Pagination: response includes `has_more` and `next_cursor`; pass `start_cursor` to fetch the next page.

### Append blocks to a page

`Method: PATCH https://api.notion.com/v1/blocks/<page_id>/children` with a `children` array of block objects.

Failure modes:
- 401 → token invalid. Post `BLOCKED: NOTION_API_KEY rejected`.
- 403 / `restricted_resource` → integration not shared with the target page or database. Post `BLOCKED: NOTION_INTEGRATION_NOT_SHARED <id>` with instructions to add the integration via the Share menu.
- 404 → wrong page/database ID.
- 429 → rate-limited (3 req/sec average per integration). Backoff per `Retry-After`.

## Output Convention

After creating or updating a page, post a Paperclip comment with the page title and the canonical `url` returned by Notion. For database queries, summarize the row count and first 10 titles in a Paperclip comment; save the full JSON to the deliverables tree if more than 10 rows.

## Given / When / Then

- **Happy path** — Token valid, integration shared with target database; create returns `200` with a `url`; agent posts the Notion URL to Paperclip.
- **Edge** — Database query returns `has_more: true`; agent paginates fully (up to a sane cap), notes the total count in the Paperclip comment, and does not silently truncate.
- **Failure / security** — Integration not shared with the target page (403 `restricted_resource`); agent posts `[CONNECTOR:NOTION_INTEGRATION_NOT_SHARED]` with the exact share-menu instructions and never retries blindly. Token contents are never logged.
