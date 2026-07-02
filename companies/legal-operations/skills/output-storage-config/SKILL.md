---
name: output-storage-config
description: Operator-facing reference for configuring where PossibLaw agents write local deliverables. Documents POSSIBLAW_DELIVERABLES_DIR, the per-agent .paperclip.yaml override, the directory tree convention, and typical macOS sync-folder paths (iCloud, Dropbox, OneDrive, Google Drive). Not an agent execution skill.
metadata:
  sources:
    - path: layer/skills/legal/nda-playbook.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Local Deliverable Storage — Operator Reference

**This skill is human-facing reference, not an agent execution skill.** Agents do not invoke this directly. Operators read it once to configure where their deliverables land, then the `output-local-markdown` and `output-local-docx` skills do the writing.

## Trust boundary — a synced folder is an UNRECEIPTED export

**Pointing `POSSIBLAW_DELIVERABLES_DIR` at a cloud-synced folder bypasses the
gate proxy entirely.** The sync client (iCloud, Dropbox, OneDrive, Google Drive
for desktop) — not the gate — moves the bytes off the machine. Every file the
output skills write there, **including privileged and confidential drafts**, is
uploaded to the vendor's cloud with **no gate receipt, no human-approval gate,
and no confidentiality tier-floor**. Nothing in this package can see or stop that
export; it happens in the sync client's own process. This is a documented v1
unreceipted-egress channel (see `docs/known-limitations.md` > "Unreceipted
egress channels").

The **supported** cloud delivery path is the gated courier: `upload_document`
through the gate proxy (see the connector skills and `output-delivery-playbook`),
which writes a receipt and enforces policy. The synced-folder pattern is a
local-convenience shortcut, not a delivery mechanism.

Rules the writing skills (`output-local-markdown`, `output-local-docx`) are
instructed to follow (this convention documents the intended behavior;
code-level enforcement is a follow-up):

1. **Refuse confidential/privileged into a synced root.** If the matter's
   `metadata.possiblaw.privacyTier` is `confidential` or `privileged` and the
   deliverables root is (or is marked) synced, the output skills are instructed
   to refuse the write, post `[STORAGE:SYNC_BYPASS_REFUSED]` naming the reason,
   and route the deliverable through the gated courier instead. This holds even when the
   operator has acknowledged the risk (below) — acknowledgment enables the
   pattern for standard matters, it does not open a privileged export path.
2. **Operator owns the risk for standard matters.** The synced-folder pattern is
   permitted for `standard`-tier deliverables only when the operator has
   explicitly accepted the risk with the acknowledgment convention below. Absent
   the acknowledgment, and when a sync folder is detected, the agent flags it and
   asks the operator once rather than silently exporting.
3. **Detect and flag sync-client artifacts.** Before writing, the output skills
   look for real sync-client markers in or above the deliverables root:
   - Google Drive for desktop: `.tmp.drivedownload` / `.tmp.driveupload`
     directories.
   - iCloud Drive: the `Mobile Documents/com~apple~CloudDocs` path segment, or
     `.<name>.icloud` placeholder files for not-yet-downloaded items.
   - Dropbox: a `.dropbox` file or `.dropbox.cache` directory at the account
     root; `(conflicted copy …)` filenames.
   - OneDrive: the `Library/CloudStorage/OneDrive-…` path segment, or
     `desktop.ini`.

   A bare `.DS_Store` is **NOT** evidence of sync — macOS writes it in every
   Finder-visited folder. Do not treat it as a sync signal. If none of the real
   markers above are present but the path *looks* synced (a `CloudStorage` or
   `Mobile Documents` segment), do not guess — ask the operator once whether the
   root is intentionally synced, and record the answer.

### Acknowledgment convention (`syncBypassAcknowledged: true`)

For the synced-folder pattern to be used for standard-tier deliverables, the
operator explicitly owns the risk by setting the acknowledgment in the agent's
`.paperclip.yaml` env — the documented convention the output skills check for:

```yaml
inputs:
  env:
    POSSIBLAW_DELIVERABLES_DIR: /Users/<you>/Library/CloudStorage/OneDrive-Personal/PossibLaw/deliverables
    POSSIBLAW_SYNC_BYPASS_ACKNOWLEDGED: "true"   # operator accepts unreceipted export of STANDARD-tier deliverables via the sync client
```

`POSSIBLAW_SYNC_BYPASS_ACKNOWLEDGED: "true"` is the literal marker for
`syncBypassAcknowledged: true`. When it is absent and a sync folder is detected,
the write is treated as unacknowledged: flag and ask, do not export silently.
The acknowledgment never applies to confidential/privileged matters (rule 1).

## What This Configures

The two output skills (`output-local-markdown`, `output-local-docx`) write finished deliverables to:

```
${POSSIBLAW_DELIVERABLES_DIR:-$HOME/PossibLaw/deliverables}/<company-slug>/<project-slug>/<task-slug>/<timestamp>-<artifact-slug>.<ext>
```

Operators control the root by setting `POSSIBLAW_DELIVERABLES_DIR`. Everything below the root is derived from the Paperclip task context and the deliverable title.

## Environment Variable Convention

| Variable | Purpose | Default |
|---|---|---|
| `POSSIBLAW_DELIVERABLES_DIR` | Absolute path to the root folder where all deliverables are written. | `$HOME/PossibLaw/deliverables` |

The variable must be an absolute path. Tilde expansion is the operator's responsibility — the output skills do not expand `~` themselves.

## Setting It Per-Agent in `.paperclip.yaml`

Paperclip exposes environment variables to each agent via `inputs.env` on the agent definition. Put the operator's chosen root there so it travels with the agent rather than the shell:

```yaml
agents:
  - id: contracts-specialist
    inputs:
      env:
        POSSIBLAW_DELIVERABLES_DIR: /Users/op/Library/Mobile Documents/com~apple~CloudDocs/PossibLaw/deliverables
```

Each agent can point at a different root if the operator wants per-role separation (e.g. drafts in iCloud, finals in a shared Dropbox).

## Directory Tree Convention

```
$POSSIBLAW_DELIVERABLES_DIR/
  <company-slug>/
    <project-slug>/
      <task-slug>/
        <timestamp>-<artifact-slug>.md
        <timestamp>-<artifact-slug>.docx
```

- `<company-slug>` — the Paperclip company name, kebab-cased and lowercased.
- `<project-slug>` — the Paperclip project or board name, kebab-cased and lowercased.
- `<task-slug>` — the Paperclip task title, kebab-cased and lowercased.
- `<timestamp>` — local time in `YYYYMMDD-HHMMSS` form. Sorts chronologically per directory.
- `<artifact-slug>` — a stable kebab-case slug derived from the deliverable title (e.g. `nda-foo-bar`, `intake-memo`, `conflicts-result`).

The timestamp prefix means every save is a new file. Nothing is overwritten. The operator decides what to keep, archive, or delete.

## Pointing at a Sync Folder (macOS)

Any of the major consumer sync providers works — they each surface as a regular folder on disk. Use the absolute path; do not use shell aliases.

### iCloud Drive

```
/Users/<you>/Library/Mobile Documents/com~apple~CloudDocs/PossibLaw/deliverables
```

In `.paperclip.yaml`:

```yaml
inputs:
  env:
    POSSIBLAW_DELIVERABLES_DIR: /Users/<you>/Library/Mobile Documents/com~apple~CloudDocs/PossibLaw/deliverables
```

Notes: the `Mobile Documents` path is the real location; the Finder label "iCloud Drive" is cosmetic. Spaces in the path are fine because the output skills quote `"$VAR"`.

### Dropbox

```
/Users/<you>/Dropbox/PossibLaw/deliverables
```

In `.paperclip.yaml`:

```yaml
inputs:
  env:
    POSSIBLAW_DELIVERABLES_DIR: /Users/<you>/Dropbox/PossibLaw/deliverables
```

Notes: Dropbox Business installs may use `/Users/<you>/Dropbox (Company Name)/...` — check the actual folder name in Finder.

### OneDrive

```
/Users/<you>/Library/CloudStorage/OneDrive-Personal/PossibLaw/deliverables
```

Or for a work/school tenant:

```
/Users/<you>/Library/CloudStorage/OneDrive-<TenantName>/PossibLaw/deliverables
```

In `.paperclip.yaml`:

```yaml
inputs:
  env:
    POSSIBLAW_DELIVERABLES_DIR: /Users/<you>/Library/CloudStorage/OneDrive-Personal/PossibLaw/deliverables
```

Notes: macOS Ventura+ stores all cloud providers under `~/Library/CloudStorage/`. The exact suffix after `OneDrive-` depends on the account type.

### Google Drive (Drive for desktop)

```
/Users/<you>/Library/CloudStorage/GoogleDrive-<you>@gmail.com/My Drive/PossibLaw/deliverables
```

In `.paperclip.yaml`:

```yaml
inputs:
  env:
    POSSIBLAW_DELIVERABLES_DIR: /Users/<you>/Library/CloudStorage/GoogleDrive-<you>@gmail.com/My Drive/PossibLaw/deliverables
```

Notes: Drive for desktop mounts under `~/Library/CloudStorage/GoogleDrive-<account>/`. Shared drives appear as `Shared drives/<name>` rather than `My Drive`.

## Verifying the Configuration

After setting the variable, an operator can sanity-check with:

```sh
echo "$POSSIBLAW_DELIVERABLES_DIR"
mkdir -p "$POSSIBLAW_DELIVERABLES_DIR" && touch "$POSSIBLAW_DELIVERABLES_DIR/.write-test" && rm "$POSSIBLAW_DELIVERABLES_DIR/.write-test" && echo "OK: writable"
```

If `OK: writable` prints, the output skills will succeed. If not, fix the path or permissions before running an agent that uses them.

## Related Skills

- `output-local-markdown` — writes the finished deliverable as `.md`.
- `output-local-docx` — converts the deliverable to `.docx` via pandoc.
