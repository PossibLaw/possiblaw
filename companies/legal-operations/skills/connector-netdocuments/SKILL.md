---
name: connector-netdocuments
description: Search and fetch documents in the NetDocuments cloud DMS via the NetDocuments REST API v2. Upload (create) operations go through the gate proxy share_external tool — v1 gate refuses this with not_implemented, so uploads are visibly blocked rather than silently credentialed.
metadata:
  sources:
    - path: layer/connectors/netdocuments.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# NetDocuments Connector

## What This Is

NetDocuments is a cloud-native document-management system widely used by law firms. Agents call NetDocuments directly to search documents in a matter workspace (called a "cabinet") and fetch a specific document. Uploading (creating) a new draft goes through the gate proxy `share_external` tool. **In v1 the gate returns `502 not_implemented` for `share_external`**, so uploads are visibly blocked rather than silently credentialed. This is an honest posture: NetDocuments write paths are future gate work.

For solo / small-firm operators without a NetDocuments subscription, the `connector-local-fs-doc-store` skill is the stand-in.

**Write (upload) credentials will live in the gate proxy once NetDocuments is implemented gate-side — they do not yet.** The v1 proxy returns `502 not_implemented` for `share_external` unconditionally, before it would ever check for a NetDocuments credential; credential wiring arrives when the connector is implemented gate-side (see "Upload (create)" below). For the **read** path, the agent holds its own `NETDOCS_OAUTH_TOKEN`; a `401` means it expired — the operator must refresh via the refresh token or re-authorize (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Search and download operations use the agent's OAuth token. Uploads go through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `NETDOCS_HOST` | API host. Region-specific. | `https://api.netdocuments.com` | Firm IT or NetDocuments admin; EU/UK regions use different hosts |
| `NETDOCS_REPOSITORY_ID` | Repository (cabinet) ID for document operations | — | NetDocuments admin → Cabinets |
| `NETDOCS_OAUTH_TOKEN` | OAuth 2.0 access token (read path) | — | NetDocuments developer portal → register app + run auth-code flow |
| `NETDOCS_REFRESH_TOKEN` | OAuth 2.0 refresh token for renewing access tokens (read path) | — | Persisted from the original authorization-code exchange |

The OAuth client ID and secret used to obtain the tokens must be stored alongside them in the operator's secret store; the agent only needs the access token at call time for reads.

## When to Invoke (read — direct)

- A matter agent needs the canonical version of a document from the firm cabinet.
- A conflicts agent needs to list documents associated with a prior matter or party.

## When to Invoke (write — via proxy, v1 blocked)

- A drafting agent must check a new draft into the NetDocuments workspace so the partner sees it.

Do not invoke NetDocuments for personal working drafts (use the local doc store), for documents outside the operator's NetDocuments permission scope, or without checking the matter's workspace ID.

## Authentication

OAuth 2.0 Bearer (read path). Include `Authorization: Bearer $NETDOCS_OAUTH_TOKEN` on every read request. Access tokens are short-lived; refresh via `POST ${NETDOCS_HOST}/v1/OAuth/Token` with `grant_type=refresh_token`. Official docs: https://developer.netdocuments.com/

## Operation Patterns

### Search documents (read — direct)

`Method: GET ${NETDOCS_HOST}/v2/Search/<repositoryId>`

Headers:
- `Authorization: Bearer $NETDOCS_OAUTH_TOKEN`
- `Accept: application/json`

Query: `q` (search expression), `$top` (page size).

Example:
```sh
curl -sS \
  -H "Authorization: Bearer ${NETDOCS_OAUTH_TOKEN}" \
  -H "Accept: application/json" \
  "${NETDOCS_HOST}/v2/Search/${NETDOCS_REPOSITORY_ID}?q=client%3A%22Acme%22&\$top=25" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(x['id'], x.get('name')) for x in d.get('results',[])]"
```

### Get document info (read — direct)

`Method: GET ${NETDOCS_HOST}/v2/Document/<docId>/info`

Returns metadata including name, version, profile attributes, and created/modified dates.

### Download a document (read — direct)

`Method: GET ${NETDOCS_HOST}/v2/Document/<docId>`

Returns raw binary; preserve the extension from the `Content-Disposition` header.

### Upload (create) a document via the gate proxy

Upload operations go through the proxy — never the NetDocuments upload API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg op "create_document" \
    --arg target "netdocuments" \
    --argjson payload "$UPLOAD_PAYLOAD" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{target:$target,operation:$op,data:$payload},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/share_external"
```

**v1 response: `502 not_implemented`** — the gate refuses `share_external` with `not_implemented: share_external needs an operator-configured destination (v1)`. Post this as a Paperclip comment and mark the upload blocked. The operator must check the document into NetDocuments manually or wait for gate v2 NetDocuments support.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 → access token expired (read path). Refresh via the refresh token; if refresh fails, post `BLOCKED: NETDOCS_AUTH_EXPIRED` and ask operator to re-authorize.
- 403 → permission scope missing for the cabinet/workspace; post `BLOCKED: NETDOCS_PERMISSION_DENIED <repositoryId>`.
- 404 → wrong repository or document ID.
- 5xx → upstream issue; surface body in a Paperclip comment.

## Output Convention

After a successful download, save to the matter deliverables tree (per `output-storage-config`) and link the local path plus the NetDocuments URL in the comment. For upload attempts that return `not_implemented`, post `[CONNECTOR:NETDOCS_WRITE_NOT_IMPLEMENTED_V1]` with the intended repository and document name.

## Given / When / Then

- **Happy path** — Token valid and operator has cabinet access; search returns hits; agent posts top results with `docId` + name to Paperclip.
- **Edge** — Access token expired mid-task (read path); agent refreshes silently using the stored refresh token and resumes the call without operator intervention.
- **Failure / security** — Upload attempt returns `502 not_implemented` from the proxy: agent posts `[CONNECTOR:NETDOCS_WRITE_NOT_IMPLEMENTED_V1]`, does not retry the direct NetDocuments upload API, and never logs token bytes or document metadata that could leak client identity.
