# Matter Isolation A1 + Firm Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Opt-in ethical walls (`--add-wall` = one paperclip company per screened client, each with its own gate proxy/receipts/facade) plus a `firm-overview/` package: a loopback web dashboard merging issues, approvals, and deliveries across every company the viewing lawyer is authorized for, with approve-from-overview as that lawyer.

**Architecture:** Layer-not-fork — the `paperclip/` submodule (pinned `c91a0623`) is never modified. The launcher gains an attach-to-running-instance path that re-drives the existing import→patch→routine→gate→facade sequence per wall, registered in `$DATA_DIR/walls.json`. The overview server holds a per-lawyer `pcp_board_…` bearer token (paperclip CLI-auth flow) in memory and lets paperclip's own authz filter everything.

**Tech Stack:** bash (`bin/possiblaw`), stdlib-only Python helper (`bin/_possiblaw_walls.py`), standalone TypeScript package (`firm-overview/`, node:test + tsx, zero runtime deps beyond tsx/typescript devDeps — same posture as `gate-proxy/`).

**Spec:** `docs/superpowers/specs/2026-07-02-matter-isolation-a1-firm-overview-design.md`. All endpoint/config facts below are spike-verified (S1–S6, 2026-07-02).

## Global Constraints

- `paperclip/` and `harvey-lab/` submodules: NEVER modified, never `git add`ed.
- NEVER kill or bind port 3100 (operator's live server). Disposable tests: `--port 3199 --gate-port 3899 --data-dir "$(mktemp -d)"`.
- macOS: `timeout` is NOT installed — use the Bash tool timeout or `gtimeout`.
- Python helpers: stdlib-only, argparse, assert-based `_self_test() -> int` printing `OK: …`, `raise SystemExit(main(sys.argv[1:]))` guard.
- TypeScript packages: node:test, `tsc --noEmit` clean, no new runtime dependencies.
- TDD: write the failing test first in every task.
- Parallel implementers (operator authorized, max 5): ONLY on disjoint file sets; the controller does all git. Waves: W1 = Task 1 ∥ Task 5 · W2 = Task 2 ∥ Task 6 ∥ Task 7 · W3 = Task 3 ∥ Task 8 · W4 = Task 4 ∥ Task 9 · W5 = Task 10 (controller only).
- Never commit `.agent/*`, `.claude/history.md`, `walls.json`, or any `$DATA_DIR` artifact.
- CHANGELOG entry for this work: `[0.38.0]`.

## Verified facts referenced by tasks (do not re-derive)

- Deployment mode env: `PAPERCLIP_DEPLOYMENT_MODE` ∈ {`local_trusted`,`authenticated`}, default `local_trusted` (`paperclip/server/src/config.ts:160-165`). Authenticated boot hard-requires `BETTER_AUTH_SECRET` (`paperclip/server/src/auth/better-auth.ts:95-101`). Migrating a formerly-local_trusted data dir to authenticated prints a one-time BOARD CLAIM url on the server console (`paperclip/server/src/index.ts:879-893`); claiming promotes that user to instance admin with owner membership on all companies (`paperclip/server/src/board-claim.ts:85-149`).
- User token: `POST /api/cli-auth/challenges` (unauthenticated) → `{id, token, boardApiToken, approvalUrl, pollPath}`; human approves at `approvalUrl`; token becomes a live board API key `pcp_board_<48hex>`, TTL 30 days, presented as `Authorization: Bearer …` (`paperclip/server/src/routes/access.ts:2502-2602`, `services/board-auth.ts:14,186,281-294`). Poll: `GET /api/cli-auth/challenges/:id?token=<challengeToken>`. Works in BOTH modes; on local_trusted a valid board key OVERRIDES implicit board and scopes to the user's memberships (`middleware/auth.ts:103-128`).
- Companies list is membership-filtered for non-admin users (`routes/companies.ts:91-100`); response rows carry `issuePrefix` (`services/companies.ts:44`).
- Issues: `GET /api/companies/:id/issues?status=a,b&limit=N&sortField=updated&sortDir=desc` → bare array; rows carry `id,title,status,priority,assigneeAgentId,identifier,updatedAt` (NO agent name — join via `GET /api/companies/:id/agents`). In-flight statuses: `backlog,todo,in_progress,in_review,blocked` (`routes/issues.ts:1779-1908`).
- Approvals: list `GET /api/companies/:id/approvals?status=…` (`routes/approvals.ts:52-58`); pending = `pending` + `revision_requested`. Decide: `POST /api/approvals/:id/approve|reject` body `{decisionNote?}`; guarded by `assertBoard` (agents 403) + active non-viewer membership (`routes/approvals.ts:136-255`, `routes/authz.ts:10-64`).
- Aggregate tiles: `GET /api/companies/:id/dashboard` → `{agents,tasks,costs,pendingApprovals,runActivity}` (`routes/dashboard.ts:10`).
- Work products: per-issue only — `GET /api/issues/:id/work-products`, rows carry `type,title,status,url,createdAt,issueId` (`routes/issues.ts:2407`).
- Deep links: `/:companyPrefix/issues/:identifier` (case-insensitive prefix; `paperclip/ui/src/App.tsx:324,108`), approvals page `/:companyPrefix/approvals`.
- Launcher: import body build is pure & re-invokable (`bin/possiblaw:1519-1532`; `target.mode=new_company`, `newCompanyName=$ORG_NAME`); `COMPANY_ID` parsed from `$IMPORT_RESPONSE_FILE` (`:1642`); per-agent env PATCH `PATCH /api/agents/:id` (`:1981-2011`); routine provisioning `provision_intake_routine()` (`:1715-1801`, currently global-based); gate-proxy start block (`:1807-1885`, env at `:1845-1854`); facade block (`:2026-2200`, key mint `POST /api/agents/:id/keys` at `:2073-2088`, output `$DATA_DIR/firm-facade-mcp.json` at `:2103`); arg parser (`:325-354`); `--list-variants` early-exit precedent (`:443-479`, exit at `:478`); NO attach-to-running-server path exists today; launcher curls carry no auth header (fine on local_trusted loopback).
- Gate proxy env contract (`gate-proxy/src/index.ts:26-46`): `GATE_PROXY_PORT`, `GATE_POLICY_PATH`, `GATE_RECEIPTS_PATH`, `PAPERCLIP_BASE_URL`, `PAPERCLIP_COMPANY_ID`. Core is NOT modified by this plan.

## File Structure

```
bin/_possiblaw_walls.py            NEW  prefix derivation/collision, walls.json ops, port alloc, --self-test
bin/possiblaw                      MOD  start_gate_proxy_for(), --add-wall, wall re-wiring on restart,
                                        --auth-mode, --api-key, per-wall facade filename, firm-overview note
firm-overview/package.json         NEW  scripts: test, typecheck, start
firm-overview/tsconfig.json        NEW  (copy gate-proxy compiler options)
firm-overview/src/paperclip.ts     NEW  typed fetch client, token-optional
firm-overview/src/merge.ts         NEW  ClientBoard/FirmBoard pure builders
firm-overview/src/auth.ts          NEW  CLI-auth connect driver + in-memory token store
firm-overview/src/server.ts        NEW  loopback HTTP server: page + JSON API + decide proxy
firm-overview/src/page.ts          NEW  renderPage(): single-file HTML/CSS/JS string
firm-overview/src/index.ts         NEW  env wiring + start
firm-overview/src/*.test.ts        NEW  node:test per module
docs/workflows/ethical-walls.md    NEW  runbook (walls, auth mode, invites, overview connect)
docs/operator-walkthrough.md       MOD  walls + overview section
docs/known-limitations.md          MOD  read-scope rewrite + overview loopback-trust note
README.md                          MOD  feature rows
CHANGELOG.md                       MOD  [0.38.0]
CLAUDE.md                          MOD  code map + commands
```

---

### Task 1: `bin/_possiblaw_walls.py` — walls helper (prefix, registry, ports)

**Files:**
- Create: `bin/_possiblaw_walls.py`
- Modify: none

**Interfaces (Produces — Task 2/3/4 shell out to these exact CLI forms):**
- `python3 bin/_possiblaw_walls.py --derive-prefix "Acme Litigation"` → stdout `ACM`, exit 0. Fewer than 3 A–Z letters → stderr message, exit 2.
- `python3 bin/_possiblaw_walls.py --check-collision --name "<org>" --companies-json <file>` → stdout prefix, exit 0 if free; stderr `prefix collision: <PREFIX> already used by company "<name>"`, exit 3 if taken. `<file>` holds the raw `GET /api/companies` JSON array (each row has `issuePrefix`, `name`).
- `python3 bin/_possiblaw_walls.py --registry <path> --add` with a single JSON object on stdin `{"name":…,"companyId":…,"prefix":…,"gatePort":…,"receiptsPath":…,"facadeConfig":…,"status":"active","createdAt":…}` → upserts by `prefix`, writes the registry (a JSON array) with mode 0600, prints the updated array.
- `python3 bin/_possiblaw_walls.py --registry <path> --list` → prints the array (missing/corrupt file → `[]`, exit 0; corrupt additionally warns on stderr).
- `python3 bin/_possiblaw_walls.py --alloc-gate-port --registry <path> --base 3801` → stdout the smallest port > base not present as any wall's `gatePort`. (Actual bind-availability is re-checked in bash with `lsof`, same as the existing `:1826` check.)
- `python3 bin/_possiblaw_walls.py --self-test` → `OK: _possiblaw_walls self-test passed`, exit 0.

- [ ] **Step 1: Write the helper with `_self_test()` first (failing by construction until functions exist)**

Create `bin/_possiblaw_walls.py`:

```python
#!/usr/bin/env python3
"""Walls registry helper for bin/possiblaw --add-wall. Stdlib-only.

The registry ($DATA_DIR/walls.json) is a JSON array of wall records:
  {name, companyId, prefix, gatePort, receiptsPath, facadeConfig, status, createdAt}
It is a CACHE of wall wiring; GET /api/companies is the source of truth.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import tempfile


def derive_prefix(org_name: str) -> str:
    letters = re.sub(r"[^A-Za-z]", "", org_name).upper()
    if len(letters) < 3:
        raise ValueError(
            f"cannot derive a 3-letter issue prefix from {org_name!r}; "
            "use a client name with at least three A-Z letters"
        )
    return letters[:3]


def check_collision(org_name: str, companies: list) -> str:
    prefix = derive_prefix(org_name)
    for c in companies:
        existing = (c.get("issuePrefix") or "").upper()
        if existing == prefix:
            raise LookupError(
                f"prefix collision: {prefix} already used by company "
                f"\"{c.get('name', '?')}\""
            )
    return prefix


def load_registry(path: str) -> list:
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError) as exc:
        print(f"warning: walls registry unreadable ({exc}); treating as empty", file=sys.stderr)
        return []


def upsert_wall(registry: list, record: dict) -> list:
    required = {"name", "companyId", "prefix", "gatePort", "receiptsPath", "status"}
    missing = required - set(record)
    if missing:
        raise ValueError(f"wall record missing fields: {sorted(missing)}")
    out = [w for w in registry if w.get("prefix") != record["prefix"]]
    out.append(record)
    out.sort(key=lambda w: w.get("createdAt") or "")
    return out


def write_registry(path: str, registry: list) -> None:
    dirname = os.path.dirname(path) or "."
    fd, tmp = tempfile.mkstemp(dir=dirname, prefix=".walls-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(registry, fh, indent=2)
            fh.write("\n")
        os.chmod(tmp, 0o600)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def alloc_gate_port(registry: list, base: int) -> int:
    used = {w.get("gatePort") for w in registry}
    port = base + 1
    while port in used:
        port += 1
    return port


def _self_test() -> int:
    assert derive_prefix("Acme Litigation") == "ACM"
    assert derive_prefix("a-c-m-e") == "ACM"
    try:
        derive_prefix("A1")
        raise AssertionError("short name must raise")
    except ValueError:
        pass

    companies = [{"name": "PossibLaw Legal Operations", "issuePrefix": "POS"}]
    assert check_collision("Acme Litigation", companies) == "ACM"
    try:
        check_collision("Possible Corp", companies)  # POS collides
        raise AssertionError("collision must raise")
    except LookupError as exc:
        assert "POS" in str(exc) and "PossibLaw" in str(exc)

    rec = {
        "name": "Acme Litigation", "companyId": "c-1", "prefix": "ACM",
        "gatePort": 3802, "receiptsPath": "/tmp/r.jsonl",
        "facadeConfig": None, "status": "active", "createdAt": "2026-07-02T00:00:00Z",
    }
    reg = upsert_wall([], rec)
    assert len(reg) == 1
    reg = upsert_wall(reg, {**rec, "gatePort": 3803})  # upsert by prefix
    assert len(reg) == 1 and reg[0]["gatePort"] == 3803
    try:
        upsert_wall([], {"name": "x"})
        raise AssertionError("missing fields must raise")
    except ValueError:
        pass

    assert alloc_gate_port([], 3801) == 3802
    assert alloc_gate_port(reg, 3801) == 3802  # 3803 used, 3802 free
    assert alloc_gate_port([{"gatePort": 3802}, {"gatePort": 3803}], 3801) == 3804

    with tempfile.TemporaryDirectory() as td:
        path = os.path.join(td, "walls.json")
        assert load_registry(path) == []
        write_registry(path, reg)
        assert oct(os.stat(path).st_mode & 0o777) == "0o600"
        assert load_registry(path)[0]["prefix"] == "ACM"
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("{corrupt")
        assert load_registry(path) == []

    print("OK: _possiblaw_walls self-test passed")
    return 0


def main(argv: list) -> int:
    parser = argparse.ArgumentParser(description="walls registry helper")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--derive-prefix", metavar="NAME")
    parser.add_argument("--check-collision", action="store_true")
    parser.add_argument("--name")
    parser.add_argument("--companies-json")
    parser.add_argument("--registry")
    parser.add_argument("--add", action="store_true")
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--alloc-gate-port", action="store_true")
    parser.add_argument("--base", type=int, default=3801)
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()
    try:
        if args.derive_prefix is not None:
            print(derive_prefix(args.derive_prefix))
            return 0
        if args.check_collision:
            if not args.name or not args.companies_json:
                print("--check-collision requires --name and --companies-json", file=sys.stderr)
                return 2
            with open(args.companies_json, "r", encoding="utf-8") as fh:
                companies = json.load(fh)
            print(check_collision(args.name, companies))
            return 0
        if args.registry and args.add:
            record = json.load(sys.stdin)
            registry = upsert_wall(load_registry(args.registry), record)
            write_registry(args.registry, registry)
            print(json.dumps(registry, indent=2))
            return 0
        if args.registry and args.list:
            print(json.dumps(load_registry(args.registry), indent=2))
            return 0
        if args.alloc_gate_port:
            if not args.registry:
                print("--alloc-gate-port requires --registry", file=sys.stderr)
                return 2
            print(alloc_gate_port(load_registry(args.registry), args.base))
            return 0
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except LookupError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    parser.print_usage(file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

- [ ] **Step 2: Run the self-test**

Run: `python3 bin/_possiblaw_walls.py --self-test`
Expected: `OK: _possiblaw_walls self-test passed`, exit 0.

- [ ] **Step 3: Exercise the CLI forms manually**

```bash
python3 bin/_possiblaw_walls.py --derive-prefix "Acme Litigation"          # ACM
python3 bin/_possiblaw_walls.py --derive-prefix "A1"; echo "exit=$?"       # exit=2
T=$(mktemp -d)
printf '[{"name":"Main","issuePrefix":"POS"}]' > "$T/companies.json"
python3 bin/_possiblaw_walls.py --check-collision --name "Possible Corp" --companies-json "$T/companies.json"; echo "exit=$?"  # exit=3
printf '{"name":"Acme","companyId":"c1","prefix":"ACM","gatePort":3802,"receiptsPath":"/tmp/r","facadeConfig":null,"status":"active","createdAt":"2026-07-02T00:00:00Z"}' \
  | python3 bin/_possiblaw_walls.py --registry "$T/walls.json" --add
python3 bin/_possiblaw_walls.py --alloc-gate-port --registry "$T/walls.json" --base 3801   # 3803
rm -rf "$T"
```

- [ ] **Step 4: Commit**

```bash
git add bin/_possiblaw_walls.py
git commit -m "feat(launcher): walls helper — prefix preflight, walls.json registry, gate-port allocation"
```

---

### Task 2: Launcher — extract `start_gate_proxy_for()` (pure refactor, behavior identical)

**Files:**
- Modify: `bin/possiblaw` (gate-proxy block `:1807-1885`, definitions `:1188-1191`, `kill_gate_proxy_tree` `:1243-1249`)

**Interfaces:**
- Produces (bash function, used verbatim by Tasks 3 & 4):
  `start_gate_proxy_for <company_id> <gate_port> <receipts_path> <pid_file> <log_file> <label>` — starts one gate proxy, health-polls `http://127.0.0.1:<gate_port>/health` for `GATE_HEALTH_TIMEOUT_SECS`, swaps in the listener PID, appends the PID file path to the global array `GATE_PID_FILES` (for signal cleanup). Returns 0 even when unhealthy (warn-only, matching today).
- Consumes: existing globals `REPO_ROOT`, `API_BASE`, `GATE_HEALTH_TIMEOUT_SECS`, `EGRESS_*` inheritance behavior.

- [ ] **Step 1: Capture the regression baseline**

```bash
bash -n bin/possiblaw
./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "smoke test" | tail -5
```
Expected: syntax OK; dry-run plan summary `warnings=0 errors=0`. Record the exact summary line — it must be identical after the refactor.

- [ ] **Step 2: Extract the function**

In `bin/possiblaw`, above the current gate block, add:

```bash
# Start one gate proxy bound to a single company. Args:
#   $1 company_id  $2 gate_port  $3 receipts_path  $4 pid_file  $5 log_file  $6 label
# Mirrors the original single-company block; warn-only on failure so a wall
# never aborts the firm launch.
GATE_PID_FILES=()
start_gate_proxy_for() {
    local company_id="$1" gate_port="$2" receipts_path="$3" pid_file="$4" log_file="$5" label="$6"
    if [ -n "$(lsof -nP -iTCP:"$gate_port" -sTCP:LISTEN -t 2>/dev/null || true)" ]; then
        warn "[$label] port $gate_port is already in use; skipping gate-proxy start"
        return 0
    fi
    if [ ! -d "$REPO_ROOT/gate-proxy/node_modules" ]; then
        milestone "installing gate-proxy dependencies (first run)"
        if ! pnpm -C "$REPO_ROOT/gate-proxy" install >>"$log_file" 2>&1; then
            warn "[$label] gate-proxy dependency install failed (log: $log_file); continuing without it"
            return 0
        fi
    fi
    : > "$log_file"
    milestone "[$label] starting gate proxy on http://127.0.0.1:$gate_port (log: $log_file)"
    (
        exec env \
            GATE_PROXY_PORT="$gate_port" \
            GATE_POLICY_PATH="$REPO_ROOT/companies/legal-operations/gate-policy.yaml" \
            GATE_RECEIPTS_PATH="$receipts_path" \
            PAPERCLIP_BASE_URL="$API_BASE" \
            PAPERCLIP_COMPANY_ID="$company_id" \
            GATE_ACTION_PACKAGE_DIR="$HOME/.possiblaw/action-packages" \
            pnpm -C "$REPO_ROOT/gate-proxy" start
    ) >>"$log_file" 2>&1 &
    echo "$!" > "$pid_file"
    GATE_PID_FILES+=("$pid_file")
    local healthy="false" waited=0 code
    while [ "$waited" -lt "$GATE_HEALTH_TIMEOUT_SECS" ]; do
        code="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 2 "http://127.0.0.1:$gate_port/health" || true)"
        if [ "$code" = "200" ]; then healthy="true"; break; fi
        sleep 1; waited=$((waited + 1))
    done
    if [ "$healthy" = "true" ]; then
        local listener_pid
        listener_pid="$(lsof -nP -iTCP:"$gate_port" -sTCP:LISTEN -t 2>/dev/null | head -n 1 || true)"
        [ -n "$listener_pid" ] && echo "$listener_pid" > "$pid_file"
        milestone "[$label] gate proxy healthy at http://127.0.0.1:$gate_port (receipts: $receipts_path)"
    else
        warn "[$label] gate proxy not healthy after ${GATE_HEALTH_TIMEOUT_SECS}s — continuing; gate-dependent skills will fail visibly"
    fi
    return 0
}
```

Then replace the body of the original single-company branch (the `else` arm that today installs deps, truncates the log, spawns the subshell at `:1832-1885`) with:

```bash
    start_gate_proxy_for "$COMPANY_ID" "$GATE_PORT" "$GATE_RECEIPTS_PATH" "$GATE_PID_FILE" "$GATE_LOG" "firm"
    GATE_PROXY_PID="$(cat "$GATE_PID_FILE" 2>/dev/null || true)"
```

Keep the surrounding guard chain (`--no-gate-proxy` / empty `$COMPANY_ID`) exactly as is; DELETE the now-duplicated port-in-use `elif` (the function handles it). Update `kill_gate_proxy_tree` to also sweep `GATE_PID_FILES`:

```bash
kill_gate_proxy_tree() {
    local pf pid
    for pf in "${GATE_PID_FILES[@]:-}"; do
        [ -f "$pf" ] || continue
        pid="$(cat "$pf" 2>/dev/null || true)"
        [ -n "$pid" ] && kill_subshell_tree "$pid" "" || true
        rm -f "$pf"
    done
}
```

(Preserve the existing `kill_subshell_tree` port-sweep second arg where the port is known — pass the port by pairing arrays if trivial; otherwise the pgrep tree-kill alone is sufficient and matches the function's existing fallback behavior.)

- [ ] **Step 3: Verify regression baseline is unchanged**

```bash
bash -n bin/possiblaw
python3 bin/_possiblaw_variants.py --self-test && python3 bin/_possiblaw_inline_source.py --self-test
./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "smoke test" | tail -5
```
Expected: identical dry-run summary to Step 1; all self-tests OK.

- [ ] **Step 4: Live single-company smoke (disposable)**

```bash
DD="$(mktemp -d)"
./bin/possiblaw --variant codex --non-interactive --yes --mission "gate refactor smoke" \
  --port 3199 --gate-port 3899 --data-dir "$DD" &
# wait for health, then:
curl -s http://127.0.0.1:3899/health   # expect 200 JSON
# stop the launcher (SIGINT), confirm the gate proxy died with it, rm -rf "$DD"
```
Expected: gate proxy healthy on 3899; clean teardown; port 3100 untouched.

- [ ] **Step 5: Commit**

```bash
git add bin/possiblaw
git commit -m "refactor(launcher): extract start_gate_proxy_for() — parameterized per-company gate start, behavior unchanged"
```

---

### Task 3: Launcher — `--add-wall` attach path + per-wall facade config

**Files:**
- Modify: `bin/possiblaw` (arg parser `:325-354`, usage text `:92-180`, new early block after the `--list-variants` block `:443-479`)

**Interfaces:**
- Consumes: Task 1 CLI forms; Task 2 `start_gate_proxy_for`.
- Produces: `./bin/possiblaw --add-wall "<Client Name>" [--port N] [--data-dir PATH] [--gate-port-base N] [--api-key KEY] [--variant V] [--firm-facade] [--no-routines]` — attaches to a RUNNING instance, imports a walled company, wires it, records it in `$DATA_DIR/walls.json`, prints a summary, exits 0. Exit 2 on bad input, 3 on prefix collision, 4 when no running server is found.

- [ ] **Step 1: Parser + usage**

Add to the defaults block (`:299-323`): `ADD_WALL=""`, `API_KEY=""`, `GATE_PORT_BASE="$DEFAULT_GATE_PORT"`. Add to the `case` parser:

```bash
        --add-wall) [ "$#" -ge 2 ] || { err "--add-wall requires a client name"; exit 2; }; ADD_WALL="$2"; shift 2 ;;
        --api-key) [ "$#" -ge 2 ] || { err "--api-key requires a value"; exit 2; }; API_KEY="$2"; shift 2 ;;
        --gate-port-base) [ "$#" -ge 2 ] || { err "--gate-port-base requires a value"; exit 2; }; GATE_PORT_BASE="$2"; shift 2 ;;
```

Usage additions:

```
  --add-wall <client>   Add an ethically-walled client to a RUNNING firm:
                        imports the full package as a new company, starts a
                        dedicated gate proxy, emits a per-wall facade config,
                        and records the wall in <data-dir>/walls.json.
  --api-key <key>       Bearer token for --add-wall against an authenticated
                        instance (pcp_board_… from the CLI-auth flow).
  --gate-port-base <n>  Wall gate ports are allocated upward from this base
                        (default: $DEFAULT_GATE_PORT).
```

- [ ] **Step 2: The `--add-wall` early-exit block**

Insert AFTER the `--list-variants` block (follow its shape: runs before any server start, ends `exit`). `AUTH_ARGS` is a bash array used on every curl in this block.

```bash
if [ -n "$ADD_WALL" ]; then
    API_BASE="http://127.0.0.1:$PORT"
    WALLS_PY="$REPO_ROOT/bin/_possiblaw_walls.py"
    WALLS_REGISTRY="$DATA_DIR/walls.json"
    AUTH_ARGS=()
    [ -n "$API_KEY" ] && AUTH_ARGS=(--header "Authorization: Bearer $API_KEY")

    # 1. Running-instance check (net-new; nothing like it exists today).
    HEALTH_CODE="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 3 "$API_BASE/api/health" || true)"
    if [ "$HEALTH_CODE" != "200" ]; then
        err "--add-wall needs a running instance at $API_BASE (health returned '$HEALTH_CODE')"
        err "start the firm first: ./bin/possiblaw --port $PORT --data-dir $DATA_DIR ..."
        exit 4
    fi

    # 2. Prefix preflight against live companies.
    COMPANIES_FILE="$(mktemp)"
    curl --silent --max-time 10 "${AUTH_ARGS[@]}" "$API_BASE/api/companies" > "$COMPANIES_FILE"
    if ! WALL_PREFIX="$(python3 "$WALLS_PY" --check-collision --name "$ADD_WALL" --companies-json "$COMPANIES_FILE")"; then
        rm -f "$COMPANIES_FILE"; exit 3
    fi
    rm -f "$COMPANIES_FILE"
    milestone "wall prefix: $WALL_PREFIX"

    # 3. Import the walled company (reuse the existing body build with ORG_NAME=<client>,
    #    but per-wall response files so the firm's artifacts are never clobbered).
    ORG_NAME="$ADD_WALL"
    IMPORT_RESPONSE_FILE="$DATA_DIR/possiblaw-wall-$WALL_PREFIX-import.response"
    # ... invoke the same INLINE_FILE/OVERRIDES_FILE/BODY_FILE build as the main
    # path (:1480-1532) and POST "$API_BASE/api/companies/import" with
    # "${AUTH_ARGS[@]}", writing to the per-wall response file. Reject on any
    # warnings/errors in the response, same as the main path.
    WALL_COMPANY_ID="$(json_get_str company.id < "$IMPORT_RESPONSE_FILE")"
    [ -n "$WALL_COMPANY_ID" ] || { err "wall import returned no company id"; exit 4; }

    # 4. Per-wall gate proxy.
    WALL_GATE_PORT="$(python3 "$WALLS_PY" --alloc-gate-port --registry "$WALLS_REGISTRY" --base "$GATE_PORT_BASE")"
    WALL_RECEIPTS="$HOME/.possiblaw/gate-receipts/$(basename "$DATA_DIR")-$WALL_PREFIX/receipts.jsonl"
    start_gate_proxy_for "$WALL_COMPANY_ID" "$WALL_GATE_PORT" "$WALL_RECEIPTS" \
        "$DATA_DIR/gate-proxy-$WALL_PREFIX.pid" "$DATA_DIR/gate-proxy-$WALL_PREFIX.log" "wall:$WALL_PREFIX"

    # 5. Agent env patch (GATE_PROXY_URL → the wall's own proxy) — reuse the
    #    per-agent PATCH loop (:1981-2011) against the wall's import response,
    #    with GATE_PROXY_URL="http://127.0.0.1:$WALL_GATE_PORT" and "${AUTH_ARGS[@]}".

    # 6. Routines — call provision_intake_routine with COMPANY_ID/IMPORT_RESPONSE_FILE
    #    pointing at the wall (see Step 3 refactor below); honors --no-routines.

    # 7. Facade config (only with --firm-facade): reuse the facade block with
    #    FACADE_MCP_FILE="$DATA_DIR/firm-facade-mcp-$WALL_PREFIX.json" and the
    #    wall's COMPANY_ID/GATE_PROXY_URL/COMPANY_SHORT_CODE=$WALL_PREFIX.

    # 8. Record the wall.
    printf '{"name":"%s","companyId":"%s","prefix":"%s","gatePort":%s,"receiptsPath":"%s","facadeConfig":%s,"status":"active","createdAt":"%s"}' \
        "$ADD_WALL" "$WALL_COMPANY_ID" "$WALL_PREFIX" "$WALL_GATE_PORT" "$WALL_RECEIPTS" \
        "$( [ "$FIRM_FACADE" = "true" ] && printf '"%s"' "$DATA_DIR/firm-facade-mcp-$WALL_PREFIX.json" || printf 'null' )" \
        "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        | python3 "$WALLS_PY" --registry "$WALLS_REGISTRY" --add > /dev/null
    milestone "wall \"$ADD_WALL\" ($WALL_PREFIX) active — company $WALL_COMPANY_ID, gate :$WALL_GATE_PORT"
    milestone "screened team setup: invite ONLY this client's lawyers to the new company (dashboard → Company Settings → Members)"
    exit 0
fi
```

The `# ...` comments in 3/5/6/7 mean: **extract** the existing main-path code into functions (`build_import_body`, `run_import`, `patch_agent_envs`, `emit_facade_config`) parameterized by `ORG_NAME` / `IMPORT_RESPONSE_FILE` / `COMPANY_ID` / `GATE_PROXY_URL` / `FACADE_MCP_FILE` / `AUTH_ARGS`, exactly as Task 2 did for the gate proxy — then call them from BOTH the main path and this block. Same extract-then-reuse discipline: after each extraction re-run the Task 2 Step 3 regression commands.

- [ ] **Step 3: Parameterize `provision_intake_routine`**

Change its signature to `provision_intake_routine <company_id> <import_response_file>` and replace internal uses of the globals with `$1`/`$2` (its curl calls also gain `"${AUTH_ARGS[@]}"`, defaulting to empty). Update the one existing call site (`:1804`) to `provision_intake_routine "$COMPANY_ID" "$IMPORT_RESPONSE_FILE" || true`.

- [ ] **Step 4: Verify**

```bash
bash -n bin/possiblaw
./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "smoke" | tail -5   # unchanged
./bin/possiblaw --add-wall "Test Client" --port 3199 --data-dir "$(mktemp -d)"; echo "exit=$?"  # exit=4 (no server)
```

Then the live disposable check:

```bash
DD="$(mktemp -d)"
./bin/possiblaw --variant codex --non-interactive --yes --mission "wall e2e" --port 3199 --gate-port 3899 --data-dir "$DD" &
# after healthy:
./bin/possiblaw --add-wall "Acme Conflict Client" --port 3199 --data-dir "$DD" --gate-port-base 3899
curl -s http://127.0.0.1:3199/api/companies | python3 -c 'import json,sys; print([c["issuePrefix"] for c in json.load(sys.stdin)])'
# expect two prefixes; walls.json exists; second gate proxy healthy on 3900
./bin/possiblaw --add-wall "Acme Conflict Client" --port 3199 --data-dir "$DD" --gate-port-base 3899; echo "exit=$?"  # exit=3 (collision = already walled)
```
Teardown fully; port 3100 untouched.

- [ ] **Step 5: Commit**

```bash
git add bin/possiblaw
git commit -m "feat(launcher): --add-wall — walled client company with dedicated gate proxy, facade config, and walls.json registry"
```

---

### Task 4: Launcher — wall re-wiring on restart + `--auth-mode`

**Files:**
- Modify: `bin/possiblaw` (post-gate-proxy startup section; server env at `:1362-1384`; parser/usage)

**Interfaces:**
- Consumes: Task 1 `--list`, Task 2 `start_gate_proxy_for`.
- Produces: normal launches restore every wall's gate proxy; `--auth-mode authenticated|local_trusted` flag (default `local_trusted`).

- [ ] **Step 1: Restart re-wiring**

Immediately after the firm's own gate-proxy start (end of the Task 2 block), add:

```bash
# Restore per-wall gate proxies recorded by --add-wall.
if [ "$NO_GATE_PROXY" != "true" ] && [ -f "$DATA_DIR/walls.json" ]; then
    while IFS=$'\t' read -r w_prefix w_company w_port w_receipts; do
        [ -n "$w_company" ] || continue
        start_gate_proxy_for "$w_company" "$w_port" "$w_receipts" \
            "$DATA_DIR/gate-proxy-$w_prefix.pid" "$DATA_DIR/gate-proxy-$w_prefix.log" "wall:$w_prefix"
    done < <(python3 "$REPO_ROOT/bin/_possiblaw_walls.py" --registry "$DATA_DIR/walls.json" --list \
        | python3 -c 'import json,sys
for w in json.load(sys.stdin):
    if w.get("status") == "active":
        print("\t".join([str(w["prefix"]), str(w["companyId"]), str(w["gatePort"]), str(w["receiptsPath"])]))')
fi
```

- [ ] **Step 2: `--auth-mode`**

Parser: `--auth-mode) … AUTH_MODE="$2"; shift 2 ;;` with default `AUTH_MODE="local_trusted"`; validate value ∈ {`local_trusted`,`authenticated`} else exit 2. Where the server child env is assembled (`:1362-1384`), add:

```bash
if [ "$AUTH_MODE" = "authenticated" ]; then
    AUTH_SECRET_FILE="$DATA_DIR/better-auth.secret"
    if [ ! -f "$AUTH_SECRET_FILE" ]; then
        umask_prev="$(umask)"; umask 177
        head -c 32 /dev/urandom | base64 > "$AUTH_SECRET_FILE"
        umask "$umask_prev"
        milestone "generated better-auth secret at $AUTH_SECRET_FILE (0600, reused on restart)"
    fi
    SERVER_AUTH_ENV=(PAPERCLIP_DEPLOYMENT_MODE=authenticated BETTER_AUTH_SECRET="$(cat "$AUTH_SECRET_FILE")")
else
    SERVER_AUTH_ENV=()
fi
```

and include `"${SERVER_AUTH_ENV[@]}"` in the server's `env` invocation. After server health, when `AUTH_MODE=authenticated`, surface the migration claim URL if the server printed one:

```bash
if [ "$AUTH_MODE" = "authenticated" ]; then
    CLAIM_LINE="$(grep -o 'http[s]*://[^ ]*/board-claim/[^ ]*' "$SERVER_LOG" 2>/dev/null | head -n 1 || true)"
    if [ -n "$CLAIM_LINE" ]; then
        milestone "AUTHENTICATED MODE — claim board ownership (first admin): $CLAIM_LINE"
    else
        milestone "authenticated mode active; manage lawyer accounts via company invites (see docs/workflows/ethical-walls.md)"
    fi
fi
```

(Verified: the claim URL is printed by the server on migration boots — `paperclip/server/src/index.ts:879-893`; on a genuinely fresh authenticated data dir the first admin comes from `pnpm -C paperclip paperclipai auth bootstrap-ceo`, which the runbook covers.)

- [ ] **Step 3: Verify**

```bash
bash -n bin/possiblaw
./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "smoke" | tail -5   # unchanged
./bin/possiblaw --auth-mode bogus 2>&1 | tail -1; echo "exit=$?"                                # exit=2
```
Live: launch a disposable with `--auth-mode authenticated` on a data dir that previously ran local_trusted → expect the claim-URL milestone; restart a disposable that has a wall in walls.json → expect `wall:<PREFIX>` gate proxy to come back healthy.

- [ ] **Step 4: Commit**

```bash
git add bin/possiblaw
git commit -m "feat(launcher): restore wall gate proxies on restart; --auth-mode authenticated with persisted better-auth secret"
```

---

### Task 5: `firm-overview/` scaffold + paperclip client

**Files:**
- Create: `firm-overview/package.json`, `firm-overview/tsconfig.json`, `firm-overview/src/paperclip.ts`, `firm-overview/src/paperclip.test.ts`

**Interfaces (Produces — used by Tasks 6–8):**

```ts
export interface PaperclipClientOpts { baseUrl: string; token?: string }
export class PaperclipClient {
  constructor(opts: PaperclipClientOpts)
  listCompanies(): Promise<Array<{ id: string; name: string; issuePrefix: string }>>
  getDashboard(companyId: string): Promise<Record<string, unknown>>
  listIssues(companyId: string, statuses: string[]): Promise<Issue[]>   // ?status=a,b&sortField=updated&sortDir=desc&limit=100
  listAgents(companyId: string): Promise<Array<{ id: string; name: string }>>
  listApprovals(companyId: string): Promise<Approval[]>
  listWorkProducts(issueId: string): Promise<WorkProduct[]>
  decideApproval(approvalId: string, action: "approve" | "reject", decisionNote?: string): Promise<{ status: number; body: unknown }>
  createCliAuthChallenge(): Promise<{ id: string; token: string; boardApiToken: string; approvalUrl: string }>
  getCliAuthChallenge(id: string, challengeToken: string): Promise<{ status: string }>
}
export interface Issue { id: string; title: string; status: string; priority: number | null;
  assigneeAgentId: string | null; identifier: string | null; updatedAt: string }
export interface Approval { id: string; companyId: string; type: string; status: string;
  requestedByAgentId: string | null; createdAt: string }
export interface WorkProduct { id: string; issueId: string; type: string; title: string;
  status: string | null; url: string | null; createdAt: string }
export class PaperclipHttpError extends Error { constructor(public status: number, public path: string) }
```

Every method: `fetch` against `${baseUrl}${path}`, header `Authorization: Bearer ${token}` **only when `token` is set**, `accept: application/json`; non-2xx → throw `PaperclipHttpError(status, path)`; `decideApproval` is the exception — it returns `{status, body}` without throwing (the server proxies the result). `package.json`/`tsconfig.json`: copy `gate-proxy/`'s structure (`"test": "node --test --import tsx src/"` style scripts, same compilerOptions; adjust name to `firm-overview`).

- [ ] **Step 1: Failing tests** — `firm-overview/src/paperclip.test.ts` spins a real `node:http` stub server per test on port 0:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PaperclipClient, PaperclipHttpError } from "./paperclip.ts";

async function withStub(
  handler: http.RequestListener,
  fn: (baseUrl: string, seen: Array<{ url: string; auth?: string }>) => Promise<void>,
) {
  const seen: Array<{ url: string; auth?: string }> = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? "", auth: req.headers.authorization });
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try { await fn(`http://127.0.0.1:${port}`, seen); }
  finally { server.close(); }
}

test("listIssues builds the query and parses the bare array", async () => {
  await withStub((_req, res) => { res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: "i1", title: "T", status: "in_progress", priority: 1,
      assigneeAgentId: "a1", identifier: "ACM-1", updatedAt: "2026-07-02T00:00:00Z" }])); },
    async (baseUrl, seen) => {
      const c = new PaperclipClient({ baseUrl, token: "pcp_board_x" });
      const issues = await c.listIssues("c1", ["in_progress", "blocked"]);
      assert.equal(issues[0].identifier, "ACM-1");
      assert.match(seen[0].url, /\/api\/companies\/c1\/issues\?/);
      assert.match(seen[0].url, /status=in_progress%2Cblocked|status=in_progress,blocked/);
      assert.match(seen[0].url, /sortField=updated/);
      assert.equal(seen[0].auth, "Bearer pcp_board_x");
    });
});

test("no Authorization header without a token", async () => {
  await withStub((_req, res) => { res.end("[]"); }, async (baseUrl, seen) => {
    await new PaperclipClient({ baseUrl }).listCompanies();
    assert.equal(seen[0].auth, undefined);
  });
});

test("non-2xx throws PaperclipHttpError with status", async () => {
  await withStub((_req, res) => { res.statusCode = 403; res.end("{}"); }, async (baseUrl) => {
    await assert.rejects(
      new PaperclipClient({ baseUrl, token: "t" }).listApprovals("c1"),
      (e: unknown) => e instanceof PaperclipHttpError && e.status === 403,
    );
  });
});

test("decideApproval returns status+body without throwing on 403", async () => {
  await withStub((req, res) => {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => { res.statusCode = 403;
      res.end(JSON.stringify({ error: "Board access required", got: JSON.parse(body) })); });
  }, async (baseUrl, seen) => {
    const r = await new PaperclipClient({ baseUrl, token: "t" })
      .decideApproval("ap1", "approve", "lgtm");
    assert.equal(r.status, 403);
    assert.match(seen[0].url, /\/api\/approvals\/ap1\/approve$/);
  });
});

test("createCliAuthChallenge posts and parses the approval fields", async () => {
  await withStub((_req, res) => { res.end(JSON.stringify({ id: "ch1", token: "sec",
    boardApiToken: "pcp_board_new", approvalUrl: "http://x/approve" })); },
    async (baseUrl) => {
      const r = await new PaperclipClient({ baseUrl }).createCliAuthChallenge();
      assert.equal(r.boardApiToken, "pcp_board_new");
    });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `pnpm -C firm-overview install && pnpm -C firm-overview test` → FAIL (module not found).

- [ ] **Step 3: Implement `src/paperclip.ts`** — one private `request(method, path, body?)` helper implementing the header/error contract above; public methods:
  - `listCompanies` → `GET /api/companies`
  - `getDashboard(c)` → `GET /api/companies/${c}/dashboard`
  - `listIssues(c, statuses)` → `GET /api/companies/${c}/issues?status=${statuses.join(",")}&sortField=updated&sortDir=desc&limit=100` (encode with `URLSearchParams`)
  - `listAgents(c)` → `GET /api/companies/${c}/agents`
  - `listApprovals(c)` → `GET /api/companies/${c}/approvals`
  - `listWorkProducts(i)` → `GET /api/issues/${i}/work-products`
  - `decideApproval(id, action, note)` → `POST /api/approvals/${id}/${action}` body `{decisionNote: note ?? null}`; catch the non-2xx path and return `{status, body}`
  - `createCliAuthChallenge()` → `POST /api/cli-auth/challenges` body `{command: "possiblaw firm-overview", clientName: "Firm Overview", requestedAccess: "board"}`
  - `getCliAuthChallenge(id, tok)` → `GET /api/cli-auth/challenges/${id}?token=${tok}`

- [ ] **Step 4: Tests pass** — `pnpm -C firm-overview test` → all pass; `pnpm -C firm-overview typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add firm-overview/
git commit -m "feat(firm-overview): package scaffold + paperclip API client (token-optional, typed errors)"
```

---

### Task 6: `firm-overview/src/merge.ts` — board model

**Files:**
- Create: `firm-overview/src/merge.ts`, `firm-overview/src/merge.test.ts`

**Interfaces:**
- Consumes: `Issue`, `Approval`, `WorkProduct` from Task 5 (import types only — no runtime dependency, so this task runs in parallel with Task 5 against the interface block above).
- Produces:

```ts
export const IN_FLIGHT_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"] as const;
export const OPEN_APPROVAL_STATUSES = ["pending", "revision_requested"] as const;
export interface ClientBoard {
  companyId: string; name: string; issuePrefix: string;
  dashboard: Record<string, unknown> | null;
  issues: Array<Issue & { assigneeAgentName: string | null; deepLink: string }>;
  approvals: Array<Approval & { deepLink: string }>;
  deliverables: Array<WorkProduct & { deepLink: string }>;
  deliverablesTruncated: boolean;
  error: string | null;
}
export interface FirmBoard { generatedAt: string; clients: ClientBoard[] }
export function buildClientBoard(input: {
  company: { id: string; name: string; issuePrefix: string };
  publicUrl: string;
  dashboard: Record<string, unknown> | null;
  issues: Issue[]; agents: Array<{ id: string; name: string }>;
  approvals: Approval[];
  workProducts: WorkProduct[]; workProductsTruncated: boolean;
  error?: string | null;
}): ClientBoard
export function errorClientBoard(company: { id: string; name: string; issuePrefix: string }, message: string): ClientBoard
export function buildFirmBoard(clients: ClientBoard[], generatedAt: string): FirmBoard
```

Rules: issues filtered to `IN_FLIGHT_STATUSES`, agent name joined from `agents` (unknown id → `null`), issue deep link `${publicUrl}/${issuePrefix}/issues/${identifier ?? id}`; approvals filtered to `OPEN_APPROVAL_STATUSES`, deep link `${publicUrl}/${issuePrefix}/approvals`; deliverables deep link `${publicUrl}/${issuePrefix}/issues/${workProduct.issueId}`; `errorClientBoard` yields empty arrays + the message. Pure functions, no I/O, no Date.now() (caller passes `generatedAt`).

- [ ] **Step 1: Failing tests** covering: in-flight filter drops `done`/`cancelled`; agent-name join + unknown-agent null; deep-link shapes (identifier fallback to id); approval filter keeps `revision_requested`, drops `approved`; `errorClientBoard` shape; `buildFirmBoard` preserves order and stamps `generatedAt`. (Write them in the same stub-free style as Task 5 — pure data in/out.)
- [ ] **Step 2: Run to fail** — `pnpm -C firm-overview test` → new file fails.
- [ ] **Step 3: Implement** exactly the rules above (≈60 lines).
- [ ] **Step 4: Tests pass + typecheck.**
- [ ] **Step 5: Commit** — `git commit -m "feat(firm-overview): pure board model — in-flight merge, agent-name join, deep links, per-client errors"`

---

### Task 7: `firm-overview/src/auth.ts` — connect flow + token store

**Files:**
- Create: `firm-overview/src/auth.ts`, `firm-overview/src/auth.test.ts`

**Interfaces:**
- Consumes: `PaperclipClient.createCliAuthChallenge/getCliAuthChallenge` (Task 5 interface block).
- Produces:

```ts
export interface ConnectState {
  status: "disconnected" | "awaiting_approval" | "connected";
  approvalUrl?: string;
}
export class CredentialStore {
  constructor(private client: PaperclipClient)
  state(): ConnectState
  token(): string | undefined                       // pcp_board_… once connected
  async startConnect(): Promise<{ approvalUrl: string }>   // creates the challenge, holds boardApiToken as PENDING
  async pollConnect(): Promise<ConnectState>        // polls the challenge; on approved → promote pending token to live
  disconnect(): void                                 // clears everything (in-memory only; nothing is ever written to disk)
}
```

Behavior: `startConnect` stores `{challengeId, challengeToken, pendingBoardToken, approvalUrl}` in memory and returns the approvalUrl; `pollConnect` calls `getCliAuthChallenge`; challenge `status === "approved"` → live token = pendingBoardToken, state `connected`; `expired`/`cancelled` → back to `disconnected` and pending cleared. A 401 from any later API call is handled by the server layer calling `disconnect()` (Task 8).

- [ ] **Step 1: Failing tests** — stub `PaperclipClient` with a hand-rolled object (duck-typed): assert full happy path (disconnected → startConnect → awaiting_approval with url → poll pending stays awaiting → poll approved → connected with token exposed), the expired path, and disconnect() clearing the token.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement** (≈50 lines, zero I/O beyond the injected client).
- [ ] **Step 4: Tests pass + typecheck.**
- [ ] **Step 5: Commit** — `git commit -m "feat(firm-overview): CLI-auth connect driver with in-memory per-lawyer token store"`

---

### Task 8: `firm-overview/src/server.ts` + page + entrypoint

**Files:**
- Create: `firm-overview/src/server.ts`, `firm-overview/src/server.test.ts`, `firm-overview/src/page.ts`, `firm-overview/src/index.ts`
- Modify: `bin/possiblaw` (usage note only: one line pointing at `pnpm -C firm-overview start`) — coordinate with Task 4 if concurrent; if both waves overlap, this one-line change moves to Task 9 instead. **Default: leave `bin/possiblaw` untouched here and put the pointer in Task 9's docs.**

**Interfaces:**
- Consumes: Tasks 5–7 exports.
- Produces: `createOverviewServer(opts: { client: PaperclipClient-factory, publicUrl: string, now?: () => string }): http.Server` binding NOTHING itself (caller listens), plus `src/index.ts` env wiring: `FIRM_OVERVIEW_PORT` (default `3860`), `PAPERCLIP_BASE_URL` (required — exit 1 with message if unset), `PAPERCLIP_PUBLIC_URL` (default = base URL). Listens on `127.0.0.1` ONLY.

HTTP contract:
- `GET /` → `renderPage()` HTML (`page.ts`): client-side JS polls `GET /api/board` every 20s, renders per-client sections (tiles from `dashboard`, issue rows with deep links, open-approvals queue with Approve/Reject buttons + note field + `confirm()` dialog, deliverables list, red error chip per failed client), a Connect button driving `/api/connect` + `/api/connect/status`, and a "Connected as …/Disconnect" header. All fetches send header `X-Firm-Overview: 1`.
- `GET /api/board` → build via: `listCompanies()` → per company `Promise.allSettled` of `[getDashboard, listIssues(IN_FLIGHT_STATUSES), listAgents, listApprovals]`; deliverables = `listWorkProducts` over the 10 most-recently-updated issues (`deliverablesTruncated=true` when issues > 10); each rejected sub-fetch → that field null/empty; a rejected company entirely → `errorClientBoard`. A thrown 401 anywhere with a token held → `credentials.disconnect()` and respond `{connected:false, reauth:true}`. Response: `{connect: ConnectState, board: FirmBoard}`.
- `POST /api/connect` → `startConnect()` → `{approvalUrl}`.
- `GET /api/connect/status` → `pollConnect()` result.
- `POST /api/disconnect` → 204.
- `POST /api/approvals/:id/decide` body `{action, decisionNote?}` → validate `action ∈ {approve, reject}` (else 400) → `decideApproval` → mirror `{status, body}` back.
- **CSRF guard on every POST**: require header `X-Firm-Overview: 1` AND (no `Origin` header OR `Origin` startsWith `http://127.0.0.1:`/`http://localhost:`) — else 403. This forces a CORS preflight for any cross-origin browser page, which the server never answers.

- [ ] **Step 1: Failing tests** (`server.test.ts`, using `withStub`-style paperclip stubs + `fetch` against the overview server on port 0): (a) `/api/board` merges two companies and marks the failing one with `error`; (b) POST without `X-Firm-Overview` → 403; (c) POST with `Origin: http://evil.example` → 403; (d) `decide` with `action:"nuke"` → 400; (e) decide happy path proxies to `POST /api/approvals/ap1/approve` and mirrors paperclip's 200; (f) decide as agent-credential mirror: paperclip stub returns 403 → overview responds 403 with the body passed through; (g) board with a held token that now 401s → `{connected:false, reauth:true}`.
- [ ] **Step 2: Run to fail.**
- [ ] **Step 3: Implement `server.ts` + `page.ts` + `index.ts`.** `page.ts` is one exported template-literal function (`renderPage(): string`) — plain HTML + `<style>` + `<script>`; no framework, no external assets (loopback page, not artifact-grade design; keep it clean and readable: firm header, client cards, status pills using paperclip's status names verbatim).
- [ ] **Step 4: Tests pass + typecheck; manual smoke** — `PAPERCLIP_BASE_URL=http://127.0.0.1:3199 pnpm -C firm-overview start` against a disposable instance; open `http://127.0.0.1:3860`, see the board.
- [ ] **Step 5: Commit** — `git commit -m "feat(firm-overview): loopback dashboard server — merged board, connect flow, approve-as-lawyer proxy, CSRF-guarded"`

---

### Task 9: Docs

**Files:**
- Create: `docs/workflows/ethical-walls.md`
- Modify: `docs/operator-walkthrough.md`, `docs/known-limitations.md`, `README.md`, `CHANGELOG.md`, `CLAUDE.md`

**Content requirements (all claims must match shipped behavior — verify against the merged code, not this plan):**
- `ethical-walls.md`: when to wall (conflicts screen) vs not; `--add-wall` walkthrough incl. prefix rule + collision error; authenticated-mode setup — `--auth-mode authenticated`, board-claim on migration, `pnpm -C paperclip paperclipai auth bootstrap-ceo` on fresh authenticated data dirs, inviting the screened team ONLY to the walled company; Firm Overview connect flow (approve the CLI-auth challenge, 30-day token, revoke via `POST /api/cli-auth/revoke-current`); what a screened lawyer sees (nothing); solo `local_trusted` note (overview shows everything, no setup); shared firm memory across walls — `--add-wall "X" --business <slug>` reuses the same slug (safe because the 0.36.0 sanitizer keeps memory client-fact-free by construction).
- `known-limitations.md`: REWRITE the company-wide read-scope subsection — cross-client agent reads are now preventable via walls (opt-in), still unrestricted *within* a company; add: firm-overview trusts loopback (same floor as the gate proxy/local_trusted — a malicious local process can read the board; CSRF-guarded against browser pages, not local processes); deliverables panel is a bounded fan-out (latest 10 issues per client).
- `README.md`: one feature row for ethical walls + one for the Firm Overview; honest scope wording.
- `CHANGELOG.md` `[0.38.0]`: walls (`--add-wall`, per-wall gate proxies/receipts/facade, walls.json, restart re-wiring), `--auth-mode`, `firm-overview/` package.
- `CLAUDE.md`: Commands — add `pnpm -C firm-overview test` (with test count) and the walls-helper self-test to the helper self-test chain; Code Map — `firm-overview/` entry + `bin/_possiblaw_walls.py` mention in the launcher line.
- Update `docs/designs/matter-isolation.md` known-limitations timing note if wording drifted.

- [ ] Step 1: Write all docs. Step 2: `python3 bin/_possiblaw_walls.py --self-test` and `pnpm -C firm-overview test` to confirm the counts quoted in docs. Step 3: Commit — `git commit -m "docs: ethical walls runbook, firm-overview, auth-mode; known-limitations read-scope rewrite; CHANGELOG 0.38.0"`

---

### Task 10: Live disposable e2e + full battery (CONTROLLER ONLY — no subagent)

**Files:** none (verification only; fixes loop back to the owning task).

- [ ] **Step 1: Full unit battery**

```bash
pnpm -C gate-proxy test && pnpm -C learning-loop test && pnpm -C mcp-servers/firm-facade test \
  && pnpm -C orchestration-eval test && pnpm -C eval-harness test && pnpm -C deadline-engine test \
  && pnpm -C firm-overview test
bash -n bin/possiblaw
python3 bin/_possiblaw_variants.py --self-test && python3 bin/_possiblaw_inline_source.py --self-test \
  && python3 bin/_possiblaw_eval_coverage.py --self-test && python3 bin/_possiblaw_vendor_skill.py --self-test \
  && python3 bin/_possiblaw_walls.py --self-test
./bin/possiblaw --dry-run --variant codex --non-interactive --yes --mission "battery" | tail -5
```
Expected: every suite green; dry-run `warnings=0 errors=0`.

- [ ] **Step 2: Live wall e2e (disposable, port 3100 NEVER touched)**

```bash
DD="$(mktemp -d)"
./bin/possiblaw --variant codex --non-interactive --yes --mission "wall e2e" --port 3199 --gate-port 3899 --data-dir "$DD" &
# after healthy:
./bin/possiblaw --add-wall "Acme Conflict Client" --port 3199 --data-dir "$DD" --gate-port-base 3899
```
Then prove THE WALL — mint an agent key in the walled company (`POST /api/agents/:wallAgentId/keys`), and with it:
```bash
curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $WALL_AGENT_KEY" \
  "http://127.0.0.1:3199/api/companies/$MAIN_COMPANY_ID/issues"      # expect 403
curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $WALL_AGENT_KEY" \
  "http://127.0.0.1:3199/api/companies/$WALL_COMPANY_ID/issues"      # expect 200
```
And the reverse with a main-company agent key against the walled company (expect 403).

- [ ] **Step 3: Overview e2e** — `PAPERCLIP_BASE_URL=http://127.0.0.1:3199 pnpm -C firm-overview start`; `curl -s http://127.0.0.1:3860/api/board` shows BOTH companies (implicit board, no token); create an approval in the main company via the API, decide it through `POST /api/approvals/:id/decide` on the overview, confirm paperclip records `status:"approved"`.

- [ ] **Step 4: Restart e2e** — SIGINT the launcher; relaunch with the same `--data-dir`; confirm both gate proxies (3899 + the wall's) return healthy.

- [ ] **Step 5: Teardown + receipts** — kill everything, `rm -rf "$DD"`, verify `lsof -nP -iTCP:3100 -sTCP:LISTEN` still shows the operator's server untouched. Record all outputs in the task ledger; refresh `.agent/PLAN.md` / `.agent/HANDOFF.md` / `.claude/history.md`; then the novice-safe git cycle (branch `feat/matter-isolation-a1`, push, PR).

**Deliberately deferred (documented, not built):** authenticated-mode live e2e with real lawyer logins + screened-lawyer invisibility check — requires interactive signup/claim clicks, so it lands on the operator-test checklist (`docs/operator-test-checklist.md` gains a "Walls + Firm Overview" section in Task 9).
