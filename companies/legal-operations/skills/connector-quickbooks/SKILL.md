---
name: connector-quickbooks
description: Read and write customers, invoices, and accounts in QuickBooks Online via the Intuit QuickBooks Online REST API using OAuth 2.0.
metadata:
  sources:
    - path: layer/connectors/quickbooks.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# QuickBooks Connector

## What This Is

QuickBooks Online (QBO) is the accounting backend for small-firm finance ops. Agents call QBO to create invoices from billable matter activity, look up customers, and pull AR reports. The sandbox environment (`https://sandbox-quickbooks.api.intuit.com`) is free; production (`https://quickbooks.api.intuit.com`) requires a paid Intuit Developer app review.

Note: the legacy descriptor referenced an OAuth 1.0a SDK (`node-quickbooks`), but Intuit's current QuickBooks Online REST API requires **OAuth 2.0**. This skill documents the OAuth 2.0 flow, which is the supported path going forward.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `QBO_CLIENT_ID` | OAuth 2.0 client ID for the Intuit app | — | https://developer.intuit.com → My Apps → Keys & OAuth |
| `QBO_CLIENT_SECRET` | OAuth 2.0 client secret | — | Intuit Developer portal |
| `QBO_ACCESS_TOKEN` | OAuth 2.0 access token (1-hour TTL) | — | Authorization-code flow per Intuit docs |
| `QBO_REFRESH_TOKEN` | OAuth 2.0 refresh token (100-day TTL, rotated on use) | — | Persisted from the original authorization-code exchange |
| `QBO_REALM_ID` | QuickBooks company ID (also called "realm ID") | — | Returned in the OAuth callback as `realmId` |
| `QBO_USE_SANDBOX` | `true` to hit the sandbox host, `false` for production | `true` | Operator chooses per environment |

## When to Invoke

- A billing agent has matter time entries ready to invoice and needs to create a QBO invoice.
- A finance agent needs an AR-aging report for active clients.
- An intake agent needs to confirm whether a prospective client already exists as a QBO customer (avoiding duplicates).

Do not invoke for non-billing matter content, and never write to production QBO from a workflow that has not been approved by the operator.

## Authentication

OAuth 2.0 authorization-code flow. Include `Authorization: Bearer $QBO_ACCESS_TOKEN` on every request. Access tokens expire after 1 hour; refresh via `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` with `grant_type=refresh_token`. **Refresh tokens rotate on every use** — the response includes a new refresh token that must replace the stored one. Official docs: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0

## Operation Patterns

Base host:
- Sandbox: `https://sandbox-quickbooks.api.intuit.com`
- Production: `https://quickbooks.api.intuit.com`

### List customers

`Method: GET ${QBO_BASE}/v3/company/${QBO_REALM_ID}/query?query=SELECT * FROM Customer MAXRESULTS 25`

Headers:
- `Authorization: Bearer $QBO_ACCESS_TOKEN`
- `Accept: application/json`

Example:
```sh
QBO_BASE="https://sandbox-quickbooks.api.intuit.com"
[ "${QBO_USE_SANDBOX:-true}" = "false" ] && QBO_BASE="https://quickbooks.api.intuit.com"
QUERY="SELECT * FROM Customer MAXRESULTS 25"
curl -sS \
  -H "Authorization: Bearer ${QBO_ACCESS_TOKEN}" \
  -H "Accept: application/json" \
  --data-urlencode "query=${QUERY}" \
  -G "${QBO_BASE}/v3/company/${QBO_REALM_ID}/query" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(c['Id'], c.get('DisplayName')) for c in d.get('QueryResponse',{}).get('Customer',[])]"
```

### Create an invoice

`Method: POST ${QBO_BASE}/v3/company/${QBO_REALM_ID}/invoice`

Body (minimum required fields):
```json
{
  "CustomerRef": { "value": "<customerId>" },
  "Line": [{
    "Amount": 1500.00,
    "DetailType": "SalesItemLineDetail",
    "SalesItemLineDetail": { "ItemRef": { "value": "<itemId>" } }
  }]
}
```

### Get an account list

`Method: GET ${QBO_BASE}/v3/company/${QBO_REALM_ID}/query?query=SELECT * FROM Account`

Failure modes:
- 401 → access token expired. Refresh; if refresh fails (refresh token also expired or revoked), post `BLOCKED: QBO_AUTH_EXPIRED` and ask operator to re-authorize via the Intuit OAuth flow.
- 403 → scope missing or app not approved for production.
- 429 → rate-limited (500 req/min per realm). Backoff per `Retry-After`.
- 5xx → upstream issue.

## Output Convention

After creating an invoice, post a Paperclip comment with the QBO `Invoice.Id`, `DocNumber`, customer name, and total. For list/query operations, summarize count and first 10 records; link to the QBO web UI (`https://app.qbo.intuit.com/app/invoice?txnId=<id>`) where applicable.

## Given / When / Then

- **Happy path** — Tokens valid, sandbox mode, invoice POST returns `200` with an `Id`; agent posts the invoice ID and total to Paperclip.
- **Edge** — Access token expired mid-task; agent refreshes silently, **writes the rotated refresh token back to the secret store**, and resumes the call. (If the rotation step is skipped, the next refresh will fail.)
- **Failure / security** — `QBO_USE_SANDBOX=false` set in a demo/eval context with sandbox tokens: agent detects the mismatch (sandbox tokens against production host returns 401), posts `[CONNECTOR:QBO_ENV_MISMATCH]`, and refuses to retry. Tokens are never logged.
