---
name: output-local-docx
description: Convert the finished Markdown deliverable to a DOCX file on the operator's local disk using pandoc and post the absolute path back as a Paperclip comment.
metadata:
  sources:
    - path: layer/skills/legal/nda-playbook.md
      kind: local-file
      usage: original
      license: Apache-2.0
      attribution: PossibLaw
---

# Output Deliverable to Local DOCX

Use this skill at the end of a task when the operator needs the deliverable as a Word document — typically because counterparty review, redlining, or signature workflows happen in Word. The agent still drafts in Markdown; this skill converts and writes.

## When To Use

- The deliverable will be redlined, filed, or sent to a counterparty as `.docx`.
- The operator expects a Word-compatible artifact on disk in addition to the Paperclip comment.
- The Markdown version is either already on disk (via `output-local-markdown`) or generated in memory for this conversion.

## Prerequisite — pandoc

This skill requires `pandoc`. Check for it before doing anything else. If it is missing, post a Paperclip `BLOCKED` comment with the install command and stop — do not attempt a partial write.

macOS install command (Homebrew):

```sh
brew install pandoc
```

## Path Convention

Write to:

```
${POSSIBLAW_DELIVERABLES_DIR:-$HOME/PossibLaw/deliverables}/<company-slug>/<project-slug>/<task-slug>/<timestamp>-<artifact-slug>.docx
```

Same conventions as `output-local-markdown`:
- `POSSIBLAW_DELIVERABLES_DIR` is the operator-controlled root. See `output-storage-config`.
- `<company-slug>`, `<project-slug>`, `<task-slug>` come from the Paperclip task. Lowercase, kebab-case, ASCII.
- `<timestamp>` is `YYYYMMDD-HHMMSS` from `date '+%Y%m%d-%H%M%S'`.
- `<artifact-slug>` is a stable kebab-case slug from the deliverable title.

## Steps

1. Verify pandoc is installed with `command -v pandoc`. If missing, post BLOCKED with the install command and exit.
2. Generate `<artifact-slug>` from the deliverable title (kebab-case, lowercased, ASCII).
3. Resolve the destination directory and full DOCX path.
4. Create the parent directory tree with `mkdir -p`.
5. Pipe the Markdown body into `pandoc -f markdown -t docx -o "$path"` on stdin.
6. Confirm the DOCX file exists and is non-empty.
7. Post a Paperclip comment with the absolute file path.

## Shell Pattern (paste and edit)

```sh
# Inputs the agent fills in for this task:
company_slug="acme-co"
project_slug="commercial-contracts"
task_slug="nda-with-foo"
artifact_slug="nda-foo-bar"

# Step 1: pandoc must be available.
if ! command -v pandoc >/dev/null 2>&1; then
  echo "BLOCKED: pandoc is not installed. Install on macOS with: brew install pandoc"
  exit 1
fi

# Step 2-4: resolve paths and create the directory tree.
root="${POSSIBLAW_DELIVERABLES_DIR:-$HOME/PossibLaw/deliverables}"
ts="$(date '+%Y%m%d-%H%M%S')"
dir="$root/$company_slug/$project_slug/$task_slug"
path="$dir/${ts}-${artifact_slug}.docx"

mkdir -p "$dir" || { echo "BLOCKED: cannot create $dir"; exit 1; }

# Step 5: convert Markdown (heredoc on stdin) to DOCX.
# Replace the body between the EOF markers with the finished deliverable.
pandoc_err="$(mktemp)"
if ! cat <<'EOF' | pandoc -f markdown -t docx -o "$path" - 2>"$pandoc_err"
# Mutual Non-Disclosure Agreement

(Replace this block with the finished deliverable Markdown.)
EOF
then
  echo "BLOCKED: pandoc failed converting to $path"
  echo "--- pandoc stderr ---"
  cat "$pandoc_err"
  rm -f "$pandoc_err"
  exit 1
fi
rm -f "$pandoc_err"

# Step 6-7: verify and emit the absolute path for the Paperclip comment.
if [ -s "$path" ]; then
  echo "WROTE: $path"
else
  echo "BLOCKED: DOCX not written or empty at $path"
  exit 1
fi
```

After the write succeeds, post a Paperclip comment in this form:

```
Deliverable saved to: /Users/<you>/PossibLaw/deliverables/acme-co/commercial-contracts/nda-with-foo/20260523-141532-nda-foo-bar.docx
```

## Evals (Given / When / Then)

**Happy path — pandoc present**
- Given `pandoc` is installed and the deliverables root is writable.
- When the agent runs the shell pattern with a real NDA Markdown body.
- Then a non-empty `.docx` is created at the conventional path and a Paperclip comment with the absolute path is posted.

**Edge case — pandoc absent**
- Given `command -v pandoc` returns nothing.
- When the agent runs the shell pattern.
- Then no file is written, and the agent posts a Paperclip comment of the form `BLOCKED: pandoc is not installed. Install on macOS with: brew install pandoc`.

**Failure case — pandoc errors on the input**
- Given `pandoc` is installed but conversion fails (for example malformed table syntax that pandoc rejects).
- When the agent runs the shell pattern.
- Then no partial `.docx` is left behind from a successful claim, and the agent posts a Paperclip comment of the form `BLOCKED: pandoc failed converting to <path>` with the captured pandoc stderr preserved verbatim in a fenced code block.
