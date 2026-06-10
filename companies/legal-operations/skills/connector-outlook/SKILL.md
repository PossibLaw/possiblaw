---
name: connector-outlook
description: Read matter-related email and prepare reply drafts in Microsoft Outlook via the Microsoft Graph mail API. Read + draft creation only — sending stays operator-gated and is never performed by this connector.
metadata:
  sources:
    - path: companies/legal-operations/skills/connector-outlook/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Outlook Connector

## What This Is

Outlook / Exchange Online (Microsoft 365) is the firm mailbox for operators on the Microsoft stack. Agents call Microsoft Graph to find matter-related messages, pull a message for the matter file, and stage reply drafts in the Drafts folder for the operator to review. All mail operations go through `https://graph.microsoft.com/v1.0`.

This connector is **read + draft only**. Graph exposes sending as separate operations (`message: send`, `user: sendMail` — referenced from the create-message doc below); the agent must never call them and never request the `Mail.Send` permission. The operator reviews the staged draft in Outlook and presses send themselves.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `OUTLOOK_TENANT_ID` | Entra (Azure AD) tenant for the auth endpoints | `common` | Microsoft Entra admin center → Overview; use the tenant ID for single-tenant apps |
| `OUTLOOK_CLIENT_ID` | App registration (client) ID | — | Entra admin center → App registrations |
| `OUTLOOK_CLIENT_SECRET` | Client secret for the confidential app | — | App registration → Certificates & secrets; keep in the operator's secret store |
| `OUTLOOK_ACCESS_TOKEN` | OAuth 2.0 bearer token (~1-hour lifetime) | — | Authorization-code flow per Microsoft identity platform docs |
| `OUTLOOK_REFRESH_TOKEN` | OAuth 2.0 refresh token | — | Issued when the `offline_access` scope was requested |

Least-privilege delegated permissions (verified at https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0 and https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0, accessed 2026-06-09): `Mail.ReadBasic` is least-privileged for listing; reading bodies needs `Mail.Read`; creating drafts requires `Mail.ReadWrite`. Request `Mail.ReadWrite` + `offline_access` and nothing more. Never request `Mail.Send`.

## When to Invoke

- A matter agent needs to triage the firm mailbox for messages related to an active matter.
- An agent must pull a specific message into the matter file for the record.
- A drafting agent has an operator-approved response ready and needs to stage it as an Outlook draft for the operator to send.

Do not invoke to send email — sending is operator-gated, always. Do not bulk-export a mailbox. Email on confidential or privileged matters must pass through `privacy-encoder` before any cloud-lane summarization.

## Authentication

Microsoft identity platform OAuth 2.0 authorization-code flow: authorize at `https://login.microsoftonline.com/${OUTLOOK_TENANT_ID}/oauth2/v2.0/authorize`, exchange and refresh at `https://login.microsoftonline.com/${OUTLOOK_TENANT_ID}/oauth2/v2.0/token`. Request the `offline_access` scope to receive a refresh token; when a refresh response returns a new refresh token, **replace the stored one** ("discard the old refresh token"). Include `Authorization: Bearer $OUTLOOK_ACCESS_TOKEN` on every request. Official docs: https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow (accessed 2026-06-09).

## Operation Patterns

### List / search messages

`Method: GET https://graph.microsoft.com/v1.0/me/messages?$select=sender,subject&$top=25`

Verified at https://learn.microsoft.com/en-us/graph/api/user-list-messages?view=graph-rest-1.0 (accessed 2026-06-09). `$top` accepts 1–1000 (default page size 10); page via the returned `@odata.nextLink` URL as-is. Folder-scoped listing: `GET https://graph.microsoft.com/v1.0/me/mailFolders/<id>/messages` (same doc).

Example:
```sh
curl -sS \
  -H "Authorization: Bearer ${OUTLOOK_ACCESS_TOKEN}" \
  "https://graph.microsoft.com/v1.0/me/messages?\$select=sender,subject&\$top=25" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(m['id'][:24], m.get('subject')) for m in d.get('value',[])]"
```

### Fetch a single message

`Method: GET https://graph.microsoft.com/v1.0/me/messages/<id>` — UNCONFIRMED — verify the get-message path against https://learn.microsoft.com/en-us/graph/api/message-get before first use; only the list endpoints above were verified directly.

### Create a draft (never send)

`Method: POST https://graph.microsoft.com/v1.0/me/messages`

Verified at https://learn.microsoft.com/en-us/graph/api/user-post-messages?view=graph-rest-1.0 (accessed 2026-06-09): saves the draft in the Drafts folder, returns `201 Created` with `isDraft: true`, and requires the `Mail.ReadWrite` delegated permission. Body is a JSON `message` (or base64 MIME with `Content-Type: text/plain`):

```json
{
  "subject": "Re: NDA draft",
  "body": { "contentType": "HTML", "content": "Please find our comments attached." },
  "toRecipients": [ { "emailAddress": { "address": "client@example.com" } } ]
}
```

Failure modes:
- 401 → access token expired (~1-hour lifetime). Refresh at the v2.0 token endpoint; if refresh fails, post `BLOCKED: OUTLOOK_AUTH_EXPIRED` and ask operator to re-consent.
- 403 → delegated permission missing or admin consent not granted; post `BLOCKED: OUTLOOK_SCOPE_MISSING <permission>`.
- 429 → Graph throttling; back off per `Retry-After`.
- 504 → page too large (documented for large `$top` with full payloads); reduce `$top` and use `$select`.
- 5xx → upstream issue; surface status + body in a Paperclip comment.

## Output Convention

After creating a draft, post a Paperclip comment with the message `id`, the `webLink` from the create response, recipient, and subject, plus the explicit line "DRAFT ONLY — operator must review and send from Outlook." For searches, summarize count and the first 10 subjects; never paste full privileged email bodies into Paperclip comments — reference message IDs and store content via the doc-store connectors.

## Given / When / Then

- **Happy path** — Token valid with `Mail.ReadWrite`; draft POST returns `201` with `isDraft: true`; agent posts the message ID, `webLink`, and the operator-must-send notice to Paperclip.
- **Edge** — `@odata.nextLink` paging required to reach older matter mail; agent follows the returned URL verbatim (no hand-built `$skip`) and stops after the messages it needs.
- **Failure / security** — A workflow instructs the agent to send the staged draft: agent refuses, posts `[CONNECTOR:OUTLOOK_SEND_BLOCKED]` explaining sending is operator-gated, never calls `sendMail` or `message: send`, never requests `Mail.Send`, and never logs token bytes or message content.
