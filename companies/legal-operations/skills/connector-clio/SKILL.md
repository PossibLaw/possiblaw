---
name: connector-clio
description: Read matters, contacts, time entries, and bills in Clio Manage via the Clio API v4 (REST, OAuth 2.0). External write operations go through the gate proxy share_external tool — v1 gate refuses this with not_implemented, so writes are visibly blocked rather than silently credentialed.
metadata:
  sources:
    - path: companies/legal-operations/skills/connector-clio/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Clio Connector

## What This Is

Clio Manage is the dominant practice-management SaaS for small and mid-size law firms — matters, contacts, time entries, and billing live there. Agents call Clio directly for read-only operations (listing matters, looking up contacts, fetching bills). External write operations — creating contacts, recording time entries — are routed through the gate proxy `share_external` tool. **In v1 the gate returns `502 not_implemented` for `share_external`**, so these writes are visibly blocked rather than silently credentialed. This is an honest posture: Clio write paths are future gate work.

Clio is the system of record for matter metadata; documents stay in the doc-store connectors.

**Write credentials will live in the gate proxy once Clio is implemented gate-side — they do not yet.** The v1 proxy returns `502 not_implemented` for `share_external` unconditionally, before it would ever check for a Clio credential; credential wiring arrives when the connector is implemented gate-side (see "Write operations" below). For the **read** path, the agent holds its own `CLIO_ACCESS_TOKEN`; a `401` means it expired or was issued for the wrong region — the operator must refresh or re-export it (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

The API is region-bound: tokens issued against the US host are not valid against the EU, CA, or AU hosts. Base URLs per the official OpenAPI spec (https://docs.developers.clio.com/openapi.json, accessed 2026-06-09):

- US: `https://app.clio.com/api/v4`
- EU: `https://eu.app.clio.com/api/v4`
- Canada: `https://ca.app.clio.com/api/v4`
- Australia: `https://au.app.clio.com/api/v4`

## Required Environment Variables

Read-only operations use the agent's OAuth tokens. Writes go through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `CLIO_BASE_URL` | Regional API base (see list above) | `https://app.clio.com/api/v4` | Choose the region where the firm's Clio account lives |
| `CLIO_CLIENT_ID` | OAuth 2.0 application key | — | Clio web UI → Settings → Developer Applications |
| `CLIO_CLIENT_SECRET` | OAuth 2.0 application secret | — | Same page as the key; keep in the operator's secret store |
| `CLIO_ACCESS_TOKEN` | OAuth 2.0 bearer token (30-day TTL, read path) | — | Authorization-code flow per Clio docs |
| `CLIO_REFRESH_TOKEN` | OAuth 2.0 refresh token (does not expire; revocable) | — | Persisted from the original authorization-code exchange |

## When to Invoke (read-only — direct)

- An intake agent needs to confirm whether a prospective client or matter already exists before creating duplicates.
- A finance agent needs bill state (e.g. `overdue_only=true`) for collections follow-up.
- A matter agent needs the matter `display_number` and responsible attorney for a deliverable header.

## When to Invoke (write — via proxy, v1 blocked)

- A billing-prep agent has completed, operator-approved work to record as a `TimeEntry` against a matter.
- A contact must be created in Clio.

Clio records are confidential client data: request the minimum fields needed (`fields` param), and run matter content through `privacy-encoder` before any cloud-lane summarization of a matter flagged confidential or privileged. Do not store documents through this connector (use the doc-store connectors), and never write to a live Clio account from a workflow the operator has not approved.

## Authentication

OAuth 2.0 authorization-code flow. Authorize at `https://app.clio.com/oauth/authorize`; exchange and refresh at `https://app.clio.com/oauth/token`; revoke at `https://app.clio.com/oauth/deauthorize` (substitute the regional host for non-US accounts). Access tokens last 30 days; refresh tokens do not expire and must be stored encrypted. Include `Authorization: Bearer $CLIO_ACCESS_TOKEN` on every **read** request. Official docs: https://docs.developers.clio.com/api-docs/clio-manage/authorization/ (accessed 2026-06-09).

## Operation Patterns

Endpoints below are verified against the official OpenAPI spec (https://docs.developers.clio.com/openapi.json, accessed 2026-06-09). Clio returns a minimal field set by default — always pass `fields=` explicitly (see https://docs.developers.clio.com/api-docs/clio-manage/fields/, accessed 2026-06-09).

### List / search matters (read-only — direct)

`Method: GET ${CLIO_BASE_URL}/matters.json?query=<text>&status=open&fields=id,display_number,description,status`

Headers:
- `Authorization: Bearer $CLIO_ACCESS_TOKEN`
- `Accept: application/json`

Example:
```sh
curl -sS \
  -H "Authorization: Bearer ${CLIO_ACCESS_TOKEN}" \
  -H "Accept: application/json" \
  --data-urlencode "query=Acme" \
  --data-urlencode "status=open" \
  --data-urlencode "fields=id,display_number,description,status" \
  -G "${CLIO_BASE_URL}/matters.json" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(m['id'], m.get('display_number'), m.get('description')) for m in d.get('data',[])]"
```

### Find a contact (read-only — direct)

`Method: GET ${CLIO_BASE_URL}/contacts.json?query=<name-or-email>&fields=id,name,type`

### List bills (read-only — direct)

`Method: GET ${CLIO_BASE_URL}/bills.json?matter_id=<id>&overdue_only=true&fields=id,state,due_at` — the spec exposes `GET` only on `/bills.json` (no create); fetch a single bill via `GET ${CLIO_BASE_URL}/bills/<id>.json`.

### Write operations (time entry, contact create) via the gate proxy

Write operations go through the proxy — never the Clio API directly:

```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${PAPERCLIP_API_KEY}" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg op "$OPERATION" \
    --arg target "clio" \
    --argjson payload "$WRITE_PAYLOAD" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{target:$target,operation:$op,data:$payload},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/share_external"
```

**v1 response: `502 not_implemented`** — the gate refuses `share_external` with `not_implemented: share_external needs an operator-configured destination (v1)`. Post this as a Paperclip comment and mark the write blocked. The operator must execute the write manually (e.g. enter the time entry in Clio directly) or wait for gate v2 Clio support.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 → access token expired or issued for a different region (read path). Refresh at the regional `/oauth/token`; if refresh fails, post `BLOCKED: CLIO_AUTH_EXPIRED` and ask operator to re-authorize.
- 403 → application lacks the needed Clio permission; post `BLOCKED: CLIO_PERMISSION_DENIED` naming the operation.
- 404 → wrong regional base URL or deleted record; confirm `CLIO_BASE_URL` before retrying.
- 429 → rate-limited. UNCONFIRMED — Clio's current rate-limit thresholds; honor `Retry-After` when present and back off.
- 5xx → upstream issue; surface status + body in a Paperclip comment.

## Output Convention

For read operations, post a Paperclip comment with the Clio record `id`, the record type, and the matter `display_number` where applicable. UNCONFIRMED — the Clio web-UI deep-link format per region; link the firm's Clio host generically rather than guessing a path. For list/query operations, summarize count and first 10 records; never paste full client contact details into comments when an ID and name suffice. For attempted writes that return `not_implemented`, post `[CONNECTOR:CLIO_WRITE_NOT_IMPLEMENTED_V1]` with the operation details.

## Given / When / Then

- **Happy path** — Token valid, matter list read returns results; agent posts the matters to Paperclip.
- **Edge** — Matter search by client name returns multiple open matters; agent does not guess — it posts the candidate list (`id` + `display_number`) and asks the operator to pick before any write.
- **Failure / security** — Write attempt returns `502 not_implemented` from the proxy: agent posts `[CONNECTOR:CLIO_WRITE_NOT_IMPLEMENTED_V1]`, does not retry the direct Clio API, and never logs token bytes or client-identifying matter data.
