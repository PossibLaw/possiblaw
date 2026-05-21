#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Flag a continuity checkpoint for a target repository.

Usage:
  run-checkpoint.sh [target-repo] [--reason <reason>] [--skip-mempalace]

Reasons:
  sprint-closeout
  pre-git-cycle
  context-50
  task-end
  handoff
USAGE
}

TARGET_DIR="."
if [[ $# -gt 0 && "$1" != -* ]]; then
  TARGET_DIR="$1"
  shift
fi

REASON="task-end"
SKIP_MEMPALACE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reason)
      if [[ $# -lt 2 || "$2" == --* ]]; then
        echo "BLOCKED: missing value for --reason"
        usage
        exit 1
      fi
      REASON="$2"
      shift 2
      ;;
    --skip-mempalace)
      SKIP_MEMPALACE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "BLOCKED: unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "$TARGET_DIR" ]]; then
  echo "BLOCKED: target directory does not exist: $TARGET_DIR"
  exit 1
fi

if git -C "$TARGET_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
  REPO_ROOT="$(git -C "$TARGET_DIR" rev-parse --show-toplevel)"
else
  REPO_ROOT="$(cd "$TARGET_DIR" && pwd)"
fi

PLAN_FILE="$REPO_ROOT/.agent/PLAN.md"
HANDOFF_FILE="$REPO_ROOT/.agent/HANDOFF.md"
HISTORY_FILE="$REPO_ROOT/.claude/history.md"
LEARNINGS_FILE="$REPO_ROOT/.agent/LEARNINGS.md"
MEMPALACE_HELPER="$REPO_ROOT/.agent/integrations/mempalace-ingest.sh"

for required in "$PLAN_FILE" "$HANDOFF_FILE" "$HISTORY_FILE"; do
  if [[ ! -f "$required" ]]; then
    echo "BLOCKED: missing required checkpoint file: $required"
    exit 1
  fi
done

LEARNING_MODE="UNCONFIRMED"
if grep -Fq -- '- Mode: `CAPTURE`' "$PLAN_FILE"; then
  LEARNING_MODE="CAPTURE"
elif grep -Fq -- '- Mode: `APPLY`' "$PLAN_FILE"; then
  LEARNING_MODE="APPLY"
elif grep -Fq -- '- Mode: `OFF`' "$PLAN_FILE"; then
  LEARNING_MODE="OFF"
fi

echo "CHECKPOINT: $REASON"
echo "Repo root: $REPO_ROOT"
echo "Required updates:"
echo "  1. Update $PLAN_FILE"
echo "  2. Update $HANDOFF_FILE"
echo "  3. Append $HISTORY_FILE"

if [[ "$LEARNING_MODE" == "CAPTURE" || "$LEARNING_MODE" == "APPLY" ]]; then
  echo "  4. Append $LEARNINGS_FILE (Learning Mode: $LEARNING_MODE)"
else
  echo "  4. Skip learnings (Learning Mode: $LEARNING_MODE)"
fi

if git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Git review:"
  git -C "$REPO_ROOT" status --short || true
  git -C "$REPO_ROOT" diff --stat || true
fi

if [[ "$SKIP_MEMPALACE" -eq 0 && -x "$MEMPALACE_HELPER" ]]; then
  echo "Running MemPalace ingest helper: $MEMPALACE_HELPER"
  "$MEMPALACE_HELPER" "$REPO_ROOT" "$REASON"
else
  echo "MemPalace: skipped (no local helper or explicitly skipped)"
fi

echo "DONE: checkpoint flagged for $REPO_ROOT"
