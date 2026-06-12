---
name: connector-stripe
description: Look up customers, invoices, and charges in Stripe for reporting. Money-movement operations (charges, invoice sends, payment links) go through the gate proxy send_payment tool (action package v1).
metadata:
  sources:
    - path: layer/connectors/stripe.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Stripe Connector

## What This Is

Stripe is the payments processor for client invoicing, payment links, and refunds. Agents call Stripe directly for read-only operations (listing customers, fetching charge history). Money-movement operations — creating invoices to send, triggering charges, and issuing payment links — go through the gate proxy `send_payment` tool (action package v1). Stripe has a free test mode (`sk_test_...` keys) that the connector uses by default during demos and CI.

**Credentials live in the gate proxy only.** If you see `credential_missing` from the proxy, the operator must export it before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Read-only operations use the agent's API key. Money-movement goes through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `STRIPE_API_KEY` | Restricted read-only API key for read operations; **must** be a restricted key (`rk_test_...` / `rk_live_...`), never a secret key (`sk_...`); a secret key on the agent side would bypass the `MONEY_MOVEMENT` human gate by granting agents direct write access | — | https://dashboard.stripe.com/apikeys → Restricted keys → create with read-only permissions |
| `STRIPE_API_VERSION` | Pinned API version sent as `Stripe-Version` header | unset (uses account default) | https://stripe.com/docs/api/versioning |

Test mode is implied by the `rk_test_` / `sk_test_` prefix; live mode by `rk_live_` / `sk_live_`. The connector does **not** require a separate env flag — the key prefix is authoritative.

## When to Invoke (read-only — direct)

- A finance agent needs to look up a past charge, customer, or invoice.
- An intake agent needs to confirm whether a prospective client already exists as a Stripe customer.

## When to Invoke (money-movement — via proxy)

- A billing agent needs to invoice a client for completed matter work.
- A new client signed an engagement letter and needs to be created as a Stripe customer.
- An intake agent needs a payment link for a flat-fee consultation.

Do not invoke live-mode keys from a CI or eval context. Money-movement requires operator approval before the proxy finalizes the action package.

## Authentication

HTTP Basic with the secret key as the username and an empty password, or `Authorization: Bearer $STRIPE_API_KEY` (Stripe accepts both). Use Bearer for shell scripts. Official docs: https://stripe.com/docs/api/authentication

## Operation Patterns

Stripe endpoints accept `application/x-www-form-urlencoded` bodies (not JSON for writes).

### List customers (read-only — direct)

`Method: GET https://api.stripe.com/v1/customers?limit=25&email=client@example.com`

```sh
curl -sS \
  -H "Authorization: Bearer ${STRIPE_API_KEY}" \
  "https://api.stripe.com/v1/customers?limit=25" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(c['id'], c.get('email')) for c in d.get('data',[])]"
```

### Fetch a charge or invoice (read-only — direct)

`Method: GET https://api.stripe.com/v1/charges/<id>` or `GET https://api.stripe.com/v1/invoices/<id>`

### Create a customer / invoice / payment link via the gate proxy

Money-movement operations go through the proxy — never the Stripe API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg operation "$OPERATION" \
    --arg customerId "$CUSTOMER_ID" \
    --arg amount "$AMOUNT_CENTS" \
    --arg description "$DESCRIPTION" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{operation:$operation,customerId:$customerId,
               amountCents:$amount,description:$description},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/send_payment"
```

**v1 action-package contract:** The proxy writes a local action package (JSON file) and returns:

```json
{
  "actionPackage": "/path/to/<timestamp>-send_payment.json",
  "note": "no external API in v1 — a human executes this package manually"
}
```

A human reviews the package and executes the Stripe operation (create customer, send invoice, create payment link) manually.

**202 `{status:"pending_approval", approvalId, resumeHint}`** — a human must approve (policy: `MONEY_MOVEMENT: human`). End your turn: post a Paperclip comment with the `approvalId` and "payment action pending operator approval." When approved, Paperclip wakes you — re-call the SAME endpoint with the IDENTICAL payload plus `meta.approvalId`. Changing the payload after approval is blocked (`bait_and_switch` receipt).

**200** — action package written; post the path to Paperclip.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 → key invalid (read path). Post `BLOCKED: STRIPE_API_KEY rejected`.
- 402 → card declined (only relevant on charge attempts).
- 429 → rate-limited. Backoff per `Retry-After`.
- 400 with `param_invalid` → field validation error; surface the `message` field verbatim.

## Output Convention

After a proxy-initiated money-movement, post a Paperclip comment with the action package path, the operation type, the customer name, the amount in human-readable form (e.g. `$1,500.00 USD`), and the v1 note that a human must execute the package. Always disclose test vs. live mode in the comment.

## Given / When / Then

- **Happy path** — `STRIPE_API_KEY` set to `sk_test_...`; proxy receives the send_payment call, writes the action package, returns 200; agent posts the package path + `mode=test` disclosure to Paperclip.
- **Edge** — Customer already exists for the email; agent does a list-by-email first, reuses the existing customer ID, and notes "reused existing Stripe customer" in the Paperclip comment before calling the proxy.
- **Failure / security** — A workflow attempts to call the Stripe charge API directly bypassing the proxy: agent refuses, posts `[CONNECTOR:STRIPE_DIRECT_WRITE_BLOCKED]`, and never logs the API key. A workflow attempts to use `sk_live_...` in a CI / eval context: agent detects the `sk_live_` prefix, posts `[CONNECTOR:STRIPE_LIVE_MODE_IN_NON_PROD]`, refuses the call, and never logs the key.
