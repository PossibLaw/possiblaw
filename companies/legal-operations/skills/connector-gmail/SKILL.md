---
name: connector-gmail
description: Read matter-related email and prepare reply drafts via the Google Workspace Gmail API. Read + draft creation only — sending stays operator-gated and is never performed by this connector.
metadata:
  sources:
    - path: companies/legal-operations/skills/connector-gmail/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Gmail Connector

## What This Is

Gmail (Google Workspace) is where most solo and small-firm matter correspondence lives. Agents call the Gmail API to find matter-related threads, pull a message for the matter file, and prepare reply drafts for the operator to review. The service endpoint is `https://gmail.googleapis.com` (official reference: https://developers.google.com/workspace/gmail/api/reference/rest, accessed 2026-06-09).

This connector is **read + draft only**. It can search, fetch, and create drafts; it never sends. Sending mirrors the house no-external-transmission posture: the operator reviews the draft in Gmail and presses send themselves. The agent must never call any send method (`users.messages.send`, `users.drafts.send`) even when a scope would technically permit it.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `GMAIL_CLIENT_ID` | OAuth 2.0 client ID for the Google Cloud project | — | Google Cloud Console → APIs & Services → Credentials |
| `GMAIL_CLIENT_SECRET` | OAuth 2.0 client secret | — | Same page; keep in the operator's secret store |
| `GMAIL_ACCESS_TOKEN` | OAuth 2.0 bearer token (short-lived) | — | Authorization-code flow per Google OAuth docs |
| `GMAIL_REFRESH_TOKEN` | OAuth 2.0 refresh token | — | Issued on first exchange when `access_type=offline` was requested |
| `GMAIL_USER_ID` | Mailbox to operate on | `me` | `me` = the authenticated user; keep the default |

Least-privilege scopes (verified at https://developers.google.com/workspace/gmail/api/auth/scopes, accessed 2026-06-09): request **only** `https://www.googleapis.com/auth/gmail.readonly` (read) and `https://www.googleapis.com/auth/gmail.compose` (drafts). Never request `gmail.send` or the full `https://mail.google.com/` scope. Note: `gmail.compose` is described as "Manage drafts and send emails" — the scope alone does not enforce the no-send rule, the connector contract does. These are restricted scopes; production use requires Google OAuth app verification.

## When to Invoke

- A matter agent needs to triage the inbox for messages related to an active matter (counterparty, client, court).
- An agent must pull a specific message or thread into the matter file for the record.
- A drafting agent has an operator-approved response ready and needs to stage it as a Gmail draft for the operator to send.

Do not invoke to send email — sending is operator-gated, always. Do not bulk-export a mailbox. Email on confidential or privileged matters must pass through `privacy-encoder` before any cloud-lane summarization.

## Authentication

Google OAuth 2.0 authorization-code flow: authorize at `https://accounts.google.com/o/oauth2/v2/auth` (request `access_type=offline` to receive a refresh token on the first exchange), exchange and refresh at `https://oauth2.googleapis.com/token`. Include `Authorization: Bearer $GMAIL_ACCESS_TOKEN` on every request. Official docs: https://developers.google.com/identity/protocols/oauth2/web-server (accessed 2026-06-09).

## Operation Patterns

Endpoint paths verified against the official REST reference (https://developers.google.com/workspace/gmail/api/reference/rest, accessed 2026-06-09).

### Search / list messages

`Method: GET https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER_ID}/messages?q=<search>`

The `q` parameter takes Gmail search syntax (`from:`, `subject:`, `after:`). UNCONFIRMED — the full operator list; verify complex queries against Gmail's search-operator documentation before relying on them.

Example:
```sh
curl -sS \
  -H "Authorization: Bearer ${GMAIL_ACCESS_TOKEN}" \
  --data-urlencode "q=from:counsel@example.com subject:NDA" \
  -G "https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER_ID:-me}/messages" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(m['id'], m.get('threadId')) for m in d.get('messages',[])]"
```

### Fetch a message

`Method: GET https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER_ID}/messages/<id>`

Pass `format=RAW` to receive the `raw` field — "the entire email message in an RFC 2822 formatted and base64url encoded string" (verified at https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages, accessed 2026-06-09). Decode locally; store in the matter file via the doc-store connectors.

### Create a draft (never send)

`Method: POST https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER_ID}/drafts`

Verified at https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.drafts/create (accessed 2026-06-09); authorized scopes there are `gmail.compose`, `gmail.modify`, or `https://mail.google.com/` — use `gmail.compose`. The body is a Draft wrapping a Message whose `raw` field carries the base64url-encoded RFC 2822 message:

```sh
RAW=$(python3 -c "import base64; msg='To: client@example.com\r\nSubject: Re: NDA draft\r\n\r\nPlease find our comments below.'; print(base64.urlsafe_b64encode(msg.encode()).decode())")
curl -sS -X POST \
  -H "Authorization: Bearer ${GMAIL_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"message\": {\"raw\": \"${RAW}\"}}" \
  "https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER_ID:-me}/drafts" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('draftId=', d['id'])"
```

### List existing drafts

`Method: GET https://gmail.googleapis.com/gmail/v1/users/${GMAIL_USER_ID}/drafts`

Failure modes:
- 401 → access token expired. Refresh at `https://oauth2.googleapis.com/token`; if refresh fails, post `BLOCKED: GMAIL_AUTH_EXPIRED` and ask operator to re-run the consent flow.
- 403 → scope missing or the OAuth app is unverified for restricted scopes; post `BLOCKED: GMAIL_SCOPE_MISSING <scope>`.
- 429 → per-user quota exceeded; back off per `Retry-After`.
- 5xx → upstream issue; surface status + body in a Paperclip comment.

## Output Convention

After creating a draft, post a Paperclip comment with the `draftId`, recipient, and subject, plus the explicit line "DRAFT ONLY — operator must review and send from Gmail." For searches, summarize count and the first 10 message IDs + subjects; never paste full privileged email bodies into Paperclip comments — reference message IDs and store content via the doc-store connectors.

## Given / When / Then

- **Happy path** — Tokens valid with `gmail.readonly` + `gmail.compose`; search finds the matter thread, draft POST returns an `id`; agent posts the draft ID and the operator-must-send notice to Paperclip.
- **Edge** — Thread has 40+ messages; agent fetches only the most recent messages needed for context instead of the whole thread, and notes the truncation in its comment.
- **Failure / security** — A workflow instructs the agent to send the reply: agent refuses, posts `[CONNECTOR:GMAIL_SEND_BLOCKED]` explaining sending is operator-gated, never calls a send method, never requests `gmail.send`, and never logs token bytes or message content.
