---
name: connector-onedrive
description: Verify and fetch deliverable files in OneDrive for Business and SharePoint document libraries via Microsoft Graph v1.0. Upload deliverables through the gate proxy upload_document tool (destination onedrive) with read-back verification.
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
Agents call Microsoft Graph to fetch deliverables and verify filed items.
Uploading a finished deliverable goes through the gate proxy `upload_document`
tool — the proxy holds the credential, writes the receipt, and enforces
policy. This connector targets **work or school (Microsoft 365 / Business)
tenants**; personal OneDrive is out of scope.

Endpoint and scope facts below are verified against Microsoft Graph v1.0
reference docs (accessed 2026-06-11):

- Upload small files: https://learn.microsoft.com/en-us/graph/api/driveitem-put-content?view=graph-rest-1.0 (doc updated 2026-02-06)
- Upload sessions: https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0 (doc dated 2025-10-15)

**Credentials live in the gate proxy only.** If you see
`credential_missing: MS_GRAPH_TOKEN`, the operator must export it before
launching (see the walkthrough Gate Proxy section); never ask for or handle
tokens yourself.

## Required Environment Variables

Read-back and fetch operations use the agent's bearer token. Writes go
through the proxy and need no token in the agent environment.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `MS_GRAPH_TOKEN` | Bearer token for read/verify Graph requests | — | Operator-supplied (see Authentication) |

Target drive / site / folder IDs are **not** env vars — they come from the
operator's delivery policy file (see `output-delivery-playbook`).

## Authentication

v1 uses an operator-supplied bearer token in `MS_GRAPH_TOKEN` for read and
verify operations. The operator mints it from their own tenant — for example
via Graph Explorer (https://developer.microsoft.com/graph/graph-explorer)
for short-lived testing, or an Entra ID app registration for durable use.
Required Microsoft Graph permissions, least-privileged first (per the
permissions tables in the two reference docs above, accessed 2026-06-11):

| Permission type | Read / verify (`GET …/content`) |
|---|---|
| Delegated (work/school) | `Files.Read` or `Files.ReadWrite` |
| Application | `Files.Read.All` |

The proxy holds the write credential. Tokens expire (typically ~1 hour for
delegated tokens). A `401` mid-task means the operator must refresh the token;
it is never an agent retry loop.

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

### Upload a deliverable via the gate proxy

To upload a deliverable, call the gate proxy — never the Graph upload
endpoint directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg name "$FILE_NAME" \
    --arg content "$(cat "$SRC_FILE")" \
    --arg driveId "$DRIVE_ID" \
    --arg parentItemId "$PARENT_ID" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{destination:"onedrive",name:$name,content:$content,
               driveId:$driveId,parentItemId:$parentItemId},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/upload_document"
```

For `confidential` or `privileged` matter content, set `meta.confidentiality`
accordingly — the proxy enforces policy per `gate-policy.yaml`.

**202 `{status:"pending_approval", approvalId, resumeHint}`** — the upload is
waiting for a human to approve in the dashboard. End your turn: post a
Paperclip comment with the `approvalId`. When a human approves, Paperclip
wakes you — re-call the SAME endpoint with the IDENTICAL payload plus
`meta.approvalId`. Changing the payload after approval is blocked
(`bait_and_switch` receipt).

**200** — uploaded; receipt written; response includes `id` and `webUrl`.

**403** — blocked by policy (reason in body); post the reason as a comment
and mark blocked.

**502 `credential_missing: MS_GRAPH_TOKEN`** — the proxy lacks the
credential; the operator must set `MS_GRAPH_TOKEN` in the launcher
environment (never agent env).

The proxy handles both small-file and large-file transfers internally; the
agent does not manage upload sessions directly.

### Read-back verification

After a successful proxy upload, verify by fetching the item:

```
GET /drives/{drive-id}/items/{item-id}
```

Confirm the size matches the local file before reporting success. Use the
returned `webUrl` as the link in the completion comment.

Failure modes:
- `401` → token missing/expired (read path). Post `BLOCKED: MS_GRAPH_TOKEN rejected`
  (owner: operator; action: refresh the token). Never echo the token.
- `403` → token lacks the read scope for the target drive/site. Post the
  scope table above in the blocked comment.
- `404` → wrong drive/site/parent ID; re-check the policy file's destination.
- `409 nameAlreadyExists` → the proxy uses `@microsoft.graph.conflictBehavior: rename`
  for uploads; if a rename occurred, note it in the completion comment.
- `429` / `5xx` → back off per `Retry-After`.

## Output Convention

After a verified upload, post a Paperclip comment with the deliverable
title, the Graph `webUrl`, the destination name from the policy file, and
the retained local path under the deliverables tree. The local copy is
always the source of truth (`output-delivery-playbook`).

## Given / When / Then

- **Happy path** — Policy resolves a OneDrive destination; proxy upload returns
  200 with `id` + `webUrl`; read-back GET confirms the size; agent posts the
  `webUrl` + local path in the completion comment.
- **Edge** — Deliverable exceeds 10 MiB; the proxy handles the upload session
  internally; the agent receives the same 200 response and proceeds with
  read-back verification.
- **Failure / security** — `credential_missing: MS_GRAPH_TOKEN` from the proxy:
  agent posts `BLOCKED: MS_GRAPH_TOKEN missing/expired` with the unblock owner
  and action, makes no partial upload, and no token bytes appear in comments,
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
