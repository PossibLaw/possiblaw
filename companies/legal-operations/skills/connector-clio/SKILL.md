---
name: connector-clio
description: Read and write matters, contacts, time entries, and bills in Clio Manage via the Clio API v4 (REST, OAuth 2.0) — the practice-management system of record.
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

Clio Manage is the dominant practice-management SaaS for small and mid-size law firms — matters, contacts, time entries, and billing live there. Agents call Clio to confirm a matter exists before drafting against it, look up client contacts, record billable time from completed agent work, and pull bill state for AR follow-up. Clio is the system of record for matter metadata; documents stay in the doc-store connectors.

The API is region-bound: tokens issued against the US host are not valid against the EU, CA, or AU hosts. Base URLs per the official OpenAPI spec (https://docs.developers.clio.com/openapi.json, accessed 2026-06-09):

- US: `https://app.clio.com/api/v4`
- EU: `https://eu.app.clio.com/api/v4`
- Canada: `https://ca.app.clio.com/api/v4`
- Australia: `https://au.app.clio.com/api/v4`

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `CLIO_BASE_URL` | Regional API base (see list above) | `https://app.clio.com/api/v4` | Choose the region where the firm's Clio account lives |
| `CLIO_CLIENT_ID` | OAuth 2.0 application key | — | Clio web UI → Settings → Developer Applications |
| `CLIO_CLIENT_SECRET` | OAuth 2.0 application secret | — | Same page as the key; keep in the operator's secret store |
| `CLIO_ACCESS_TOKEN` | OAuth 2.0 bearer token (30-day TTL) | — | Authorization-code flow per Clio docs |
| `CLIO_REFRESH_TOKEN` | OAuth 2.0 refresh token (does not expire; revocable) | — | Persisted from the original authorization-code exchange |

## When to Invoke

- An intake agent needs to confirm whether a prospective client or matter already exists before creating duplicates.
- A billing-prep agent has completed, operator-approved work to record as a `TimeEntry` against a matter.
- A finance agent needs bill state (e.g. `overdue_only=true`) for collections follow-up.
- A matter agent needs the matter `display_number` and responsible attorney for a deliverable header.

Clio records are confidential client data: request the minimum fields needed (`fields` param), and run matter content through `privacy-encoder` before any cloud-lane summarization of a matter flagged confidential or privileged. Do not store documents through this connector (use the doc-store connectors), and never write to a live Clio account from a workflow the operator has not approved.

## Authentication

OAuth 2.0 authorization-code flow. Authorize at `https://app.clio.com/oauth/authorize`; exchange and refresh at `https://app.clio.com/oauth/token`; revoke at `https://app.clio.com/oauth/deauthorize` (substitute the regional host for non-US accounts). Access tokens last 30 days; refresh tokens do not expire and must be stored encrypted. Include `Authorization: Bearer $CLIO_ACCESS_TOKEN` on every request. Official docs: https://docs.developers.clio.com/api-docs/clio-manage/authorization/ (accessed 2026-06-09).

## Operation Patterns

Endpoints below are verified against the official OpenAPI spec (https://docs.developers.clio.com/openapi.json, accessed 2026-06-09). Clio returns a minimal field set by default — always pass `fields=` explicitly (see https://docs.developers.clio.com/api-docs/clio-manage/fields/, accessed 2026-06-09).

### List / search matters

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

### Find or create a contact

`Method: GET ${CLIO_BASE_URL}/contacts.json?query=<name-or-email>&fields=id,name,type`

`Method: POST ${CLIO_BASE_URL}/contacts.json` with body `{"data": {"name": "Acme Holdings LLC", "type": "Company"}}` — `name` and `type` are the required fields per the spec.

### Record a time entry

`Method: POST ${CLIO_BASE_URL}/activities.json`

Body (required fields are `type` and `date`; `type` enum is `TimeEntry`, `ExpenseEntry`, `HardCostEntry`, `SoftCostEntry` per the spec):
```json
{
  "data": {
    "type": "TimeEntry",
    "date": "2026-06-09",
    "quantity": 3600,
    "price": 250.0,
    "matter": { "id": 12345 },
    "note": "Drafted NDA redline per operator instruction",
    "non_billable": false
  }
}
```

UNCONFIRMED — the unit of `quantity` for time entries (seconds vs. hours) is not stated in the spec's field list; verify one entry against a test account before bulk writes.

### List bills (read-only)

`Method: GET ${CLIO_BASE_URL}/bills.json?matter_id=<id>&overdue_only=true&fields=id,state,due_at` — the spec exposes `GET` only on `/bills.json` (no create); fetch a single bill via `GET ${CLIO_BASE_URL}/bills/<id>.json`.

Failure modes:
- 401 → access token expired or issued for a different region. Refresh at the regional `/oauth/token`; if refresh fails, post `BLOCKED: CLIO_AUTH_EXPIRED` and ask operator to re-authorize.
- 403 → application lacks the needed Clio permission; post `BLOCKED: CLIO_PERMISSION_DENIED` naming the operation.
- 404 → wrong regional base URL or deleted record; confirm `CLIO_BASE_URL` before retrying.
- 429 → rate-limited. UNCONFIRMED — Clio's current rate-limit thresholds; honor `Retry-After` when present and back off.
- 5xx → upstream issue; surface status + body in a Paperclip comment.

## Output Convention

After a write, post a Paperclip comment with the Clio record `id`, the record type, and the matter `display_number` where applicable. UNCONFIRMED — the Clio web-UI deep-link format per region; link the firm's Clio host generically rather than guessing a path. For list/query operations, summarize count and first 10 records; never paste full client contact details into comments when an ID and name suffice.

## Given / When / Then

- **Happy path** — Token valid, `POST /activities.json` returns the created activity with an `id`; agent posts the activity ID, matter display number, and quantity to Paperclip.
- **Edge** — Matter search by client name returns multiple open matters; agent does not guess — it posts the candidate list (`id` + `display_number`) and asks the operator to pick before writing time.
- **Failure / security** — `CLIO_BASE_URL` points at the US host but the tokens were issued in the EU region: the API returns 401; agent posts `[CONNECTOR:CLIO_REGION_MISMATCH]`, refuses to retry other regions automatically, and never logs token bytes or client-identifying matter data.
