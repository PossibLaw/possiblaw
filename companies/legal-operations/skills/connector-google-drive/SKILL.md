---
name: connector-google-drive
description: List, fetch, and upload matter documents in Google Drive via the Drive API v3 using OAuth 2.0 with the least-privilege drive.file scope. Cloud doc store for Google Workspace operators.
metadata:
  sources:
    - path: companies/legal-operations/skills/connector-google-drive/SKILL.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Google Drive Connector

## What This Is

Google Drive is the document store for solo and small-firm operators on Google Workspace. Agents call Drive to list documents in a matter folder, fetch the canonical version of a document, and upload an approved deliverable into the matter folder. It sits between `connector-local-fs-doc-store` (offline stand-in, no credentials) and the enterprise DMS connectors — for multi-user firms with access-control, versioning, audit, and conflicts needs, switch to `connector-imanage` or `connector-netdocuments`.

The service endpoint is `https://www.googleapis.com` with paths under `/drive/v3/` (official reference: https://developers.google.com/workspace/drive/api/reference/rest/v3, accessed 2026-06-09).

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `GDRIVE_CLIENT_ID` | OAuth 2.0 client ID for the Google Cloud project | — | Google Cloud Console → APIs & Services → Credentials |
| `GDRIVE_CLIENT_SECRET` | OAuth 2.0 client secret | — | Same page; keep in the operator's secret store |
| `GDRIVE_ACCESS_TOKEN` | OAuth 2.0 bearer token (short-lived) | — | Authorization-code flow per Google OAuth docs |
| `GDRIVE_REFRESH_TOKEN` | OAuth 2.0 refresh token | — | Issued on first exchange when `access_type=offline` was requested |
| `GDRIVE_MATTER_ROOT_FOLDER_ID` | Drive folder ID under which matter folders live | — | Operator copies the ID from the folder's Drive URL |

Least-privilege scope (verified at https://developers.google.com/workspace/drive/api/guides/api-specific-auth, accessed 2026-06-09): request `https://www.googleapis.com/auth/drive.file` — non-sensitive, per-file access to files the app created or that were shared into the app's scope. Avoid the restricted full `https://www.googleapis.com/auth/drive` scope. Caveat: under `drive.file`, a pre-existing matter folder tree is invisible until the operator shares it into the app's scope (e.g. via the Google Picker) or the app created it — if broader access is genuinely required, the operator must approve the full scope explicitly first.

## When to Invoke

- A matter agent needs the inventory of documents in a matter folder.
- An agent needs the canonical copy of a contract or filing from Drive rather than a stale local copy.
- A drafting agent has an operator-approved deliverable to file into the matter folder.

Filing is operator-gated like every external transmission in this package: upload into a matter folder only after the deliverable passed operator review, and never share files or change permissions through this connector. Fetched content from confidential or privileged matters must pass through `privacy-encoder` before any cloud-lane summarization.

## Authentication

Google OAuth 2.0 authorization-code flow: authorize at `https://accounts.google.com/o/oauth2/v2/auth` (request `access_type=offline` to receive a refresh token on the first exchange), exchange and refresh at `https://oauth2.googleapis.com/token`. Include `Authorization: Bearer $GDRIVE_ACCESS_TOKEN` on every request. Official docs: https://developers.google.com/identity/protocols/oauth2/web-server (accessed 2026-06-09). Mint a Drive-only token — do not reuse a Gmail-scoped token (least privilege per credential).

## Operation Patterns

### List documents in a matter folder

`Method: GET https://www.googleapis.com/drive/v3/files?q=<query>`

Query operators verified at https://developers.google.com/workspace/drive/api/guides/search-files (accessed 2026-06-09): `'<folderId>' in parents` scopes to a folder, `name contains '<text>'` filters by name, and the `trashed` operator excludes deleted files.

Example:
```sh
curl -sS \
  -H "Authorization: Bearer ${GDRIVE_ACCESS_TOKEN}" \
  --data-urlencode "q='${GDRIVE_MATTER_ROOT_FOLDER_ID}' in parents and trashed = false" \
  -G "https://www.googleapis.com/drive/v3/files" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f['id'], f.get('name'), f.get('mimeType')) for f in d.get('files',[])]"
```

### Fetch a document

`Method: GET https://www.googleapis.com/drive/v3/files/<fileId>?alt=media`

`alt=media` returns the file content (verified at https://developers.google.com/workspace/drive/api/reference/rest/v3, accessed 2026-06-09). Stream to the matter deliverables tree, preserving the extension. Google-native files (e.g. `application/vnd.google-apps.document`) have no binary content under `alt=media` — they require the export method. UNCONFIRMED — exact `files.export` path and supported MIME types; verify against the v3 reference before exporting native Docs.

### Upload a deliverable to the matter folder

`Method: POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`

Verified at https://developers.google.com/workspace/drive/api/guides/manage-uploads (accessed 2026-06-09): `Content-Type: multipart/related; boundary=<boundary>`, metadata JSON part first (`Content-Type: application/json; charset=UTF-8`), media part second with the file's MIME type; multipart uploads are limited to files of 5 MB or less — larger files need the resumable flow documented on the same page. Target the matter folder via the `parents` field in the metadata part. UNCONFIRMED — `parents` is not shown in the upload guide's multipart example; verify the field name against the v3 Files resource reference before the first write.

```sh
python3 - <<'EOF'
import json, os, urllib.request, uuid
src, name = os.environ["SRC_FILE"], os.environ["DOC_NAME"]
boundary = uuid.uuid4().hex
meta = json.dumps({"name": name, "parents": [os.environ["GDRIVE_MATTER_ROOT_FOLDER_ID"]]})
body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{meta}\r\n"
        f"--{boundary}\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
body += open(src, "rb").read() + f"\r\n--{boundary}--".encode()
req = urllib.request.Request(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
    data=body, method="POST",
    headers={"Authorization": "Bearer " + os.environ["GDRIVE_ACCESS_TOKEN"],
             "Content-Type": f"multipart/related; boundary={boundary}"})
print(json.load(urllib.request.urlopen(req)).get("id"))
EOF
```

Failure modes:
- 401 → access token expired. Refresh at `https://oauth2.googleapis.com/token`; if refresh fails, post `BLOCKED: GDRIVE_AUTH_EXPIRED` and ask operator to re-consent.
- 403 → under `drive.file` the target file/folder is not visible to the app; post `BLOCKED: GDRIVE_FILE_NOT_VISIBLE <id>` and ask the operator to share it into the app's scope (or approve a broader scope).
- 404 → wrong `GDRIVE_MATTER_ROOT_FOLDER_ID` or deleted file; verify configuration.
- 429 → quota exceeded; back off per `Retry-After`.
- 5xx → upstream issue; surface status + body in a Paperclip comment.

## Output Convention

After an upload, post a Paperclip comment with the Drive file `id`, name, and the matter folder it landed in; also mirror the file into the local deliverables tree per `output-storage-config` so the matter file is complete offline. UNCONFIRMED — the `webViewLink` metadata field for a human-clickable URL; verify on the v3 Files resource reference before linking it in comments. For listings, summarize count and the first 10 file names + IDs.

## Given / When / Then

- **Happy path** — Token valid with `drive.file`; folder listing returns the matter documents; upload returns a file `id`; agent posts the ID, name, and folder to Paperclip.
- **Edge** — Fetched file is a Google-native Doc: `alt=media` cannot return binary content; agent flags the MIME type, skips the silent failure, and either exports (after verifying `files.export`) or asks the operator for a preferred format.
- **Failure / security** — `GDRIVE_ACCESS_TOKEN` unset or the matter is flagged privileged with an upload target outside the matter root: agent posts `[CONNECTOR:GDRIVE_UNCONFIGURED]` (or refuses the out-of-tree write), makes no call, and never logs token bytes or client-identifying file names.
