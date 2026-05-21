---
name: closing-sprint-and-syncing-state
version: 1.0.0
description: Use when a sprint is ending, a session is pausing, or context is getting crowded; updates PLAN, HANDOFF, and history, captures learnings when enabled, runs optional MemPalace ingest, and leaves a clean baton pass.
---

# Closing Sprint And Syncing State

## Inputs
- current objective and sprint scope
- latest validated work and remaining risks
- current `PLAN.md`, `HANDOFF.md`, and `.claude/history.md`

## Steps
1. Confirm the checkpoint reason: sprint closeout, handoff, pre-git-cycle, or context pressure.
2. Update `.agent/PLAN.md` milestone and sprint status before writing any summary.
3. Refresh `.agent/HANDOFF.md` with decisions, open questions, exact constraints, next actions, and git-cycle state.
4. Append `.claude/history.md` with a short checkpoint entry instead of duplicating full artifacts.
5. If learning mode is `CAPTURE` or `APPLY`, append concise, evidence-based entries to `.agent/LEARNINGS.md`.
6. If `.agent/integrations/mempalace-ingest.sh` or `.ps1` exists, run it only after local files are updated and record success or failure in the handoff.
7. If code or docs are being shipped next, flag the standard git cycle and leave the next git step explicit.

## Outputs
- `PLAN.md` milestone state reflects reality
- `HANDOFF.md` is actionable without rereading the full session
- `.claude/history.md` has a short checkpoint entry
- `.agent/LEARNINGS.md` updated only when enabled

## Common Mistakes
- treating history as the source of truth instead of the handoff
- adding learnings when learning mode is `OFF`
- claiming MemPalace ingest happened without a real helper run
- leaving git-cycle status implicit
