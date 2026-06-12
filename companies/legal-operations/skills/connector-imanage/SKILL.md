---
name: connector-imanage
description: Search and fetch documents in the iManage Work cloud DMS via the iManage Work API v2. Upload (check-in) operations go through the gate proxy share_external tool — v1 gate refuses this with not_implemented, so uploads are visibly blocked rather than silently credentialed.
metadata:
  sources:
    - path: layer/connectors/imanage.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# iManage Connector

## What This Is

iManage Work is the enterprise document-management system most large law firms run for matter files. Agents call iManage directly to list folders inside a matter workspace and fetch a specific document version. Uploading (checking in) a new draft goes through the gate proxy `share_external` tool. **In v1 the gate returns `502 not_implemented` for `share_external`**, so uploads are visibly blocked rather than silently credentialed. This is an honest posture: iManage write paths are future gate work.

For solo / small-firm operators without an iManage subscription, the `connector-local-fs-doc-store` skill is the stand-in.

**Credentials live in the gate proxy only.** If you see `credential_missing: IMANAGE_TOKEN`, the operator must export it before launching (see the walkthrough Gate Proxy section); never ask for or handle tokens yourself.

## Required Environment Variables

Read and fetch operations use the agent's bearer token. Uploads go through the proxy.

| Env | Purpose | Default | Source |
|---|---|---|---|
| `IMANAGE_HOST` | Tenant base URL, e.g. `https://yourfirm.cloudimanage.com` | — | Firm IT or iManage admin |
| `IMANAGE_LIBRARY` | Library name (also called database) — typically `ACTIVE` | — | Firm IT |
| `IMANAGE_TOKEN` | Bearer access token (OAuth 2.0 client-credentials or auth-code flow, read path) | — | iManage Admin → API Settings; token-refresh flow per https://developer.imanage.com |

OAuth 2.0 is the supported auth path. For long-running agents, persist the refresh token in a secret store and exchange it for fresh access tokens (typically 1-hour lifetime).

## When to Invoke (read — direct)

- A matter agent needs the latest version of a contract from the firm DMS rather than a local copy.
- An audit/conflicts agent needs to list documents in a workspace to confirm prior representation.

## When to Invoke (write — via proxy, v1 blocked)

- A drafting agent has produced a deliverable and must check it into the matter workspace so the partner sees it in iManage.

Do not invoke iManage for personal/working drafts (use the local doc store), for opposing-counsel-shared documents that have not been ingested yet, or for any document outside the operator's permission scope.

## Authentication

OAuth 2.0 Bearer (read path). Include `Authorization: Bearer $IMANAGE_TOKEN` and `X-Auth-Token: $IMANAGE_TOKEN` on every request (iManage requires both on some endpoints). Token exchange endpoint: `${IMANAGE_HOST}/auth/oauth2/token`. Official docs: https://developer.imanage.com/

## Operation Patterns

### List documents in a workspace (read — direct)

`Method: GET ${IMANAGE_HOST}/work/api/v2/customers/<customerId>/libraries/${IMANAGE_LIBRARY}/workspaces/<workspaceId>/documents`

Headers:
- `Authorization: Bearer $IMANAGE_TOKEN`
- `Accept: application/json`

Example:
```sh
curl -sS \
  -H "Authorization: Bearer ${IMANAGE_TOKEN}" \
  -H "X-Auth-Token: ${IMANAGE_TOKEN}" \
  "${IMANAGE_HOST}/work/api/v2/customers/${IMANAGE_CUSTOMER_ID}/libraries/${IMANAGE_LIBRARY}/workspaces/${WORKSPACE_ID}/documents" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(x['id'],x['name'],x.get('version')) for x in d.get('data',[])]"
```

### Fetch a document's latest version (read — direct)

`Method: GET ${IMANAGE_HOST}/work/api/v2/customers/<customerId>/libraries/${IMANAGE_LIBRARY}/documents/<documentId>/download`

Stream to a local file. The response is the raw binary; preserve the original extension from the `Content-Disposition` header.

### Upload (check in) a document via the gate proxy

Upload operations go through the proxy — never the iManage upload API directly:

```sh
curl -sS -X POST \
  -H "Content-Type: application/json" \
  --data "$(jq -n \
    --arg op "checkin_document" \
    --arg target "imanage" \
    --argjson payload "$UPLOAD_PAYLOAD" \
    --arg agent "$PAPERCLIP_AGENT_ID" \
    --arg issue "$ISSUE_ID" \
    '{payload:{target:$target,operation:$op,data:$payload},
      meta:{agentId:$agent,issueId:$issue,confidentiality:"standard",entities:[]}}')" \
  "${GATE_PROXY_URL}/egress/share_external"
```

**v1 response: `502 not_implemented`** — the gate refuses `share_external` with `not_implemented: share_external needs an operator-configured destination (v1)`. Post this as a Paperclip comment and mark the upload blocked. The operator must check the document into iManage manually or wait for gate v2 iManage support.

**403** — blocked by policy; post reason as a comment.

Failure modes:
- 401 → token expired (read path). Refresh via the OAuth refresh token; if refresh fails, post `BLOCKED: IMANAGE_AUTH_EXPIRED` and ask operator to re-authorize.
- 403 → permission scope missing for the workspace; post `BLOCKED: IMANAGE_PERMISSION_DENIED <workspaceId>` and ask operator to grant access.
- 404 → wrong customer/library/workspace ID; verify configuration.
- 5xx → tenant outage; post comment and back off.

## Output Convention

After a successful download, save into the matter deliverables tree (via the storage convention from `output-storage-config`) and reference both the local path and the iManage URL (`${IMANAGE_HOST}/work/web/r/<documentId>`) in the comment. For upload attempts that return `not_implemented`, post `[CONNECTOR:IMANAGE_WRITE_NOT_IMPLEMENTED_V1]` with the intended workspace name and document name.

## Given / When / Then

- **Happy path** — Token valid and operator has workspace access; document list returns; agent posts the document IDs and versions to Paperclip.
- **Edge** — Token expired mid-task (read path); agent refreshes silently using the stored refresh token and resumes the call without operator intervention.
- **Failure / security** — Upload attempt returns `502 not_implemented` from the proxy: agent posts `[CONNECTOR:IMANAGE_WRITE_NOT_IMPLEMENTED_V1]`, does not retry the direct iManage upload API, and never logs token bytes or workspace metadata that could leak client identity.
