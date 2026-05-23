---
name: connector-local-fs-doc-store
description: Local filesystem stand-in for iManage / NetDocuments. Reads and writes plain matter-artifact files under a configurable local directory. No credentials required, always works offline.
metadata:
  sources:
    - path: layer/connectors/local-fs-doc-store.yaml
      kind: local-file
      usage: vendored
      license: Apache-2.0
      attribution: PossibLaw
---

# Local FS Doc Store Connector

## What This Is

The local filesystem doc store is the open-access stand-in for enterprise DMS systems (iManage, NetDocuments). It writes matter artifacts as plain files under a configurable root directory. No external service is contacted, no credentials are required, and it always works for offline demos, solo operators, and CI runs.

This connector is **deliberately minimal**: it is a stand-in, not a competitor to a real DMS. For multi-user firms with access-control, versioning, audit, and conflicts needs, switch to `connector-imanage` or `connector-netdocuments`.

## Required Environment Variables

| Env | Purpose | Default | Source |
|---|---|---|---|
| `POSSIBLAW_DOC_STORE_DIR` | Absolute path to the root directory where matter documents are stored. | `$HOME/PossibLaw/doc-store` | Operator chooses; document in `.paperclip.yaml` `inputs.env`. See `output-storage-config` for the recommended layout. |

The variable must be an absolute path. Tilde expansion is the operator's responsibility — the connector does not expand `~`.

## When to Invoke

- Demo / PoC matters where no real DMS is configured.
- Solo-operator deployments that store matter files in a personal sync folder (iCloud, Dropbox, OneDrive).
- CI and eval runs where reproducibility matters more than enterprise-grade access control.

Do not invoke for multi-user firms where audit, versioning, and access-control are required — promote to a real DMS connector.

## Authentication

None. The connector operates entirely on the local filesystem and inherits POSIX file permissions from the invoking process.

## Operation Patterns

### List documents for a matter

`Convention: ${POSSIBLAW_DOC_STORE_DIR}/<matter-slug>/`

```sh
ROOT="${POSSIBLAW_DOC_STORE_DIR:-$HOME/PossibLaw/doc-store}"
MATTER_SLUG="${MATTER_SLUG:?MATTER_SLUG required}"
find "${ROOT}/${MATTER_SLUG}" -type f -not -path '*/.*' \
  | sort \
  | while read -r f; do echo "$(basename "$f")  $(stat -f '%z bytes  %Sm' "$f")"; done
```

### Fetch a document

```sh
ROOT="${POSSIBLAW_DOC_STORE_DIR:-$HOME/PossibLaw/doc-store}"
MATTER_SLUG="${MATTER_SLUG:?}"
DOC_NAME="${DOC_NAME:?}"
TARGET="${ROOT}/${MATTER_SLUG}/${DOC_NAME}"
if [ ! -f "$TARGET" ]; then
  paperclip comment "[CONNECTOR:LOCAL_FS_DOC_STORE_NOT_FOUND] ${TARGET}"
  exit 0
fi
cat "$TARGET"
```

### Write a new document (check-in)

```sh
ROOT="${POSSIBLAW_DOC_STORE_DIR:-$HOME/PossibLaw/doc-store}"
MATTER_SLUG="${MATTER_SLUG:?}"
DOC_NAME="${DOC_NAME:?}"
SRC_FILE="${SRC_FILE:?}"
mkdir -p "${ROOT}/${MATTER_SLUG}"
cp "$SRC_FILE" "${ROOT}/${MATTER_SLUG}/${DOC_NAME}"
```

For versioning, append `--vN` or an ISO timestamp to the filename (`nda-v2.docx`, `nda-2026-05-23T15-04-00.docx`). The store does not auto-version.

Failure modes:
- Directory missing → `mkdir -p` on write, but read operations should post `[CONNECTOR:LOCAL_FS_DOC_STORE_NOT_FOUND]` rather than fail silently.
- Disk full → surface the OS error to a Paperclip comment.
- Permission denied → post `BLOCKED: LOCAL_FS_DOC_STORE_PERMISSION_DENIED <path>` and ask operator to fix POSIX permissions.

## Output Convention

After a write, post a Paperclip comment with the absolute path written and the byte size. For list/read operations, paste the filenames + sizes into a Paperclip comment; for large files, summarize and link the path rather than pasting content.

## Given / When / Then

- **Happy path** — `POSSIBLAW_DOC_STORE_DIR` set (or default acceptable), write succeeds, agent posts the absolute path + size to Paperclip.
- **Edge** — Operator is using a cloud-sync folder (e.g. iCloud); agent does not assume immediate availability on other machines and notes "synced via iCloud" in the comment so the operator knows there may be sync latency.
- **Failure / security** — Operator pointed `POSSIBLAW_DOC_STORE_DIR` at a world-readable directory (e.g. `/tmp/docstore`); agent posts a warning comment `[CONNECTOR:LOCAL_FS_DOC_STORE_INSECURE_PATH]` recommending a path under `$HOME` with `chmod 700`, and refuses to write privileged client content there if the matter is flagged confidential.
