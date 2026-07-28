---
name: running-novice-safe-git-cycle
version: 1.0.0
description: Use when work is ready to ship and the developer needs a novice-safe git workflow; reviews scope, runs checks, refreshes continuity artifacts, and moves through commit, push, and PR steps without committing local state files.
---

# Running Novice-Safe Git Cycle

## Inputs
- changed files
- relevant validation commands and receipts
- current handoff status

## Steps
1. Inspect `git status --short` and `git diff --stat` to confirm scope.
2. Remove accidental files, debug leftovers, and local continuity files from the candidate commit.
3. Run the smallest relevant checks first, then the full required checks for the change.
4. Refresh canonical newest-first continuity in `.agent/PLAN.md` and `.agent/HANDOFF.md` (current baton + timeline) before committing.
5. Leave git-cycle status explicit in the handoff: reviewing, ready to commit, committed, pushed, or PR open.
6. Create a focused commit with a descriptive message.
7. Push the branch and open or update the PR when a remote workflow exists.

## Outputs
- clean staged scope
- validation evidence captured
- continuity files refreshed but not committed
- next git step obvious to a novice developer

## Common Mistakes
- committing `.agent/*` files (continuity stays local)
- creating sidecar continuity files instead of updating the canonical files
- skipping the checkpoint before a commit
- mixing unrelated changes into one commit
- claiming checks passed without receipts
