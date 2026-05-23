---
name: connector-docusign
description: Send, track, and retrieve e-signature envelopes via the DocuSign eSignature REST API using JWT (RSA) auth.
metadata:
  sources:
    - path: layer/connectors/docusign.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# DocuSign Connector

## What This Is

DocuSign is the industry-standard e-signature service. Agents use it to send executable contracts (NDAs, MSAs, engagement letters), poll envelope status, and download signed PDFs. Sandbox lives at `demo.docusign.net`; production is region-specific (e.g. `na4.docusign.net`).

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `DOCUSIGN_INTEGRATION_KEY` | App integration (client) ID for JWT grant | — | DocuSign Admin → Apps & Keys |
| `DOCUSIGN_USER_ID` | GUID of the impersonated user (`sub` claim) | — | DocuSign Admin → Users → API Username |
| `DOCUSIGN_ACCOUNT_ID` | DocuSign account GUID | — | DocuSign Admin → Account → API Account ID |
| `DOCUSIGN_PRIVATE_KEY_PATH` | Absolute path to RSA private key PEM | — | Generated in Admin → Apps & Keys → RSA Keypairs |
| `DOCUSIGN_BASE_PATH` | REST base path | `https://demo.docusign.net/restapi` | Choose `https://<region>.docusign.net/restapi` for prod |
| `DOCUSIGN_OAUTH_HOST` | OAuth host for JWT token exchange | `account-d.docusign.com` (demo) / `account.docusign.com` (prod) | DocuSign auth docs |

## When to Invoke

- An agent has a finalized contract PDF/DOCX ready for client signature.
- An agent needs to check whether a previously sent envelope is `sent`, `delivered`, `completed`, `declined`, or `voided`.
- An agent must fetch the executed PDF for archival in the matter file.

Do not invoke for internal-only documents that do not require third-party signature; do not invoke before operator approval gate on outbound legal documents.

## Authentication

DocuSign uses **JWT Grant**: the agent signs a JWT with the RSA private key, exchanges it at `https://${DOCUSIGN_OAUTH_HOST}/oauth/token` for a short-lived access token, then calls REST endpoints with `Authorization: Bearer <token>`. The impersonated user must have granted consent once via the admin consent URL. Official docs: https://developers.docusign.com/platform/auth/jwt/

Recommended: use the DocuSign CLI or the `docusign-esign` SDK for token minting; raw JWT generation in shell is brittle. For shell-only flows the agent should call a small Node/Python helper that returns a bearer token and exits.

## Operation Patterns

### Create and send an envelope

`Method: POST https://${DOCUSIGN_BASE_PATH}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes`

Headers:
- `Authorization: Bearer $DS_ACCESS_TOKEN`
- `Content-Type: application/json`

Body sketch:
```json
{
  "emailSubject": "Please sign: Mutual NDA",
  "documents": [{"documentId":"1","name":"NDA.pdf","fileExtension":"pdf","documentBase64":"<base64>"}],
  "recipients": {"signers":[{"email":"counterparty@example.com","name":"Jane Doe","recipientId":"1","tabs":{"signHereTabs":[{"anchorString":"/sig1/","anchorYOffset":"-10"}]}}]},
  "status": "sent"
}
```

Example:
```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${DS_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data @envelope.json \
  "${DOCUSIGN_BASE_PATH}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('envelopeId=', d['envelopeId'], 'status=', d['status'])"
```

### Get envelope status

`Method: GET https://${DOCUSIGN_BASE_PATH}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/<envelopeId>`

Returns `{envelopeId, status, statusChangedDateTime, sentDateTime, completedDateTime, ...}`.

### Download signed PDF

`Method: GET https://${DOCUSIGN_BASE_PATH}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/<envelopeId>/documents/combined`

Stream the response body to a file in the matter deliverables directory.

Failure modes:
- 401 → bearer expired (15-min lifetime) or consent revoked. Mint a new token; if still 401, post `BLOCKED: DOCUSIGN_AUTH_REJECTED` and link the admin consent URL.
- 429 → rate-limited per DocuSign hourly limits. Backoff and retry per the `X-RateLimit-Reset` header.
- 5xx → upstream issue. Post status + body to Paperclip.

## Output Convention

On send: post a Paperclip comment with the `envelopeId`, recipient list, subject, and the demo or production base path. On completion: save the executed PDF to the matter deliverables directory via `output-local-docx` (or a raw write) and post a comment linking the final file path.

## Given / When / Then

- **Happy path** — JWT token mints successfully, envelope POST returns `201` with `status=sent`; agent posts the envelope ID and proceeds to polling.
- **Edge** — envelope sits at `sent` for >7 days; agent posts a reminder comment and notifies operator via the `notify-slack` skill rather than re-sending.
- **Failure / security** — `DOCUSIGN_PRIVATE_KEY_PATH` points at a missing or world-readable file: agent posts `[CONNECTOR:DOCUSIGN_KEY_INVALID]`, refuses to mint a token, and never echoes the private-key path's contents to logs.
