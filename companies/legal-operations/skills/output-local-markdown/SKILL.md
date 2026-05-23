---
name: output-local-markdown
description: Write the finished deliverable as a Markdown file to a configurable local path and post the absolute path back as a Paperclip comment.
metadata:
  sources:
    - path: layer/skills/legal/nda-playbook.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Output Deliverable to Local Markdown

Use this skill at the end of a task when the agent has produced a finished work product (draft, memo, checklist, summary) and the operator needs it saved as a file on their machine — not only as a Paperclip comment.

## When To Use

- The deliverable is text-shaped and reads naturally as Markdown.
- The operator expects to open the artifact in their own editor, vault, or sync folder.
- A durable on-disk copy is needed in addition to the Paperclip thread.

## Path Convention

Write to:

```
${POSSIBLAW_DELIVERABLES_DIR:-$HOME/PossibLaw/deliverables}/<company-slug>/<project-slug>/<task-slug>/<timestamp>-<artifact-slug>.md
```

- `POSSIBLAW_DELIVERABLES_DIR` is the operator-controlled root. Fall back to `$HOME/PossibLaw/deliverables` when it is unset. See `output-storage-config` for how the operator points this at iCloud, Dropbox, OneDrive, or Google Drive.
- `<company-slug>`, `<project-slug>`, `<task-slug>` come from the Paperclip task context (company name, project/board name, task title). Lowercase, kebab-case, ASCII only.
- `<timestamp>` is `YYYYMMDD-HHMMSS` in local time (`date '+%Y%m%d-%H%M%S'`).
- `<artifact-slug>` is a stable kebab-case slug derived from the deliverable title (e.g. `nda-foo-bar`, `intake-memo`, `conflicts-result`). Lowercase, ASCII, no spaces.

## Steps

1. Generate `<artifact-slug>` from the deliverable title. Strip punctuation, lowercase, replace whitespace and underscores with `-`, collapse repeats, trim leading/trailing dashes.
2. Resolve the destination directory and full file path using the convention above. Use the env var if present; otherwise the `$HOME` default.
3. Create the parent directory tree with `mkdir -p`.
4. Write the deliverable body using a heredoc so the Markdown is preserved verbatim.
5. Confirm the file exists and capture its absolute path.
6. Post a Paperclip comment that includes the absolute file path so the operator can locate it. Do not omit this step — Paperclip remains the audit trail.

## Shell Pattern (paste and edit)

```sh
# Inputs the agent fills in for this task:
company_slug="acme-co"
project_slug="commercial-contracts"
task_slug="nda-with-foo"
artifact_slug="nda-foo-bar"

# Resolve root and full path.
root="${POSSIBLAW_DELIVERABLES_DIR:-$HOME/PossibLaw/deliverables}"
ts="$(date '+%Y%m%d-%H%M%S')"
dir="$root/$company_slug/$project_slug/$task_slug"
path="$dir/${ts}-${artifact_slug}.md"

# Create the directory tree (no-op if it already exists).
mkdir -p "$dir" || { echo "BLOCKED: cannot create $dir"; exit 1; }

# Write the deliverable. Replace the body between the EOF markers.
cat > "$path" <<'EOF'
# Mutual Non-Disclosure Agreement

(Replace this block with the finished deliverable Markdown.)
EOF

# Verify and emit the absolute path for the Paperclip comment.
if [ -s "$path" ]; then
  echo "WROTE: $path"
else
  echo "BLOCKED: file not written or empty at $path"
  exit 1
fi
```

After the write succeeds, post a Paperclip comment in this form so the operator can copy the path:

```
Deliverable saved to: /Users/<you>/PossibLaw/deliverables/acme-co/commercial-contracts/nda-with-foo/20260523-141532-nda-foo-bar.md
```

## Example Output Shape

See `example-deliverable.md` in this skill directory for the expected structure (title, parties block, body sections, signature blocks).

## Evals (Given / When / Then)

**Happy path**
- Given `POSSIBLAW_DELIVERABLES_DIR` is unset and `$HOME/PossibLaw/deliverables` is writable.
- When the agent runs the shell pattern with a real NDA body.
- Then a file is created at the conventional path, the file is non-empty, and a Paperclip comment with the absolute path is posted.

**Edge case — deliverables directory does not exist**
- Given `POSSIBLAW_DELIVERABLES_DIR=/Users/op/Documents/PossibLaw-Out` and that directory does not yet exist.
- When the agent runs the shell pattern.
- Then `mkdir -p` creates the full tree, the file is written, and the absolute path is posted as a Paperclip comment.

**Failure case — path is not writable**
- Given `POSSIBLAW_DELIVERABLES_DIR=/System/forbidden` (read-only or permission denied).
- When the agent runs the shell pattern.
- Then the agent does not silently fail; it posts a Paperclip comment of the form `BLOCKED: cannot create /System/forbidden/<...>` including the rejected absolute path, and does not claim the deliverable was saved.
