#!/usr/bin/env pwsh
# MemPalace ingest hook (stub).
#
# The checkpoint helper calls this after local artifacts (PLAN, HANDOFF, history)
# are updated. Replace this stub with a real ingest call to make MemPalace a live
# integration for your repo.
#
# Contract:
#   -RepoRoot: absolute repo root
#   -Reason:   checkpoint reason (e.g., sprint-closeout, pre-git-cycle)
# Exit non-zero on failure so the caller can record the failure instead of inventing success.

param(
  [Parameter(Position = 0)]
  [string]$RepoRoot,

  [Parameter(Position = 1)]
  [string]$Reason = "task-end"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
  Write-Host "BLOCKED: mempalace-ingest.ps1 requires -RepoRoot"
  exit 1
}

if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
  Write-Host "BLOCKED: repo root does not exist: $RepoRoot"
  exit 1
}

Write-Host "MemPalace stub: replace with real ingestion."
Write-Host "  Repo: $RepoRoot"
Write-Host "  Reason: $Reason"
Write-Host "  Artifacts to ingest (if implementing):"
Write-Host "    - $RepoRoot/.agent/PLAN.md"
Write-Host "    - $RepoRoot/.agent/TEST.md"
Write-Host "    - $RepoRoot/.agent/REVIEW.md"
Write-Host "    - $RepoRoot/.agent/HANDOFF.md"
Write-Host "    - $RepoRoot/.claude/history.md"
Write-Host "DONE: stub reported; no ingestion performed."
