#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

param(
  [Parameter(Position = 0)]
  [string]$TargetDir = ".",
  [string]$Reason = "task-end",
  [switch]$SkipMemPalace
)

if (-not (Test-Path -LiteralPath $TargetDir -PathType Container)) {
  Write-Host "BLOCKED: target directory does not exist: $TargetDir"
  exit 1
}

$repoRoot = ""
if (Get-Command git -ErrorAction SilentlyContinue) {
  $repoRoot = (& git -C $TargetDir rev-parse --show-toplevel 2>$null)
}
if ([string]::IsNullOrWhiteSpace($repoRoot)) {
  $repoRoot = (Resolve-Path -LiteralPath $TargetDir).Path
}

$planFile = Join-Path $repoRoot ".agent/PLAN.md"
$handoffFile = Join-Path $repoRoot ".agent/HANDOFF.md"
$historyFile = Join-Path $repoRoot ".claude/history.md"
$learningsFile = Join-Path $repoRoot ".agent/LEARNINGS.md"
$mempalaceHelper = Join-Path $repoRoot ".agent/integrations/mempalace-ingest.ps1"

foreach ($required in @($planFile, $handoffFile, $historyFile)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    Write-Host "BLOCKED: missing required checkpoint file: $required"
    exit 1
  }
}

$learningMode = "UNCONFIRMED"
$planContent = Get-Content -LiteralPath $planFile -Raw
if ($planContent.Contains('- Mode: `CAPTURE`')) {
  $learningMode = "CAPTURE"
} elseif ($planContent.Contains('- Mode: `APPLY`')) {
  $learningMode = "APPLY"
} elseif ($planContent.Contains('- Mode: `OFF`')) {
  $learningMode = "OFF"
}

Write-Host "CHECKPOINT: $Reason"
Write-Host "Repo root: $repoRoot"
Write-Host "Required updates:"
Write-Host "  1. Update $planFile"
Write-Host "  2. Update $handoffFile"
Write-Host "  3. Append $historyFile"

if ($learningMode -eq "CAPTURE" -or $learningMode -eq "APPLY") {
  Write-Host "  4. Append $learningsFile (Learning Mode: $learningMode)"
} else {
  Write-Host "  4. Skip learnings (Learning Mode: $learningMode)"
}

if (Get-Command git -ErrorAction SilentlyContinue) {
  $null = & git -C $repoRoot rev-parse --is-inside-work-tree 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Git review:"
    & git -C $repoRoot status --short
    & git -C $repoRoot diff --stat
  }
}

if ((-not $SkipMemPalace) -and (Test-Path -LiteralPath $mempalaceHelper -PathType Leaf)) {
  Write-Host "Running MemPalace ingest helper: $mempalaceHelper"
  & $mempalaceHelper -RepoRoot $repoRoot -Reason $Reason
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} else {
  Write-Host "MemPalace: skipped (no local helper or explicitly skipped)"
}

Write-Host "DONE: checkpoint flagged for $repoRoot"
