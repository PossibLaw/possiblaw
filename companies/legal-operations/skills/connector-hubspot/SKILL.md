---
name: connector-hubspot
description: Read contacts, companies, and deals in HubSpot CRM via the v3 REST API. External write operations (create/update) are routed through the gate proxy share_external tool — v1 gate refuses this with not_implemented, so writes are visibly blocked rather than silently credentialed.
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

HubSpot is the CRM PossibLaw uses for marketing-intake leads, prospective-client tracking, and deal-pipeline reporting. Agents call HubSpot directly for read-only operations (searching contacts, fetching records). External write operations — creating or updating contacts, companies, and deals — are routed through the gate proxy `share_external` tool. **In v1 the gate returns `502 not_implemented` for `share_external`**, so these writes are visibly blocked rather than silently credentialed. This is an honest posture: HubSpot write paths are future gate work.

**Credentials live in the gate proxy only.** If you see `credential_missing: HUBSPOT_ACCESS_TOKEN`, the operator must export it before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Read-only operations use the agent's access token. Writes go through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `HUBSPOT_ACCESS_TOKEN` | Private-app access token for agent-side read operations; must be granted read-only scopes — a token with write scopes on the agent side would bypass the gate (writes are visibly blocked via the proxy's `not_implemented` posture, but a write-scoped token could be misused if the gate is misconfigured) | — | HubSpot UI → Settings → Integrations → Private Apps → Create a private app |

The private-app token must be scoped at creation time. Minimum scopes for legal-ops read operations: `crm.objects.contacts.read`, `crm.objects.companies.read`, `crm.objects.deals.read`. Do not add write scopes to the agent-side token.

## When to Invoke

- A new lead arrives via website or referral and needs to become a HubSpot contact (write via proxy — v1 blocked).
- A matter-intake agent confirms an engagement and needs to advance the corresponding deal to `Closed Won` (write via proxy — v1 blocked).
- A marketing agent needs to enrich a contact with case-type / source-channel properties (write via proxy — v1 blocked).
- A reporting agent needs to search or list existing contacts and deals (read directly).

Do not invoke for storing privileged matter content (use the doc-store connectors instead) or for finance data (use Stripe / QuickBooks connectors).

## Authentication

Bearer-token auth: include `Authorization: Bearer $HUBSPOT_ACCESS_TOKEN` on every **read** request. Tokens do not expire by default but can be rotated in the Private Apps UI. Official docs: https://developers.hubspot.com/docs/api/private-apps

## Operation Patterns

### Search contacts by email (read-only — direct)

`Method: POST https://api.hubapi.com/crm/v3/objects/contacts/search`

Body: `{"filterGroups":[{"filters":[{"propertyName":"email","operator":"EQ","value":"jane@example.com"}]}]}`

```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${HUBSPOT_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data '{"filterGroups":[{"filters":[{"propertyName":"email","operator":"EQ","value":"jane@example.com"}]}]}' \
  "https://api.hubapi.com/crm/v3/objects/contacts/search" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(r['id'], r['properties'].get('email')) for r in d.get('results',[])]"
```

### Write operations (contact create, deal create, contact update) via the gate proxy

External writes go through the proxy — never the HubSpot API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg op "$OPERATION" \
    --arg target "hubspot" \
    --argjson payload "$WRITE_PAYLOAD" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{target:$target,operation:$op,data:$payload},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/share_external"
```

**v1 response: `502 not_implemented`** — the gate refuses `share_external` with `not_implemented: share_external needs an operator-configured destination (v1)`. Post this as a Paperclip comment and mark the write blocked. The operator must record the write decision and execute it manually or wait for gate v2 HubSpot support.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 → token invalid or revoked (read path). Post `BLOCKED: HUBSPOT_ACCESS_TOKEN rejected` and link the Private Apps settings page.
- 403 → scope missing (read path). Post `BLOCKED: HUBSPOT_SCOPE_MISSING <scope>` listing the required scope.
- 429 → rate-limited (HubSpot returns daily + per-10s limits). Backoff per `X-HubSpot-RateLimit-*` headers.

## Output Convention

For read operations, post a Paperclip comment with the HubSpot object ID and the canonical URL (`https://app.hubspot.com/contacts/<portalId>/contact/<id>`). For attempted writes that return `not_implemented`, post `[CONNECTOR:HUBSPOT_WRITE_NOT_IMPLEMENTED_V1]` with the operation and a note that the operator must execute the write manually or wait for gate v2 support.

## Given / When / Then

- **Happy path** — Token set with correct scopes, contact search returns results; agent posts the HubSpot record ID and URL to Paperclip.
- **Edge** — Contact already exists (`409 CONFLICT` on email uniqueness for a direct API call): agent falls back to a search + note that the write must go through the proxy.
- **Failure / security** — Write attempt returns `502 not_implemented` from the proxy: agent posts `[CONNECTOR:HUBSPOT_WRITE_NOT_IMPLEMENTED_V1]`, does not retry the direct HubSpot API, and never logs token contents or echoes `$HUBSPOT_ACCESS_TOKEN`.
