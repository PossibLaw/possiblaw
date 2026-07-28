---
name: closing-sprint-and-syncing-state
version: 1.1.0
description: Use when a sprint is ending, a session is pausing, or context is getting crowded; updates PLAN and the single HANDOFF continuity file (current baton + newest-first timeline), captures gated learnings when enabled, and leaves a clean baton pass.
---

# Closing Sprint And Syncing State

## Inputs
- current objective and sprint scope
- latest validated work and remaining risks
- current `.agent/PLAN.md` and `.agent/HANDOFF.md`

## Steps
1. Confirm the checkpoint reason: sprint closeout, handoff, pre-git-cycle, or context pressure.
2. Update `.agent/PLAN.md` milestone and sprint status above the stop marker before writing any summary.
3. Refresh the **Current Baton** at the top of `.agent/HANDOFF.md`: decisions, open questions, exact constraints, next actions, and git-cycle state.
4. Prepend one short dated entry to the **Session Timeline** below the stop marker in `.agent/HANDOFF.md` (do not duplicate full artifacts; this timeline replaces the old separate history file).
5. If learning mode is `CAPTURE` or `APPLY`, add only lessons that pass the promotion gate in `.agent/LEARNINGS.md` (recurred ≥2× or explicitly confirmed).
6. If code or docs are being shipped next, flag the standard git cycle and leave the next git step explicit.

## Outputs
- `PLAN.md` milestone state reflects reality
- `HANDOFF.md` Current Baton is actionable without rereading the full session
- `HANDOFF.md` Session Timeline has a short newest-first checkpoint entry
- `.agent/LEARNINGS.md` updated only when enabled and only with gated lessons

## Common Mistakes
- creating a separate history file or other sidecar instead of using the one `HANDOFF.md`
- reading below the stop marker during normal resume
- adding learnings when learning mode is `OFF`, or adding ungated one-off notes
- leaving git-cycle status implicit
