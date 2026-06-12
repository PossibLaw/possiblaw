---
name: connector-quickbooks
description: Read customers, invoices, and accounts in QuickBooks Online for reporting. Invoice creation and other money-movement operations go through the gate proxy send_payment tool (action package v1).
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

QuickBooks Online (QBO) is the accounting backend for small-firm finance ops. Agents call QBO directly for read-only operations (listing customers, pulling AR reports). Invoice creation and money-movement operations go through the gate proxy `send_payment` tool (action package v1). The sandbox environment (`https://sandbox-quickbooks.api.intuit.com`) is free; production (`https://quickbooks.api.intuit.com`) requires a paid Intuit Developer app review.

Note: the legacy descriptor referenced an OAuth 1.0a SDK (`node-quickbooks`), but Intuit's current QuickBooks Online REST API requires **OAuth 2.0**. This skill documents the OAuth 2.0 flow, which is the supported path going forward.

**Credentials live in the gate proxy only.** If you see `credential_missing` from the proxy, the operator must export it before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Read-only operations use the agent's OAuth tokens. Money-movement goes through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `QBO_CLIENT_ID` | OAuth 2.0 client ID for the Intuit app | — | https://developer.intuit.com → My Apps → Keys & OAuth |
| `QBO_CLIENT_SECRET` | OAuth 2.0 client secret | — | Intuit Developer portal |
| `QBO_ACCESS_TOKEN` | OAuth 2.0 access token for agent-side read operations (1-hour TTL); must be granted read-only scopes — a token with write scopes on the agent side would bypass the `MONEY_MOVEMENT` human gate | — | Authorization-code flow per Intuit docs |
| `QBO_REFRESH_TOKEN` | OAuth 2.0 refresh token (100-day TTL, rotated on use) | — | Persisted from the original authorization-code exchange |
| `QBO_REALM_ID` | QuickBooks company ID (also called "realm ID") | — | Returned in the OAuth callback as `realmId` |
| `QBO_USE_SANDBOX` | `true` to hit the sandbox host, `false` for production | `true` | Operator chooses per environment |

## When to Invoke (read-only — direct)

- A finance agent needs an AR-aging report for active clients.
- An intake agent needs to confirm whether a prospective client already exists as a QBO customer (avoiding duplicates).

## When to Invoke (money-movement — via proxy)

- A billing agent has matter time entries ready to invoice and needs to create a QBO invoice.

Do not invoke for non-billing matter content, and never write to production QBO from a workflow that has not been approved by the operator.

## Authentication

OAuth 2.0 authorization-code flow. Include `Authorization: Bearer $QBO_ACCESS_TOKEN` on every **read** request. Access tokens expire after 1 hour; refresh via `POST https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer` with `grant_type=refresh_token`. **Refresh tokens rotate on every use** — the response includes a new refresh token that must replace the stored one. Official docs: https://developer.intuit.com/app/developer/qbo/docs/develop/authentication-and-authorization/oauth-2.0

## Operation Patterns

Base host:
- Sandbox: `https://sandbox-quickbooks.api.intuit.com`
- Production: `https://quickbooks.api.intuit.com`

### List customers (read-only — direct)

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

### Get an account list (read-only — direct)

`Method: GET ${QBO_BASE}/v3/company/${QBO_REALM_ID}/query?query=SELECT * FROM Account`

### Create an invoice via the gate proxy

Invoice creation (money-movement) goes through the proxy — never the QBO API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg customerId "$CUSTOMER_ID" \
    --argjson amount 1500.00 \
    --arg description "$DESCRIPTION" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{operation:"create_invoice",customerId:$customerId,
               amount:$amount,description:$description},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/send_payment"
```

**v1 action-package contract:** The proxy writes a local action package and returns:

```json
{
  "actionPackage": "/path/to/<timestamp>-send_payment.json",
  "note": "no external API in v1 — a human executes this package manually"
}
```

A human reviews the package and executes the QBO invoice creation manually.

**202 `{status:"pending_approval", approvalId, resumeHint}`** — a human must approve (policy: `MONEY_MOVEMENT: human`). End your turn: post a Paperclip comment with the `approvalId`. When approved, Paperclip wakes you — re-call the SAME endpoint with the IDENTICAL payload plus `meta.approvalId`. Changing the payload after approval is blocked (`bait_and_switch` receipt).

**200** — action package written; post the path to Paperclip.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 → access token expired (read path). Refresh; if refresh fails (refresh token also expired or revoked), post `BLOCKED: QBO_AUTH_EXPIRED` and ask operator to re-authorize via the Intuit OAuth flow.
- 403 → scope missing or app not approved for production.
- 429 → rate-limited (500 req/min per realm). Backoff per `Retry-After`.
- 5xx → upstream issue.

## Output Convention

After a proxy-initiated invoice creation, post a Paperclip comment with the action package path, customer name, and the total amount. Add the v1 note that a human must execute the package and create the invoice in QBO. For list/query operations, summarize count and first 10 records.

## Given / When / Then

- **Happy path** — Tokens valid, sandbox mode, proxy receives the send_payment call, writes the action package, returns 200; agent posts the package path + `mode=sandbox` disclosure to Paperclip.
- **Edge** — Access token expired mid-task (read path); agent refreshes silently, **writes the rotated refresh token back to the secret store**, and resumes the call. (If the rotation step is skipped, the next refresh will fail.)
- **Failure / security** — `QBO_USE_SANDBOX=false` set in a demo/eval context with sandbox tokens: agent detects the mismatch (sandbox tokens against production host returns 401), posts `[CONNECTOR:QBO_ENV_MISMATCH]`, and refuses to retry. Tokens are never logged. A workflow attempts to call the QBO invoice API directly bypassing the proxy: agent refuses and posts `[CONNECTOR:QBO_DIRECT_WRITE_BLOCKED]`.
