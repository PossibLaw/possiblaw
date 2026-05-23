---
name: connector-netdocuments
description: Search, fetch, and upload documents in the NetDocuments cloud DMS via the NetDocuments REST API v2 using OAuth 2.0.
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

NetDocuments is a cloud-native document-management system widely used by law firms. Agents call NetDocuments to list documents in a matter workspace (called a "cabinet"), fetch a specific document, or upload a new draft. For solo / small-firm operators without a NetDocuments subscription, the `connector-local-fs-doc-store` skill is the stand-in.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `NETDOCS_HOST` | API host. Region-specific. | `https://api.netdocuments.com` | Firm IT or NetDocuments admin; EU/UK regions use different hosts |
| `NETDOCS_REPOSITORY_ID` | Repository (cabinet) ID for document operations | — | NetDocuments admin → Cabinets |
| `NETDOCS_OAUTH_TOKEN` | OAuth 2.0 access token (authorization-code flow) | — | NetDocuments developer portal → register app + run auth-code flow |
| `NETDOCS_REFRESH_TOKEN` | OAuth 2.0 refresh token for renewing access tokens | — | Persisted from the original authorization-code exchange |

The OAuth client ID and secret used to obtain the tokens must be stored alongside them in the operator's secret store; the agent only needs the access token at call time.

## When to Invoke

- A matter agent needs the canonical version of a document from the firm cabinet.
- A drafting agent must check a new draft into the NetDocuments workspace so the partner sees it.
- A conflicts agent needs to list documents associated with a prior matter or party.

Do not invoke NetDocuments for personal working drafts (use the local doc store), for documents outside the operator's NetDocuments permission scope, or without checking the matter's workspace ID.

## Authentication

OAuth 2.0 Bearer. Include `Authorization: Bearer $NETDOCS_OAUTH_TOKEN` on every request. Access tokens are short-lived; refresh via `POST ${NETDOCS_HOST}/v1/OAuth/Token` with `grant_type=refresh_token`. Official docs: https://developer.netdocuments.com/

## Operation Patterns

### Search documents

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

### Get document info

`Method: GET ${NETDOCS_HOST}/v2/Document/<docId>/info`

Returns metadata including name, version, profile attributes, and created/modified dates.

### Download a document

`Method: GET ${NETDOCS_HOST}/v2/Document/<docId>`

Returns raw binary; preserve the extension from the `Content-Disposition` header.

### Upload (create) a document

`Method: POST ${NETDOCS_HOST}/v2/Document` with multipart/form-data containing a `profile` JSON part (workspace/cabinet/profile attributes) and a `file` binary part. UNCONFIRMED — exact profile field names vary by cabinet schema; operator must verify against the firm's NetDocuments cabinet definition.

Failure modes:
- 401 → access token expired. Refresh via the refresh token; if refresh fails, post `BLOCKED: NETDOCS_AUTH_EXPIRED` and ask operator to re-authorize.
- 403 → permission scope missing for the cabinet/workspace; post `BLOCKED: NETDOCS_PERMISSION_DENIED <repositoryId>`.
- 404 → wrong repository or document ID.
- 5xx → upstream issue; surface body in a Paperclip comment.

## Output Convention

After a successful upload, post a Paperclip comment with the NetDocuments `docId`, repository, and version. For downloads, save to the matter deliverables tree (per `output-storage-config`) and link the local path plus the NetDocuments URL in the comment.

## Given / When / Then

- **Happy path** — Token valid and operator has cabinet access; search returns hits; agent posts top results with `docId` + name to Paperclip.
- **Edge** — Access token expired mid-task; agent refreshes silently using the stored refresh token and resumes the call without operator intervention.
- **Failure / security** — `NETDOCS_OAUTH_TOKEN` unset or wrong repository ID: agent posts `[CONNECTOR:NETDOCS_UNCONFIGURED]`, makes no call, and never logs token bytes or document metadata that could leak client identity.
