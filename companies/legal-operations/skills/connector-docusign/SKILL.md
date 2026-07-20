---
name: connector-docusign
description: Request e-signatures and track envelopes via the gate proxy sign_document tool (action package v1). Tracking and completed-PDF download stay direct to DocuSign API.
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

DocuSign is the industry-standard e-signature service. Agents use it to request signatures on executable contracts (NDAs, MSAs, engagement letters), poll envelope status, and download signed PDFs. Sending a signature request goes through the gate proxy `sign_document` tool — the proxy writes an action package a human executes (no live DocuSign API in v1). Status polling and PDF download go directly to the DocuSign API.

Sandbox lives at `demo.docusign.net`; production is region-specific (e.g. `na4.docusign.net`).

**Credentials live in the gate proxy only.** If you see `credential_missing` from the proxy, the operator must export the credential before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Envelope-status and PDF-download operations use the agent's credentials. Signature requests go through the proxy.

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

### Request a signature via the gate proxy

To request a signature, call the gate proxy — never the DocuSign envelope API directly:

```sh
curl -sS -X POST \
  -H "Authorization: Bearer ${PAPERCLIP_API_KEY}" \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg docPath "$DOC_PATH" \
    --arg recipient "$RECIPIENT_EMAIL" \
    --arg subject "$EMAIL_SUBJECT" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{documentPath:$docPath,recipient:$recipient,subject:$subject},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[$recipient]}}')" \
  "${GATE_PROXY_URL}/egress/sign_document"
```

**v1 action-package contract:** The proxy does not call the live DocuSign API. It writes a local action package (JSON file) under `~/.possiblaw/action-packages/` with the tool, payload, agentId, and issueId. A human reviews the package and executes the DocuSign envelope request manually.

**202 `{status:"pending_approval", approvalId, resumeHint}`** — a human must approve in the dashboard (policy: `SIGNATURE: human`). End your turn: post a Paperclip comment with the `approvalId` and "signature request pending operator approval." When a human approves, Paperclip wakes you — re-call the SAME endpoint with the IDENTICAL payload plus `meta.approvalId`. Changing the payload after approval is blocked (`bait_and_switch` receipt).

**200 `{actionPackage: "<path>", note: "no external API in v1 — a human executes this package manually"}`** — the action package was written; post the path and note to Paperclip.

**403** — blocked by policy; post reason as a comment.

### Get envelope status (direct)

`Method: GET https://${DOCUSIGN_BASE_PATH}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/<envelopeId>`

Returns `{envelopeId, status, statusChangedDateTime, sentDateTime, completedDateTime, ...}`.

### Download signed PDF (direct)

`Method: GET https://${DOCUSIGN_BASE_PATH}/v2.1/accounts/${DOCUSIGN_ACCOUNT_ID}/envelopes/<envelopeId>/documents/combined`

Stream the response body to a file in the matter deliverables directory.

Failure modes:
- 401 → bearer expired (15-min lifetime) or consent revoked. Mint a new token; if still 401, post `BLOCKED: DOCUSIGN_AUTH_REJECTED` and link the admin consent URL.
- 429 → rate-limited per DocuSign hourly limits. Backoff and retry per the `X-RateLimit-Reset` header.
- 5xx → upstream issue. Post status + body to Paperclip.

## Output Convention

On signature request: post a Paperclip comment with the action package path, recipient list, subject, and the v1 note that a human must execute the package. On completion: save the executed PDF to the matter deliverables directory via `output-local-docx` (or a raw write) and post a comment linking the final file path.

## Given / When / Then

- **Happy path** — Proxy receives the sign_document call, writes the action package, returns 200; agent posts the package path to Paperclip and notes "v1: human executes the package to send the DocuSign envelope."
- **Edge** — Envelope sits at `sent` for >7 days; agent posts a reminder comment and notifies operator via the `notify-slack` skill rather than re-sending.
- **Failure / security** — `DOCUSIGN_PRIVATE_KEY_PATH` points at a missing or world-readable file: agent posts `[CONNECTOR:DOCUSIGN_KEY_INVALID]`, refuses to mint a token, and never echoes the private-key path's contents to logs.
