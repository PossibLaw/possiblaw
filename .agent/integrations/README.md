# Local Continuity Integrations

These helpers stay local to the repo under `.agent/` and should not be committed.

## Included Helper

- `run-checkpoint.sh`

`run-checkpoint.sh` is an **advisory checklist printer** for the single-file continuity model. It is the only integration helper in the pack.

Use it to flag the required continuity work at sprint closeout, before a git cycle, or when context is getting crowded.

## What `run-checkpoint.sh` does

- Resolves the repo root.
- Prints the steps to update `.agent/PLAN.md` (milestone/sprint status, assumptions, task checklist).
- Prints the steps to update `.agent/HANDOFF.md` — refresh the **Current Baton** at the top and prepend a short dated entry to the **Session Timeline** below the STOP marker.
- Reads `Learning Mode` from `.agent/PLAN.md` and reminds you to append `.agent/LEARNINGS.md` only when learning mode is `CAPTURE` or `APPLY`.
- Shows git scope (`git status --short`, `git diff --stat`) so you can see what changed.

## What it does NOT do

- It does **not** write any state for you — you make the edits.
- It does **not** call any backend (no MemPalace, no remote ingest).
- It does **not** invent summaries.

Usage:

```bash
# from inside the target repo
./.agent/integrations/run-checkpoint.sh --reason sprint-closeout

# explicit target repo path
/path/to/your/repo/.agent/integrations/run-checkpoint.sh /path/to/your/repo --reason pre-git-cycle
```

Source of truth remains the local files in `.agent/` (especially `.agent/PLAN.md` and the single `.agent/HANDOFF.md` continuity file).
