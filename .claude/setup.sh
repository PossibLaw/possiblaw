#!/usr/bin/env bash
# Sets up Claude Code's experimental LSP tool for this repo.
# Idempotent — safe to re-run. Intended as the setup command for
# Claude Code on the web environments; also usable on a local machine.
#
# Pairs with .claude/settings.json which sets ENABLE_LSP_TOOL=1.
# A full Claude Code restart is required after first install.
set -euo pipefail

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH; skipping LSP setup." >&2
  exit 0
fi

if ! claude plugin marketplace list 2>/dev/null | grep -q claude-plugins-official; then
  claude plugin marketplace add anthropics/claude-plugins-official
fi

if ! claude plugin list 2>/dev/null | grep -q 'typescript-lsp@'; then
  claude plugin install typescript-lsp@claude-plugins-official
fi

if ! command -v typescript-language-server >/dev/null 2>&1; then
  npm install -g typescript-language-server
fi

echo "LSP setup complete. Restart Claude Code so plugins initialize."
