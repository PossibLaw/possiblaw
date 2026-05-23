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
