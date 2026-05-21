#!/usr/bin/env bash
set -euo pipefail

# MemPalace ingest hook (stub).
#
# The checkpoint helper calls this after local artifacts (PLAN, HANDOFF, history)
# are updated. Replace this stub with a real ingest call to make MemPalace a live
# integration for your repo.
#
# Contract:
#   Input 1: absolute repo root
#   Input 2: checkpoint reason (e.g., sprint-closeout, pre-git-cycle)
# Exit non-zero on failure; the caller records the failure instead of inventing success.

REPO_ROOT="${1:-}"
REASON="${2:-task-end}"

if [[ -z "$REPO_ROOT" ]]; then
  echo "BLOCKED: mempalace-ingest.sh requires a repo root as argument 1"
  exit 1
fi

if [[ ! -d "$REPO_ROOT" ]]; then
  echo "BLOCKED: repo root does not exist: $REPO_ROOT"
  exit 1
fi

echo "MemPalace stub: replace with real ingestion."
echo "  Repo: $REPO_ROOT"
echo "  Reason: $REASON"
echo "  Artifacts to ingest (if implementing):"
echo "    - $REPO_ROOT/.agent/PLAN.md"
echo "    - $REPO_ROOT/.agent/TEST.md"
echo "    - $REPO_ROOT/.agent/REVIEW.md"
echo "    - $REPO_ROOT/.agent/HANDOFF.md"
echo "    - $REPO_ROOT/.claude/history.md"
echo "DONE: stub reported; no ingestion performed."
