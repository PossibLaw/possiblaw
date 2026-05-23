---
name: connector-stripe
description: Create and manage customers, invoices, and payment links in Stripe via the Stripe REST API using a secret key.
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

Stripe is the payments processor for client invoicing, payment links, and refunds. Agents call Stripe to create or look up customers, generate invoices for billable matter activity, and produce one-off payment links. Stripe has a free test mode (`sk_test_...` keys) that the connector uses by default during demos and CI.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `STRIPE_API_KEY` | Secret API key sent as `Authorization: Bearer <key>` | — | https://dashboard.stripe.com/apikeys → use `sk_test_...` for dev, `sk_live_...` for production |
| `STRIPE_API_VERSION` | Pinned API version sent as `Stripe-Version` header | unset (uses account default) | https://stripe.com/docs/api/versioning |

Test mode is implied by the `sk_test_` prefix; live mode by `sk_live_`. The connector does **not** require a separate env flag — the key prefix is authoritative.

## When to Invoke

- A billing agent needs to invoice a client for completed matter work.
- A new client signed an engagement letter and needs to be created as a Stripe customer.
- An intake agent needs a payment link for a flat-fee consultation.
- A finance agent needs to look up a past charge or refund.

Do not invoke Stripe from a workflow that has not been approved by the operator for financial writes, and never invoke live-mode keys from a CI or eval context.

## Authentication

HTTP Basic with the secret key as the username and an empty password, or `Authorization: Bearer $STRIPE_API_KEY` (Stripe accepts both). Use Bearer for shell scripts. Official docs: https://stripe.com/docs/api/authentication

## Operation Patterns

Stripe endpoints accept `application/x-www-form-urlencoded` bodies (not JSON for writes).

### Create a customer

`Method: POST https://api.stripe.com/v1/customers`

```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${STRIPE_API_KEY}" \
  --data-urlencode "email=client@example.com" \
  --data-urlencode "name=Acme Corp" \
  --data-urlencode "metadata[matter_id]=2026-014" \
  https://api.stripe.com/v1/customers \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('customerId=', d['id'])"
```

### Create an invoice

Stripe invoices are built in two steps: first add invoice items to the customer, then create + finalize the invoice.

```sh
# Step 1: add an invoice item
curl -sS -X POST \
  -H "Authorization: Bearer ${STRIPE_API_KEY}" \
  --data-urlencode "customer=${CUSTOMER_ID}" \
  --data-urlencode "amount=150000" \
  --data-urlencode "currency=usd" \
  --data-urlencode "description=NDA review — Matter 2026-014" \
  https://api.stripe.com/v1/invoiceitems

# Step 2: create the invoice (auto-pulls outstanding items)
curl -sS -X POST \
  -H "Authorization: Bearer ${STRIPE_API_KEY}" \
  --data-urlencode "customer=${CUSTOMER_ID}" \
  --data-urlencode "collection_method=send_invoice" \
  --data-urlencode "days_until_due=14" \
  https://api.stripe.com/v1/invoices \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('invoiceId=', d['id'], 'total=', d['total'])"
```

Amounts are in the smallest currency unit (cents for USD).

### Create a payment link

`Method: POST https://api.stripe.com/v1/payment_links` with `line_items[0][price]=<priceId>` and `line_items[0][quantity]=1`. Returns `{ id, url }` — share the `url` with the client.

### List customers

`Method: GET https://api.stripe.com/v1/customers?limit=25&email=client@example.com`

Failure modes:
- 401 → key invalid. Post `BLOCKED: STRIPE_API_KEY rejected`.
- 402 → card declined (only relevant on charge attempts).
- 429 → rate-limited. Backoff per `Retry-After`.
- 400 with `param_invalid` → field validation error; surface the `message` field verbatim.

## Output Convention

After creating an invoice or payment link, post a Paperclip comment with the Stripe object ID, the customer name, the amount in human-readable form (e.g. `$1,500.00 USD`), and the canonical Stripe dashboard URL (`https://dashboard.stripe.com/<test/>invoices/<id>`). Always disclose test vs. live mode in the comment.

## Given / When / Then

- **Happy path** — `STRIPE_API_KEY` set to `sk_test_...`, customer + invoice create return `200`; agent posts the invoice URL plus a `mode=test` disclosure to Paperclip.
- **Edge** — Customer already exists for the email; agent does a list-by-email first, reuses the existing customer ID, and notes "reused existing Stripe customer" in the Paperclip comment.
- **Failure / security** — A workflow attempts to use `sk_live_...` in a CI / eval context: agent detects the `sk_live_` prefix, posts `[CONNECTOR:STRIPE_LIVE_MODE_IN_NON_PROD]`, refuses the call, and never logs the key. The key is also never echoed to the deliverables tree.
