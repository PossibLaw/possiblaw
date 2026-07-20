#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY="$REPO_ROOT/bin/verify"

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

[[ -x "$VERIFY" ]] || fail "bin/verify must exist and be executable"

list_output="$(cd /tmp && "$VERIFY" --list)"
for package in \
  deadline-engine \
  eval-harness \
  firm-overview \
  gate-proxy \
  learning-loop \
  mcp-servers/firm-facade \
  mcp-servers/legal-data \
  orchestration-eval
do
  assert_contains "$list_output" "pnpm -C $package test"
  assert_contains "$list_output" "pnpm -C $package typecheck"
done

assert_contains "$list_output" "bash -n bin/possiblaw"
assert_contains "$list_output" "bash bin/test-possiblaw-production-safety.sh"
assert_contains "$list_output" "python3 bin/_possiblaw_auth_secret.py --self-test"
assert_contains "$list_output" "python3 bin/_possiblaw_private_file.py --self-test"
assert_contains "$list_output" "python3 bin/_possiblaw_variants.py --self-test"
assert_contains "$list_output" "python3 bin/_possiblaw_eval_coverage.py --check"
assert_contains "$list_output" "python3 -m unittest discover -s config/tests -v"
assert_contains "$list_output" "deployments/firm-single-tenant/tests/run.sh"
assert_contains "$list_output" "package, variant, MCP, and gate-policy YAML manifests"
assert_contains "$list_output" "bin/possiblaw --list-variants"
assert_contains "$list_output" "SKIP"
assert_contains "$list_output" "live"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/repo/bin" "$tmp/repo/tests"
cp "$VERIFY" "$tmp/repo/bin/verify"
chmod +x "$tmp/repo/bin/verify"

cat >"$tmp/repo/bin/verify-command" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${POSSIBLAW_VERIFY_FAIL_CHECK:-}" == "$1" ]]; then
  exit 23
fi
printf '%s\n' "$1" >>"${POSSIBLAW_VERIFY_LOG:?}"
EOF
chmod +x "$tmp/repo/bin/verify-command"

: >"$tmp/commands.log"
POSSIBLAW_VERIFY_TEST_DRIVER="$tmp/repo/bin/verify-command" \
  POSSIBLAW_VERIFY_LOG="$tmp/commands.log" \
  env -u ANTHROPIC_API_KEY -u OPENAI_API_KEY -u OPENROUTER_API_KEY \
  bash -c 'cd /tmp && "$1"' _ "$tmp/repo/bin/verify" >"$tmp/pass.out"

assert_contains "$(cat "$tmp/pass.out")" "PASS: PossibLaw credential-free validation"
[[ -s "$tmp/commands.log" ]] || fail "test driver did not receive child checks"

set +e
POSSIBLAW_VERIFY_TEST_DRIVER="$tmp/repo/bin/verify-command" \
  POSSIBLAW_VERIFY_FAIL_CHECK="node:deadline-engine:test" \
  POSSIBLAW_VERIFY_LOG="$tmp/commands.log" \
  "$tmp/repo/bin/verify" >"$tmp/fail.out" 2>&1
rc=$?
set -e
[[ "$rc" -ne 0 ]] || fail "bin/verify must fail when a child check fails"
assert_contains "$(cat "$tmp/fail.out")" "FAIL  node:deadline-engine:test"

printf 'OK: bin/verify contract tests passed\n'
