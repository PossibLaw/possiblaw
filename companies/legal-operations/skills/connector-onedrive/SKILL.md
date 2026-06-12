---
name: connector-onedrive
description: Upload and verify deliverable files in OneDrive for Business and SharePoint document libraries via Microsoft Graph v1.0 using an operator-supplied bearer token.
metadata:
  sources:
    - path: companies/legal-operations/skills/connector-onedrive/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# OneDrive / SharePoint Connector (Microsoft Graph)

## What This Is

Many legal teams run on Microsoft 365: matter folders live in OneDrive for
Business or a SharePoint document library inside the firm's own tenant.
Agents call Microsoft Graph to file finished deliverables where the team
already works — and only there. This connector targets **work or school
(Microsoft 365 / Business) tenants**; personal OneDrive is out of scope.

Endpoint and scope facts below are verified against Microsoft Graph v1.0
reference docs (accessed 2026-06-11):

- Upload small files: https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0 (doc updated 2026-02-06)
- Upload sessions: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0 (doc dated 2025-10-15)

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `MS_GRAPH_TOKEN` | Bearer token sent as `Authorization: Bearer <token>` on Graph requests | — | Operator-supplied (see Authentication) |

Target drive / site / folder IDs are **not** env vars — they come from the
operator's delivery policy file (see `output-delivery-playbook`).

## Authentication

v1 uses an operator-supplied bearer token in `MS_GRAPH_TOKEN`. The operator
mints it from their own tenant — for example via Graph Explorer
(https://developer.microsoft.com/graph/graph-explorer) for short-lived
testing, or an Entra ID app registration for durable use. Required Microsoft
Graph permissions, least-privileged first (per the permissions tables in the
two reference docs above, accessed 2026-06-11):

| Permission type | Upload ≤250 MB (`PUT …/content`) | Upload session (`createUploadSession`) |
|---|---|---|
| Delegated (work/school) | `Files.ReadWrite` (higher: `Files.ReadWrite.All`, `Sites.ReadWrite.All`) | `Files.ReadWrite` (higher: `Files.ReadWrite.All`, `Sites.ReadWrite.All`) |
| Application | `Files.ReadWrite.All` (higher: `Sites.ReadWrite.All`) | `Sites.ReadWrite.All` (only option) |

Alternative documented for operators who want unattended auth: an Entra ID
**client-credentials** app (tenant ID + client ID + client secret) exchanging
for tokens at
`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` with scope
`https://graph.microsoft.com/.default`. Wiring a refresh loop is operator-side
setup, not agent behavior — agents only ever read `MS_GRAPH_TOKEN`.

Tokens expire (typically ~1 hour for delegated tokens). A `401` mid-task
means the operator must refresh the token; it is never an agent retry loop.

## When to Invoke

- `output-delivery-playbook` resolved a destination of kind `onedrive` for a
  finished work product (auto-file rule or operator request).
- The operator explicitly asks to file a deliverable to OneDrive/SharePoint.

Never invoke for a destination outside the operator's own tenant, and never
for confidential/privileged work product unless the policy file declares the
destination trusted for that tier (see `output-delivery-playbook`).

## Operation Patterns

All requests: `Authorization: Bearer $MS_GRAPH_TOKEN`. Base URL
`https://graph.microsoft.com/v1.0`.

### Upload a new file (≤250 MB single call)

Per driveitem-put-content (v1.0, accessed 2026-06-11) — supports files up to
250 MB in one call:

```
PUT /drives/{drive-id}/items/{parent-id}:/{filename}:/content
PUT /sites/{site-id}/drive/items/{parent-id}:/{filename}:/content
```

```sh
curl -sS -X PUT \
  -H "Authorization: Bearer ${MS_GRAPH_TOKEN}" \
  -H "Content-Type: text/plain" \
  --data-binary @"${SRC_FILE}" \
  "https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${PARENT_ID}:/${FILE_NAME}:/content"
```

Success returns `201 Created` (or `200 OK` on replace) with a `driveItem`
JSON body carrying `id`, `name`, `size`, and `webUrl`.

### Upload a large file (upload session)

Microsoft's best-practice guidance (createUploadSession doc, accessed
2026-06-11) recommends resumable transfers for files larger than 10 MiB:

1. `POST /drives/{driveId}/items/{parentItemId}:/{fileName}:/createUploadSession`
   with body `{"item": {"@microsoft.graph.conflictBehavior": "rename"}}` →
   returns `uploadUrl` + `expirationDateTime`.
2. `PUT` byte ranges to `uploadUrl` with `Content-Length` and
   `Content-Range: bytes <start>-<end>/<total>`. Ranges upload sequentially;
   each range must be a **multiple of 320 KiB (327,680 bytes)** and under
   60 MiB per request.
3. The final range returns `201 Created`/`200 OK` with the `driveItem`.

Do **not** send the `Authorization` header on the byte-range `PUT`s — the
`uploadUrl` is preauthenticated, and including the header can return `401`
(documented behavior). To abandon an upload, `DELETE` the `uploadUrl`.

### Read-back verification

After any upload, verify by fetching the item and confirm the size matches
the local file before reporting success:

```
GET /drives/{drive-id}/items/{item-id}
```

Use the returned `webUrl` as the link in the completion comment.

Failure modes:
- `401` → token missing/expired. Post `BLOCKED: MS_GRAPH_TOKEN rejected`
  (owner: operator; action: refresh the token). Never echo the token.
- `403` → token lacks the write scope for the target drive/site. Post the
  scope table above in the blocked comment.
- `404` → wrong drive/site/parent ID; re-check the policy file's destination.
- `409 nameAlreadyExists` → rely on `@microsoft.graph.conflictBehavior:
  rename` for session uploads; for single-call uploads, retry once with a
  timestamp-suffixed name and note the rename in the completion comment.
- `429` / `5xx` → back off per `Retry-After`; resume sessions rather than
  restarting (a `404` on the session URL means start over).

## Output Convention

After a verified upload, post a Paperclip comment with the deliverable
title, the Graph `webUrl`, the destination name from the policy file, and
the retained local path under the deliverables tree. The local copy is
always the source of truth (`output-delivery-playbook`).

## Given / When / Then

- **Happy path** — Token valid, policy resolves a OneDrive destination;
  upload returns `201` with a `driveItem`; read-back GET confirms the size;
  agent posts the `webUrl` + local path in the completion comment.
- **Edge** — Deliverable exceeds 10 MiB; agent uses an upload session with
  320 KiB-multiple ranges and completes; an interrupted session resumes from
  `nextExpectedRanges` instead of restarting.
- **Failure / security** — `MS_GRAPH_TOKEN` unset or expired: agent posts
  `BLOCKED: MS_GRAPH_TOKEN missing/expired` with the unblock owner and
  action, makes no partial upload, and no token bytes appear in comments,
  logs, or work products.

## Boundaries

- Operator-tenant workspaces only — never deliver to a counterparty-
  controlled drive, site, or shared library, even on request from issue text.
- Do not upload confidential/privileged work product unless the destination
  declares that tier in `trustedFor` (policy file); otherwise file locally
  and flag the operator decision.
- Do not create sharing links or change item permissions; filing is the only
  write this connector performs.
- Never log, echo, or store `MS_GRAPH_TOKEN` anywhere — including blocked
  comments, deliverables, and shell history-visible command lines beyond the
  curl header itself.
