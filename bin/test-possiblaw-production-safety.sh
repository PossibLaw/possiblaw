#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAUNCHER="$REPO_ROOT/bin/possiblaw"
TMP_ROOT="$(mktemp -d -t possiblaw-production-test.XXXXXX)"
trap 'rm -rf "$TMP_ROOT"' EXIT

fail() {
    printf 'FAIL: %s\n' "$*" >&2
    exit 1
}

assert_contains() {
    local haystack="$1" needle="$2"
    case "$haystack" in
        *"$needle"*) : ;;
        *) fail "expected output to contain: $needle" ;;
    esac
}

assert_not_contains() {
    local haystack="$1" needle="$2"
    case "$haystack" in
        *"$needle"*) fail "output exposed forbidden value: $needle" ;;
        *) : ;;
    esac
}

assert_file_mode() {
    local path="$1" expected="$2" actual
    actual="$(python3 - "$path" <<'PY'
import os, stat, sys
print(f"{stat.S_IMODE(os.stat(sys.argv[1], follow_symlinks=False).st_mode):03o}")
PY
)"
    [ "$actual" = "$expected" ] || fail "expected $path mode $expected, got $actual"
}

run_expect_status() {
    local expected="$1" output_file="$2"
    shift 2
    set +e
    "$@" >"$output_file" 2>&1
    local actual=$?
    set -e
    [ "$actual" -eq "$expected" ] || {
        sed -n '1,160p' "$output_file" >&2 || true
        fail "expected exit $expected, got $actual"
    }
}

# The production flag is an operator-facing contract, not a hidden env knob.
HELP_OUTPUT="$($LAUNCHER --help)"
assert_contains "$HELP_OUTPUT" "--production"
assert_contains "$HELP_OUTPUT" "production-safety"

SECRET_SENTINEL="production-secret-must-not-appear"
LITERAL_KEY_OUT="$TMP_ROOT/literal-key.out"
run_expect_status 2 "$LITERAL_KEY_OUT" \
    "$LAUNCHER" --api-key "literal-board-secret" --list-variants
assert_contains "$(cat "$LITERAL_KEY_OUT")" "--api-key-file"
assert_not_contains "$(cat "$LITERAL_KEY_OUT")" "literal-board-secret"

if grep -q 'Authorization: Bearer \$BOARD_API_KEY' "$LAUNCHER"; then
    fail "board bearer token must not be interpolated into curl argv"
fi

BOARD_KEY_FILE="$TMP_ROOT/board-api-key"
printf '%s\n' "$SECRET_SENTINEL" > "$BOARD_KEY_FILE"
chmod 600 "$BOARD_KEY_FILE"
KEY_FILE_OUT="$TMP_ROOT/key-file.out"
run_expect_status 0 "$KEY_FILE_OUT" env TMPDIR="$TMP_ROOT" \
    "$LAUNCHER" --api-key-file "$BOARD_KEY_FILE" --list-variants
assert_not_contains "$(cat "$KEY_FILE_OUT")" "$SECRET_SENTINEL"
if find "$TMP_ROOT" -maxdepth 1 -name 'possiblaw-board-auth.*' -print -quit | grep -q .; then
    fail "private board-auth curl config was not removed"
fi

chmod 644 "$BOARD_KEY_FILE"
UNSAFE_KEY_FILE_OUT="$TMP_ROOT/unsafe-key-file.out"
run_expect_status 2 "$UNSAFE_KEY_FILE_OUT" \
    "$LAUNCHER" --api-key-file "$BOARD_KEY_FILE" --list-variants
assert_contains "$(cat "$UNSAFE_KEY_FILE_OUT")" "could not be read safely"
assert_not_contains "$(cat "$UNSAFE_KEY_FILE_OUT")" "$SECRET_SENTINEL"

# Fail-fast cases must happen before the launcher can make a network call.
STUB_BIN="$TMP_ROOT/stub-bin"
mkdir -p "$STUB_BIN"
cat >"$STUB_BIN/curl" <<'SH'
#!/usr/bin/env bash
: > "${POSSIBLAW_TEST_CURL_MARKER:?}"
exit 97
SH
chmod +x "$STUB_BIN/curl"

LOCAL_OUT="$TMP_ROOT/local-trusted.out"
run_expect_status 2 "$LOCAL_OUT" env PATH="$STUB_BIN:$PATH" \
    POSSIBLAW_TEST_CURL_MARKER="$TMP_ROOT/local.curl" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    "$LAUNCHER" --production --auth-mode local_trusted \
    --data-dir "$TMP_ROOT/local-data"
LOCAL_TEXT="$(cat "$LOCAL_OUT")"
assert_contains "$LOCAL_TEXT" "--production requires --auth-mode authenticated"
assert_not_contains "$LOCAL_TEXT" "$SECRET_SENTINEL"
[ ! -e "$TMP_ROOT/local.curl" ] || fail "local_trusted rejection happened after curl"
[ ! -e "$TMP_ROOT/local-data" ] || fail "local_trusted rejection happened after a data-dir write"

NO_GATE_OUT="$TMP_ROOT/no-gate.out"
run_expect_status 2 "$NO_GATE_OUT" env PATH="$STUB_BIN:$PATH" \
    POSSIBLAW_TEST_CURL_MARKER="$TMP_ROOT/no-gate.curl" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    "$LAUNCHER" --production --auth-mode authenticated --no-gate-proxy \
    --data-dir "$TMP_ROOT/no-gate-data"
NO_GATE_TEXT="$(cat "$NO_GATE_OUT")"
assert_contains "$NO_GATE_TEXT" "--production cannot be combined with --no-gate-proxy"
assert_not_contains "$NO_GATE_TEXT" "$SECRET_SENTINEL"
[ ! -e "$TMP_ROOT/no-gate.curl" ] || fail "--no-gate-proxy rejection happened after curl"
[ ! -e "$TMP_ROOT/no-gate-data" ] || fail "--no-gate-proxy rejection happened after a data-dir write"

MISSING_BOARD_OUT="$TMP_ROOT/missing-board.out"
run_expect_status 2 "$MISSING_BOARD_OUT" env PATH="$STUB_BIN:$PATH" \
    POSSIBLAW_TEST_CURL_MARKER="$TMP_ROOT/missing-board.curl" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    "$LAUNCHER" --production --auth-mode authenticated \
    --data-dir "$TMP_ROOT/missing-board-data"
MISSING_BOARD_TEXT="$(cat "$MISSING_BOARD_OUT")"
assert_contains "$MISSING_BOARD_TEXT" "PAPERCLIP_API_KEY"
assert_not_contains "$MISSING_BOARD_TEXT" "$SECRET_SENTINEL"
[ ! -e "$TMP_ROOT/missing-board.curl" ] || fail "missing board credential rejected after curl"
[ ! -e "$TMP_ROOT/missing-board-data" ] || fail "missing board credential rejected after a data-dir write"

EQUAL_PORTS_OUT="$TMP_ROOT/equal-ports.out"
run_expect_status 2 "$EQUAL_PORTS_OUT" env PATH="$STUB_BIN:$PATH" \
    POSSIBLAW_TEST_CURL_MARKER="$TMP_ROOT/equal-ports.curl" \
    PAPERCLIP_API_KEY="$SECRET_SENTINEL" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    "$LAUNCHER" --production --auth-mode authenticated --port 39100 --gate-port 39100 \
    --data-dir "$TMP_ROOT/equal-ports-data"
assert_contains "$(cat "$EQUAL_PORTS_OUT")" "must be different"
[ ! -e "$TMP_ROOT/equal-ports.curl" ] || fail "equal ports rejected after curl"
[ ! -e "$TMP_ROOT/equal-ports-data" ] || fail "equal ports rejected after a data-dir write"

# Production reattach requires an authenticated, fully bootstrapped Paperclip
# health document. A generic HTTP 200 or local_trusted response is not enough.
HEALTH_HELPER="$REPO_ROOT/bin/_possiblaw_health.py"
[ -x "$HEALTH_HELPER" ] || fail "production health validator must exist and be executable"
printf '%s' '{"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"ready"}' \
    | "$HEALTH_HELPER" --require-production >/dev/null
for bad_health in \
    '{"status":"ok","deploymentMode":"local_trusted","bootstrapStatus":"ready"}' \
    '{"status":"ok","deploymentMode":"authenticated","bootstrapStatus":"bootstrap_pending"}' \
    '{"ok":true}'; do
    if printf '%s' "$bad_health" | "$HEALTH_HELPER" --require-production >/dev/null 2>&1; then
        fail "unsafe health document was accepted: $bad_health"
    fi
done

PROCESS_HELPER="$TMP_ROOT/process-helper.sh"
sed -n '/^is_process_descendant_of()/,/^}/p' "$LAUNCHER" > "$PROCESS_HELPER"
# shellcheck disable=SC1090
source "$PROCESS_HELPER"
is_process_descendant_of "$$" "$$" || fail "a process was not recognized as itself"
( sleep 2 ) &
TEST_CHILD_PID=$!
is_process_descendant_of "$TEST_CHILD_PID" "$$" || fail "a direct child was not recognized"
kill "$TEST_CHILD_PID" 2>/dev/null || true
wait "$TEST_CHILD_PID" 2>/dev/null || true
if is_process_descendant_of "$$" 1; then
    fail "an unrelated process was accepted as launcher-owned"
fi
assert_contains "$(cat "$LAUNCHER")" "production reattach refused"
assert_contains "$(cat "$LAUNCHER")" "must not be group/world writable before startup"
assert_contains "$(cat "$LAUNCHER")" 'GATE_SHUTDOWN_GRACE_SECONDS="12"'
assert_contains "$(cat "$LAUNCHER")" 'kill_subshell_tree "$pid" "$port" "${GATE_SHUTDOWN_GRACE_SECONDS:-12}"'
assert_contains "$(cat "$LAUNCHER")" 'GATE_REQUIRE_AUTH="$gate_require_auth"'
EGRESS_SCRUB_LINE="$(grep '^EGRESS_CRED_VARS=' "$LAUNCHER")"
assert_contains "$EGRESS_SCRUB_LINE" "POSSIBLAW_GDRIVE_REVIEW_FOLDER_ID"
assert_contains "$EGRESS_SCRUB_LINE" "POSSIBLAW_ONEDRIVE_REVIEW_DRIVE_ID"
assert_contains "$EGRESS_SCRUB_LINE" "POSSIBLAW_ONEDRIVE_REVIEW_PARENT_ITEM_ID"
assert_contains "$(cat "$LAUNCHER")" 'a.get("slug") == "firm-facade-recorder"'
assert_not_contains "$(sed -n '/^emit_facade_config()/,/^# --list-variants/p' "$LAUNCHER")" \
    'a.get("slug") == "chief-of-staff"'
FACADE_AGENT_MANIFEST="$(sed -n '/^  firm-facade-recorder:/,/^  chief-counsel:/p' \
    "$REPO_ROOT/companies/legal-operations/.paperclip.yaml")"
assert_contains "$FACADE_AGENT_MANIFEST" "role: service-principal"
assert_contains "$FACADE_AGENT_MANIFEST" "wakeOnAssignment: false"
assert_contains "$FACADE_AGENT_MANIFEST" "wakeOnDemand: false"
assert_contains "$FACADE_AGENT_MANIFEST" "wakeOnOnDemand: false"
assert_contains "$FACADE_AGENT_MANIFEST" "wakeOnAutomation: false"

# Every executable gate recipe must forward the calling agent's Paperclip key.
# Output delivery contains two independent upload recipes; the remaining
# production gate callers contain one apiece. Notion is intentionally absent:
# authenticated production exposes no trusted Notion destination and its skill
# contains no executable write call.
while IFS='|' read -r skill expected_headers; do
    actual_headers="$(grep -cF 'Authorization: Bearer ${PAPERCLIP_API_KEY}' \
        "$REPO_ROOT/companies/legal-operations/skills/$skill/SKILL.md" || true)"
    [ "$actual_headers" = "$expected_headers" ] || \
        fail "$skill must contain $expected_headers authenticated gate call(s), found $actual_headers"
done <<'EOF'
citation-verification-checklist|1
legal-matter-intake|1
legal-deadline-calculation|1
output-delivery-playbook|2
connector-linear|1
connector-netdocuments|1
connector-quickbooks|1
connector-gmail|1
connector-outlook|1
connector-imanage|1
connector-hubspot|1
connector-google-drive|1
connector-clio|1
connector-docusign|1
connector-stripe|1
connector-no-op-signature|1
connector-onedrive|1
EOF
NOTION_SKILL="$REPO_ROOT/companies/legal-operations/skills/connector-notion/SKILL.md"
[ "$(grep -cF 'Authorization: Bearer ${PAPERCLIP_API_KEY}' "$NOTION_SKILL" || true)" = 0 ] || \
    fail "connector-notion must not contain an executable authenticated write recipe"
assert_contains "$(cat "$NOTION_SKILL")" "external **human action**"

AUTH_SECRET_HELPER="$REPO_ROOT/bin/_possiblaw_auth_secret.py"
[ -x "$AUTH_SECRET_HELPER" ] || fail "authentication-secret safety helper must exist and be executable"
"$AUTH_SECRET_HELPER" --self-test >/dev/null
assert_contains "$(cat "$LAUNCHER")" "_possiblaw_auth_secret.py"

PRIVATE_FILE_HELPER="$REPO_ROOT/bin/_possiblaw_private_file.py"
[ -x "$PRIVATE_FILE_HELPER" ] || fail "private-file safety helper must exist and be executable"
"$PRIVATE_FILE_HELPER" --self-test >/dev/null

WALLS_HELPER="$REPO_ROOT/bin/_possiblaw_walls.py"
BAD_WALLS="$TMP_ROOT/bad-walls.json"
RECEIPTS_ROOT="$TMP_ROOT/gate-receipts"
printf '%s' '[{"status":"active","prefix":"BAD/../","companyId":"c-1","gatePort":3801,"receiptsPath":"relative"}]' > "$BAD_WALLS"
if python3 "$WALLS_HELPER" --registry "$BAD_WALLS" --validate-production \
        --paperclip-port 3100 --firm-gate-port 3801 \
        --receipts-root "$RECEIPTS_ROOT" >/dev/null 2>&1; then
    fail "unsafe production walls registry was accepted"
fi
GOOD_WALLS="$TMP_ROOT/good-walls.json"
printf '[{"status":"active","prefix":"ACM","companyId":"c-1","gatePort":3802,"receiptsPath":"%s/acm/receipts.jsonl"}]' \
    "$RECEIPTS_ROOT" > "$GOOD_WALLS"
python3 "$WALLS_HELPER" --registry "$GOOD_WALLS" --validate-production \
    --paperclip-port 3100 --firm-gate-port 3801 \
    --receipts-root "$RECEIPTS_ROOT" >/dev/null

AGENTS_HELPER="$REPO_ROOT/bin/_possiblaw_agents.py"
[ -x "$AGENTS_HELPER" ] || fail "production agent-binding validator must exist and be executable"
printf '%s' '[{"id":"a-1","adapterConfig":{"env":{"GATE_PROXY_URL":"http://127.0.0.1:3801"}}}]' \
    | "$AGENTS_HELPER" --require-gate-url http://127.0.0.1:3801 >/dev/null
if printf '%s' '[{"id":"a-1","adapterConfig":{"env":{}}}]' \
        | "$AGENTS_HELPER" --require-gate-url http://127.0.0.1:3801 >/dev/null 2>&1; then
    fail "agent without the production gate binding was accepted"
fi

AUTHORIZATION_HELPER="$REPO_ROOT/bin/_possiblaw_authorization.py"
[ -x "$AUTHORIZATION_HELPER" ] || fail "runtime authorization compiler must exist and be executable"
"$AUTHORIZATION_HELPER" --self-test >/dev/null
assert_contains "$(cat "$LAUNCHER")" "_possiblaw_authorization.py"
assert_contains "$(cat "$LAUNCHER")" 'GATE_AUTHORIZATION_PATH='
FACADE_AUTH_AGENTS="$TMP_ROOT/facade-authorization-agents.json"
FACADE_AUTH_IMPORT="$TMP_ROOT/facade-authorization-import.json"
FACADE_AUTH_BINDINGS="$TMP_ROOT/facade-authorization-bindings.json"
FACADE_AUTH_RUNTIME="$TMP_ROOT/facade-authorization-runtime.json"
printf '%s' '[{"id":"chief-agent","companyId":"company-test","urlKey":"chief-of-staff"},{"id":"facade-agent","companyId":"company-test","urlKey":"firm-facade-recorder"}]' \
    >"$FACADE_AUTH_AGENTS"
printf '%s' '{"agents":[{"id":"chief-agent","slug":"chief-of-staff"},{"id":"facade-agent","slug":"firm-facade-recorder"}]}' \
    >"$FACADE_AUTH_IMPORT"
"$AUTHORIZATION_HELPER" \
    --import-response "$FACADE_AUTH_IMPORT" --company-id company-test \
    --catalog-root "$REPO_ROOT/companies/legal-operations/agents" \
    --output "$FACADE_AUTH_BINDINGS"
"$AUTHORIZATION_HELPER" \
    --template "$REPO_ROOT/companies/legal-operations/gate-authorization.json" \
    --bindings "$FACADE_AUTH_BINDINGS" --agents "$FACADE_AUTH_AGENTS" \
    --company-id company-test \
    --catalog-root "$REPO_ROOT/companies/legal-operations/agents" \
    --output "$FACADE_AUTH_RUNTIME"
python3 - "$FACADE_AUTH_RUNTIME" <<'PY'
import json, sys
grants = json.load(open(sys.argv[1]))["grants"]
assert grants == {"facade-agent": ["receipts:facade"]}, grants
assert "chief-agent" not in grants
PY
printf '%s' '[{"id":"a-1","adapterConfig":{"env":{"GATE_PROXY_URL":"http://127.0.0.1:3801","BETTER_AUTH_SECRET":"","PAPERCLIP_SECRETS_MASTER_KEY":"","PAPERCLIP_SECRETS_MASTER_KEY_FILE":""}}}]' \
    | "$AGENTS_HELPER" --require-gate-url http://127.0.0.1:3801 --require-production-secret-scrub >/dev/null
if printf '%s' '[{"id":"a-1","adapterConfig":{"env":{"GATE_PROXY_URL":"http://127.0.0.1:3801","BETTER_AUTH_SECRET":"leaked"}}}]' \
        | "$AGENTS_HELPER" --require-gate-url http://127.0.0.1:3801 --require-production-secret-scrub >/dev/null 2>&1; then
    fail "agent without production secret overrides was accepted"
fi

GATE_READY_HELPER="$REPO_ROOT/bin/_possiblaw_gate_ready.py"
[ -x "$GATE_READY_HELPER" ] || fail "gate readiness attestation validator must exist and be executable"
READY_COMPANY="company-test"
READY_POLICY="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
READY_INSTANCE="123e4567-e89b-42d3-a456-426614174000"
READY_SECRET="startup-secret-value-with-32-bytes"
READY_PROOF="$(python3 -c 'import hashlib,hmac,sys; print(hmac.new(sys.argv[1].encode(), "\n".join(sys.argv[2:]).encode(), hashlib.sha256).hexdigest())' \
    "$READY_SECRET" "$READY_INSTANCE" "$READY_COMPANY" "$READY_POLICY")"
printf '%s' "{\"ok\":true,\"receipts\":\"ready\",\"paperclip\":\"ready\",\"instanceId\":\"$READY_INSTANCE\",\"companyId\":\"$READY_COMPANY\",\"policyDigest\":\"$READY_POLICY\",\"startupProof\":\"$READY_PROOF\"}" \
    | env POSSIBLAW_GATE_STARTUP_SECRET="$READY_SECRET" "$GATE_READY_HELPER" \
        --company-id "$READY_COMPANY" --policy-digest "$READY_POLICY" \
        --instance-id "$READY_INSTANCE" >/dev/null
if printf '%s' "{\"ok\":true,\"receipts\":\"ready\",\"paperclip\":\"ready\",\"instanceId\":\"$READY_INSTANCE\",\"companyId\":\"$READY_COMPANY\",\"policyDigest\":\"$READY_POLICY\",\"startupProof\":\"$READY_PROOF\"}" \
        | env POSSIBLAW_GATE_STARTUP_SECRET="wrong-startup-secret-with-32-bytes" \
            "$GATE_READY_HELPER" --company-id "$READY_COMPANY" \
            --policy-digest "$READY_POLICY" --instance-id "$READY_INSTANCE" >/dev/null 2>&1; then
    fail "forged gate readiness proof was accepted"
fi
if printf '%s' "{\"ok\":true,\"receipts\":\"ready\",\"paperclip\":\"ready\",\"instanceId\":\"$READY_INSTANCE\",\"companyId\":\"wrong-company\",\"policyDigest\":\"$READY_POLICY\",\"startupProof\":\"$READY_PROOF\"}" \
        | env POSSIBLAW_GATE_STARTUP_SECRET="$READY_SECRET" "$GATE_READY_HELPER" \
            --company-id "$READY_COMPANY" --policy-digest "$READY_POLICY" \
            --instance-id "$READY_INSTANCE" >/dev/null 2>&1; then
    fail "wrong-company gate readiness was accepted"
fi

IMPORT_SAFETY_HELPER="$REPO_ROOT/bin/_possiblaw_import_safety.py"
[ -x "$IMPORT_SAFETY_HELPER" ] || fail "production import-safety helper must exist and be executable"
INLINE_FIXTURE="$TMP_ROOT/inline-fixture.json"
printf '%s' '{"source":{"files":{"projects/x/tasks/y/TASK.md":"---\nname: Y\nrecurring: true\n---\nBody","README.md":"recurring: true"}}}' > "$INLINE_FIXTURE"
"$IMPORT_SAFETY_HELPER" --suspend-recurring "$INLINE_FIXTURE"
python3 - "$INLINE_FIXTURE" <<'PY'
import json, sys
files = json.load(open(sys.argv[1]))["source"]["files"]
assert "recurring: false" in files["projects/x/tasks/y/TASK.md"]
assert files["README.md"] == "recurring: true"
PY

# A production caller's permissive umask must be narrowed before any
# launcher-owned state is created.
MODE_DIR="$TMP_ROOT/mode-data"
mkdir -p "$MODE_DIR"
chmod 700 "$MODE_DIR"
assert_file_mode "$MODE_DIR" 700

# The launcher can bootstrap a dedicated company-scoped gate key using its
# board credential without printing the one-time token.
KEY_STUB_BIN="$TMP_ROOT/key-stub-bin"
KEY_ROOT="$TMP_ROOT/key-root"
mkdir -p "$KEY_STUB_BIN" "$KEY_ROOT"
cat >"$KEY_STUB_BIN/curl" <<'SH'
#!/usr/bin/env bash
output=""
authorized="false"
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    [ "${args[$i]}" = "--output" ] && output="${args[$((i+1))]}"
    [ "${args[$i]}" = "Authorization: Bearer board-test-key" ] && authorized="true"
done
[ "$authorized" = "true" ] || exit 90
case "${*: -1}" in
    */keys)
        printf '%s' '{"token":"gate-test-key"}' > "$output"
        printf '201'
        ;;
    *) exit 91 ;;
esac
SH
chmod +x "$KEY_STUB_BIN/curl"
printf '%s' '{"agents":[{"id":"agent-1","slug":"chief-of-staff"}]}' > "$KEY_ROOT/import.json"
KEY_HARNESS="$KEY_ROOT/harness.sh"
cat >"$KEY_HARNESS" <<SH
#!/usr/bin/env bash
set -euo pipefail
PRODUCTION=true
API_BASE=http://127.0.0.1:39191
AUTH_ARGS=(--header 'Authorization: Bearer board-test-key')
log() { printf '[test] %s\n' "\$*"; }
err() { printf '[test][error] %s\n' "\$*" >&2; }
SH
sed -n '/^GATE_RUNTIME_API_KEY=""$/,/^# Start one gate proxy/p' "$LAUNCHER" | sed '$d' >> "$KEY_HARNESS"
cat >>"$KEY_HARNESS" <<'SH'
ensure_gate_api_key company-1 "$1" "$2" firm ""
[ "$GATE_RUNTIME_API_KEY" = "gate-test-key" ]
[ "$GATE_RUNTIME_AGENT_ID" = "agent-1" ]
[ "$(cat "$2")" = "gate-test-key" ]
[ "$(cat "$2.agent-id")" = "agent-1" ]
SH
chmod +x "$KEY_HARNESS"
KEY_OUT="$KEY_ROOT/key.out"
run_expect_status 0 "$KEY_OUT" env PATH="$KEY_STUB_BIN:$PATH" \
    "$KEY_HARNESS" "$KEY_ROOT/import.json" "$KEY_ROOT/gate.api-key"
assert_not_contains "$(cat "$KEY_OUT")" "gate-test-key"
assert_file_mode "$KEY_ROOT/gate.api-key" 600
assert_file_mode "$KEY_ROOT/gate.api-key.agent-id" 600

# The firm facade receives a key minted only on its service identity. A
# chief-of-staff entry cannot be used as a fallback when that identity is
# absent, because that would grant the chief facade-receipt authority.
FACADE_STUB_BIN="$TMP_ROOT/facade-stub-bin"
FACADE_ROOT="$TMP_ROOT/facade-root"
mkdir -p "$FACADE_STUB_BIN" "$FACADE_ROOT"
cat >"$FACADE_STUB_BIN/curl" <<'SH'
#!/usr/bin/env bash
output=""
authorized="false"
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    [ "${args[$i]}" = "--output" ] && output="${args[$((i+1))]}"
    [ "${args[$i]}" = "Authorization: Bearer board-test-key" ] && authorized="true"
done
[ "$authorized" = "true" ] || exit 90
printf '%s\n' "${*: -1}" >"${POSSIBLAW_TEST_FACADE_URL:?}"
printf '%s' '{"token":"facade-test-key"}' >"$output"
printf '201'
SH
chmod +x "$FACADE_STUB_BIN/curl"
printf '%s' '{"agents":[{"id":"chief-agent","slug":"chief-of-staff"},{"id":"facade-agent","slug":"firm-facade-recorder"}]}' \
    >"$FACADE_ROOT/import.json"
printf '%s' '{"agents":[{"id":"chief-agent","slug":"chief-of-staff"}]}' \
    >"$FACADE_ROOT/import-without-service.json"
FACADE_HARNESS="$FACADE_ROOT/harness.sh"
cat >"$FACADE_HARNESS" <<SH
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT='$REPO_ROOT'
API_BASE=http://127.0.0.1:39191
AUTH_ARGS=(--header 'Authorization: Bearer board-test-key')
log() { printf '[test] %s\n' "\$*"; }
warn() { printf '[test][warn] %s\n' "\$*" >&2; }
milestone() { log "\$*"; }
SH
sed -n '/^emit_facade_config()/,/^# --list-variants short-circuit/p' "$LAUNCHER" \
    >>"$FACADE_HARNESS"
cat >>"$FACADE_HARNESS" <<'SH'
emit_facade_config company-1 "$1" http://127.0.0.1:39192 "$2" ACM
SH
chmod +x "$FACADE_HARNESS"
FACADE_OUT="$FACADE_ROOT/facade.out"
run_expect_status 0 "$FACADE_OUT" env PATH="$FACADE_STUB_BIN:$PATH" \
    POSSIBLAW_TEST_FACADE_URL="$FACADE_ROOT/mint.url" \
    "$FACADE_HARNESS" "$FACADE_ROOT/import.json" "$FACADE_ROOT/config.json"
[ "$(cat "$FACADE_ROOT/mint.url")" = "http://127.0.0.1:39191/api/agents/facade-agent/keys" ] || \
    fail "firm facade key was not minted on the dedicated service identity"
python3 - "$FACADE_ROOT/config.json" <<'PY'
import json, sys
env = json.load(open(sys.argv[1]))["mcpServers"]["possiblaw-firm-facade"]["env"]
assert env["PAPERCLIP_API_KEY"] == "facade-test-key"
PY
rm -f "$FACADE_ROOT/mint.url"
run_expect_status 0 "$FACADE_ROOT/missing-service.out" \
    env PATH="$FACADE_STUB_BIN:$PATH" \
        POSSIBLAW_TEST_FACADE_URL="$FACADE_ROOT/mint.url" \
        "$FACADE_HARNESS" "$FACADE_ROOT/import-without-service.json" \
        "$FACADE_ROOT/config-without-service.json"
[ ! -e "$FACADE_ROOT/mint.url" ] || \
    fail "firm facade fell back to another agent when its service identity was missing"
assert_contains "$(cat "$FACADE_ROOT/missing-service.out")" \
    "refusing to mint a key on another agent"

# Exercise the launcher's real gate-start function in isolation. The fake gate
# emits a credential-shaped sentinel into its private log and exits. Production
# mode must return failure without copying that log content to the terminal.
GATE_ROOT="$TMP_ROOT/gate-root"
GATE_STUB_BIN="$TMP_ROOT/gate-stub-bin"
mkdir -p "$GATE_ROOT/gate-proxy/node_modules" "$GATE_ROOT/bin" "$GATE_STUB_BIN" "$TMP_ROOT/home" \
    "$GATE_ROOT/companies/legal-operations/agents"
cp "$WALLS_HELPER" "$GATE_ROOT/bin/_possiblaw_walls.py"
cp "$AUTHORIZATION_HELPER" "$GATE_ROOT/bin/_possiblaw_authorization.py"
mkdir -p "$GATE_ROOT/companies/legal-operations"
cp "$REPO_ROOT/companies/legal-operations/gate-authorization.json" \
    "$GATE_ROOT/companies/legal-operations/gate-authorization.json"
for slug in correspondence-clerk deadline-calculator deliverables-courier firm-facade-recorder legal-citation-checker; do
    mkdir -p "$GATE_ROOT/companies/legal-operations/agents/$slug"
    printf '%s\n' "---" "slug: $slug" "---" > \
        "$GATE_ROOT/companies/legal-operations/agents/$slug/AGENTS.md"
done
cat >"$GATE_STUB_BIN/lsof" <<'SH'
#!/usr/bin/env bash
exit 0
SH
cat >"$GATE_STUB_BIN/curl" <<'SH'
#!/usr/bin/env bash
output=""
args=("$@")
for ((i=0; i<${#args[@]}; i++)); do
    if [ "${args[$i]}" = "--output" ]; then
        output="${args[$((i+1))]}"
    fi
done
case "${*: -1}" in
    */api/companies/*/agents)
        [ -n "$output" ] && printf '%s' '[{"id":"agent-courier-1","companyId":"company-test","urlKey":"deliverables-courier"}]' > "$output"
        printf '200'
        ;;
    */ready)
        if [ "${POSSIBLAW_TEST_GATE_BEHAVIOR:-}" = "fake-ready" ]; then
            [ -n "$output" ] && printf '%s' '{"ok":true}' > "$output"
            printf '200'
        else
            printf '503'
        fi
        ;;
    */health) printf '200' ;;
    *) printf '503' ;;
esac
exit 0
SH
cat >"$GATE_STUB_BIN/node" <<'SH'
#!/usr/bin/env bash
printf '%064d' 0
SH
cat >"$GATE_STUB_BIN/pnpm" <<'SH'
#!/usr/bin/env bash
printf '%s\n' "${PAPERCLIP_GATE_API_KEY:?}" >&2
if [ "${POSSIBLAW_TEST_GATE_BEHAVIOR:-crash}" = "unhealthy" ] || \
        [ "${POSSIBLAW_TEST_GATE_BEHAVIOR:-crash}" = "fake-ready" ]; then
    exec sleep 5
fi
exit 1
SH
chmod +x "$GATE_STUB_BIN/lsof" "$GATE_STUB_BIN/curl" "$GATE_STUB_BIN/node" "$GATE_STUB_BIN/pnpm"

GATE_HARNESS="$TMP_ROOT/gate-harness.sh"
cat >"$GATE_HARNESS" <<SH
#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT='$GATE_ROOT'
API_BASE='http://127.0.0.1:39191'
GATE_HEALTH_TIMEOUT_SECS=1
PRODUCTION='true'
DATA_CUSTODY_ID='test-custody'
GATE_RECEIPTS_ROOT="\$HOME/gate-receipts"
GATE_RUNTIME_AGENT_ID='agent-test'
GATE_PID_FILES=()
GATE_PID_PORTS=()
LAUNCH_START_EPOCH=0
log() { printf '[test] %s\n' "\$*"; }
warn() { printf '[test][warn] %s\n' "\$*" >&2; }
err() { printf '[test][error] %s\n' "\$*" >&2; }
milestone() { log "\$*"; }
kill_subshell_tree() {
    : > "\$HOME/cleanup.called"
    kill "\$1" 2>/dev/null || true
    wait "\$1" 2>/dev/null || true
}
SH
sed -n '/^GATE_START_ATTEMPTED="false"$/,/^# Firm facade:/p' "$LAUNCHER" \
    | sed '$d' >>"$GATE_HARNESS"
cat >>"$GATE_HARNESS" <<'SH'
EXPECTED_GATE_POLICY_DIGEST="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
printf '%s' '{"agents":[{"id":"agent-courier-1","slug":"deliverables-courier"}]}' > "$HOME/import.json"
python3 "$REPO_ROOT/bin/_possiblaw_authorization.py" \
    --import-response "$HOME/import.json" --company-id company-test \
    --catalog-root "$REPO_ROOT/companies/legal-operations/agents" \
    --output "$HOME/gate.bindings.json"
if start_gate_proxy_for company-test 39192 "$HOME/gate-receipts/test-custody/receipts.jsonl" \
        "$HOME/gate.pid" "$HOME/gate.log" firm; then
    exit 99
fi
[ ! -e "$HOME/gate.pid" ] || exit 98
[ -e "$HOME/cleanup.called" ] || exit 97
exit 0
SH
chmod +x "$GATE_HARNESS"

GATE_OUT="$TMP_ROOT/gate.out"
run_expect_status 0 "$GATE_OUT" env PATH="$GATE_STUB_BIN:$PATH" HOME="$TMP_ROOT/home" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    "$GATE_HARNESS"
GATE_TEXT="$(cat "$GATE_OUT")"
case "$GATE_TEXT" in
    *"gate proxy exited during startup"*|*"gate proxy did not become ready"*) : ;;
    *) fail "expected failed gate startup to be reported without exposing its log" ;;
esac
assert_not_contains "$GATE_TEXT" "$SECRET_SENTINEL"

mkdir -p "$TMP_ROOT/unhealthy-home"
UNHEALTHY_OUT="$TMP_ROOT/unhealthy.out"
run_expect_status 0 "$UNHEALTHY_OUT" env PATH="$GATE_STUB_BIN:$PATH" HOME="$TMP_ROOT/unhealthy-home" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    POSSIBLAW_TEST_GATE_BEHAVIOR=unhealthy \
    "$GATE_HARNESS"
UNHEALTHY_TEXT="$(cat "$UNHEALTHY_OUT")"
assert_contains "$UNHEALTHY_TEXT" "gate proxy did not become ready"
assert_not_contains "$UNHEALTHY_TEXT" "$SECRET_SENTINEL"

mkdir -p "$TMP_ROOT/fake-ready-home"
FAKE_READY_OUT="$TMP_ROOT/fake-ready.out"
run_expect_status 0 "$FAKE_READY_OUT" env PATH="$GATE_STUB_BIN:$PATH" HOME="$TMP_ROOT/fake-ready-home" \
    PAPERCLIP_GATE_API_KEY="$SECRET_SENTINEL" \
    POSSIBLAW_TEST_GATE_BEHAVIOR=fake-ready \
    "$GATE_HARNESS"
FAKE_READY_TEXT="$(cat "$FAKE_READY_OUT")"
assert_contains "$FAKE_READY_TEXT" "readiness attestation did not match"
assert_not_contains "$FAKE_READY_TEXT" "$SECRET_SENTINEL"

# Existing non-production behavior remains available. This path resolves the
# variants and exits without a server, import, or network call.
LOCAL_LIST_OUT="$TMP_ROOT/local-list.out"
run_expect_status 0 "$LOCAL_LIST_OUT" \
    "$LAUNCHER" --auth-mode local_trusted --no-gate-proxy --list-variants
assert_contains "$(cat "$LOCAL_LIST_OUT")" "codex"

printf 'OK: possiblaw production-safety tests passed\n'
