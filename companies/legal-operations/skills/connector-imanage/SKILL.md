---
name: connector-imanage
description: Search, fetch, and upload documents in the iManage Work cloud document-management system via the iManage Work API v2.
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

iManage Work is the enterprise document-management system most large law firms run for matter files. Agents call iManage to list folders inside a matter workspace, fetch a specific document version, or upload a new draft. For solo / small-firm operators without an iManage subscription, the `connector-local-fs-doc-store` skill is the stand-in.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `IMANAGE_HOST` | Tenant base URL, e.g. `https://yourfirm.cloudimanage.com` | — | Firm IT or iManage admin |
| `IMANAGE_LIBRARY` | Library name (also called database) — typically `ACTIVE` | — | Firm IT |
| `IMANAGE_TOKEN` | Bearer access token (OAuth 2.0 client-credentials or auth-code flow) | — | iManage Admin → API Settings; token-refresh flow per https://developer.imanage.com |

OAuth 2.0 is the supported auth path. For long-running agents, persist the refresh token in a secret store and exchange it for fresh access tokens (typically 1-hour lifetime).

## When to Invoke

- A matter agent needs the latest version of a contract from the firm DMS rather than a local copy.
- A drafting agent has produced a deliverable and must check it into the matter workspace so the partner sees it in iManage.
- An audit/conflicts agent needs to list documents in a workspace to confirm prior representation.

Do not invoke iManage for personal/working drafts (use the local doc store), for opposing-counsel-shared documents that have not been ingested yet, or for any document outside the operator's permission scope.

## Authentication

OAuth 2.0 Bearer. Include `Authorization: Bearer $IMANAGE_TOKEN` and `X-Auth-Token: $IMANAGE_TOKEN` on every request (iManage requires both on some endpoints). Token exchange endpoint: `${IMANAGE_HOST}/auth/oauth2/token`. Official docs: https://developer.imanage.com/

## Operation Patterns

### List documents in a workspace

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

### Fetch a document's latest version

`Method: GET ${IMANAGE_HOST}/work/api/v2/customers/<customerId>/libraries/${IMANAGE_LIBRARY}/documents/<documentId>/download`

Stream to a local file. The response is the raw binary; preserve the original extension from the `Content-Disposition` header.

### Upload (check in) a new document

`Method: POST ${IMANAGE_HOST}/work/api/v2/customers/<customerId>/libraries/${IMANAGE_LIBRARY}/workspaces/<workspaceId>/documents` with multipart/form-data containing a `profile` JSON part and a `file` binary part. UNCONFIRMED — exact field names should be verified against the live tenant's OpenAPI spec at `${IMANAGE_HOST}/work/api/v2/documentation`.

Failure modes:
- 401 → token expired. Refresh via the OAuth refresh token; if refresh fails, post `BLOCKED: IMANAGE_AUTH_EXPIRED` and ask operator to re-authorize.
- 403 → permission scope missing for the workspace; post `BLOCKED: IMANAGE_PERMISSION_DENIED <workspaceId>` and ask operator to grant access.
- 404 → wrong customer/library/workspace ID; verify configuration.
- 5xx → tenant outage; post comment and back off.

## Output Convention

After a successful upload, post a Paperclip comment with the iManage `documentId`, the workspace name, and the version number. For downloads, save into the matter deliverables tree (via the storage convention from `output-storage-config`) and reference both the local path and the iManage URL (`${IMANAGE_HOST}/work/web/r/<documentId>`) in the comment.

## Given / When / Then

- **Happy path** — Token valid and operator has workspace access; document list returns; agent posts the document IDs and versions to Paperclip.
- **Edge** — Token expired mid-task; agent refreshes silently using the stored refresh token and resumes the call without operator intervention.
- **Failure / security** — `IMANAGE_TOKEN` unset or wrong tenant host: agent posts `[CONNECTOR:IMANAGE_UNCONFIGURED]`, makes no call, and never logs token bytes or workspace metadata that could leak client identity.
