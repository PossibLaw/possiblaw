---
name: connector-hubspot
description: Read and write contacts, companies, and deals in HubSpot CRM via the v3 REST API using a private-app access token.
metadata:
  sources:
    - path: layer/connectors/hubspot.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# HubSpot Connector

## What This Is

HubSpot is the CRM PossibLaw uses for marketing-intake leads, prospective-client tracking, and deal-pipeline reporting. Agents call HubSpot to create or update contacts when a new lead lands, attach notes/activities to existing records, and move deals through the pipeline.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `HUBSPOT_ACCESS_TOKEN` | Private-app access token, sent as `Authorization: Bearer <token>` | — | HubSpot UI → Settings → Integrations → Private Apps → Create a private app |

The private-app token must be scoped at creation time. Minimum recommended scopes for legal-ops agents: `crm.objects.contacts.read/write`, `crm.objects.companies.read/write`, `crm.objects.deals.read/write`.

## When to Invoke

- A new lead arrives via website or referral and needs to become a HubSpot contact.
- A matter-intake agent confirms an engagement and needs to advance the corresponding deal to `Closed Won`.
- A marketing agent needs to enrich a contact with case-type / source-channel properties before campaign tagging.

Do not invoke for storing privileged matter content (use the doc-store connectors instead) or for finance data (use Stripe / QuickBooks connectors).

## Authentication

Bearer-token auth: include `Authorization: Bearer $HUBSPOT_ACCESS_TOKEN` on every request. Tokens do not expire by default but can be rotated in the Private Apps UI. Official docs: https://developers.hubspot.com/docs/api/private-apps

## Operation Patterns

### Create a contact

`Method: POST https://api.hubapi.com/crm/v3/objects/contacts`

Headers:
- `Authorization: Bearer $HUBSPOT_ACCESS_TOKEN`
- `Content-Type: application/json`

Body:
```json
{ "properties": { "email": "jane@example.com", "firstname": "Jane", "lastname": "Doe", "lifecyclestage": "lead" } }
```

Example:
```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${HUBSPOT_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"properties":{"email":"jane@example.com","firstname":"Jane","lastname":"Doe"}}' \
  "https://api.hubapi.com/crm/v3/objects/contacts" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('contactId=', d['id'])"
```

### Search contacts by email

`Method: POST https://api.hubapi.com/crm/v3/objects/contacts/search`

Body: `{"filterGroups":[{"filters":[{"propertyName":"email","operator":"EQ","value":"jane@example.com"}]}]}`

### Create a deal and associate to contact

`Method: POST https://api.hubapi.com/crm/v3/objects/deals` with body `{"properties":{"dealname":"NDA review — Acme","pipeline":"default","dealstage":"qualifiedtobuy","amount":"2500"},"associations":[{"to":{"id":"<contactId>"},"types":[{"associationCategory":"HUBSPOT_DEFINED","associationTypeId":3}]}]}`

Failure modes:
- 401 → token invalid or revoked. Post `BLOCKED: HUBSPOT_ACCESS_TOKEN rejected` and link the Private Apps settings page.
- 403 → scope missing. Post `BLOCKED: HUBSPOT_SCOPE_MISSING <scope>` listing the required scope.
- 429 → rate-limited (HubSpot returns daily + per-10s limits). Backoff per `X-HubSpot-RateLimit-*` headers.

## Output Convention

After a successful write, post a Paperclip comment with the HubSpot object ID and the canonical URL (`https://app.hubspot.com/contacts/<portalId>/contact/<id>`). For bulk reports, write the JSON to the deliverables directory via `output-local-markdown` and link from a single Paperclip comment.

## Given / When / Then

- **Happy path** — Token set with correct scopes, contact create returns `201` with an `id`; agent posts the HubSpot URL to Paperclip.
- **Edge** — contact already exists (`409 CONFLICT` on email uniqueness); agent falls back to a search + PATCH update rather than failing the task.
- **Failure / security** — Token unset: agent posts `[CONNECTOR:HUBSPOT_UNCONFIGURED]`, makes no HTTP call, and never logs token contents or echoes `$HUBSPOT_ACCESS_TOKEN`.
