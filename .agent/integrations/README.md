# Local Continuity Integrations

These helpers stay local to the repo under `.agent/` and should not be committed.

## Included Helpers

- `run-checkpoint.sh`
- `run-checkpoint.ps1`

Use them to flag the required continuity work at sprint closeout, before a git cycle, or when context is getting crowded.

## Optional MemPalace Hook

Stub helpers ship with the pack so the integration point is self-documenting:

- `.agent/integrations/mempalace-ingest.sh`
- `.agent/integrations/mempalace-ingest.ps1`

Out of the box these stubs print what *would* be ingested and exit 0 — no real ingestion happens until you replace the script body with a real call to your MemPalace backend.

Contract:
- Input 1 / `-RepoRoot`: absolute repo root
- Input 2 / `-Reason`: checkpoint reason such as `sprint-closeout` or `pre-git-cycle`
- Source of truth remains local files in `.agent/` and `.claude/history.md`
- Ingest only after `PLAN`, `HANDOFF`, and `history` were updated
- Return non-zero on failure so the caller can record the failure instead of inventing success

Recommended use:
- keep MemPalace ingestion raw/verbatim
- attach artifact path, timestamp, task title, tags, and commit SHA metadata when available
- treat retrieval as advisory and verify against current repo files
