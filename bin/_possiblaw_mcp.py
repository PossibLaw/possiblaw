#!/usr/bin/env python3
"""Render the PossibLaw MCP-server registry into a runtime CLI's config shape.

Inputs (all JSON, pre-converted from YAML by the bash launcher's yaml_to_json):
  --registry-json   path to mcp-servers.yaml-as-json (or "-" for stdin):
                    { "mcpServers": [ { name, transport, command|url, auth,
                                        grantTo, privacy, description }, ... ] }
  --adapter         one of: opencode_local | codex_local | claude_local |
                    gemini_local  — which runtime config format to render.
  --agent           (optional) agent slug. Include only servers whose grantTo
                    contains this slug, plus servers with empty/absent grantTo
                    (treated as global). Omit to include all servers.
  --merge-into      (optional) path to an existing parsed CLI-config object
                    (JSON, or "-" for stdin). The rendered MCP block is merged
                    into it and the FULL merged object is printed. NOT
                    applicable to codex_local (TOML) — for codex this flag is
                    rejected; bash appends the rendered TOML fragment instead.

Default (no --merge-into): print just the rendered block for that adapter
(JSON for opencode/claude/gemini; TOML text for codex).

Self-test: `python3 bin/_possiblaw_mcp.py --self-test`
  -> prints "OK: _possiblaw_mcp self-test passed", exit 0 on success.

ADVISORY-SCOPING LIMITATION (encoded honestly):
  These CLI MCP configs are GLOBAL per runtime, NOT per-subagent. None of the
  four target CLIs lets you scope an MCP server to a single agent today. So
  `grantTo` CANNOT be enforced at the CLI layer: when --agent is omitted we
  render the UNION of all servers, and grantTo is purely advisory documentation
  / a forward hook. --agent only narrows the rendered set for callers who want
  a per-agent view; it does NOT create real per-agent isolation in the runtime.

Warnings go to stderr (one per line, prefixed "warning: ").
Errors exit non-zero with an "error: ..." line on stderr.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from typing import Any

ADAPTERS = ("opencode_local", "codex_local", "claude_local", "gemini_local")

# Valid TOML bare-key characters only. Brackets, newlines, spaces, etc. would
# allow injection into [mcp_servers.<name>] table headers.
_VALID_SERVER_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")


def _read_json(path: str) -> Any:
    if path == "-":
        return json.load(sys.stdin)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _split_command(command: str) -> list[str]:
    """Split a stdio launch command into argv. Plain whitespace split is enough
    for our registry commands (no quoting); kept simple and deterministic."""
    return [tok for tok in str(command or "").split() if tok]


def _token_env_var(auth: str) -> str | None:
    """Return VAR for auth == 'token-env:VAR', else None."""
    if isinstance(auth, str) and auth.startswith("token-env:"):
        var = auth.split(":", 1)[1].strip()
        return var or None
    return None


def select_servers(
    registry: dict, agent: str | None,
    warn=lambda msg: print(f"warning: {msg}", file=sys.stderr),
) -> list[dict]:
    """Return the servers to render.

    If `agent` is None -> all servers (the UNION; grantTo advisory only).
    If `agent` is given -> servers whose grantTo contains the slug, PLUS servers
    with an empty/absent grantTo (global). This is a convenience view, not real
    per-agent isolation (see module docstring).
    """
    if not isinstance(registry, dict) or "mcpServers" not in registry:
        raise ValueError("registry document missing 'mcpServers' list")
    servers = registry.get("mcpServers") or []
    if not isinstance(servers, list):
        raise ValueError("registry 'mcpServers' must be a list")

    out: list[dict] = []
    seen: set[str] = set()
    for srv in servers:
        if not isinstance(srv, dict):
            warn("skipping non-object entry in mcpServers")
            continue
        name = srv.get("name")
        if not name:
            warn("skipping mcpServers entry with no name")
            continue
        if not _VALID_SERVER_NAME_RE.match(name):
            warn(
                f"skipping mcpServers entry with invalid name {name!r} "
                "(only [A-Za-z0-9._-] allowed — brackets, spaces, and newlines "
                "could inject arbitrary TOML)"
            )
            continue
        if name in seen:
            warn(f"duplicate server name '{name}' — keeping the first")
            continue
        if agent is not None:
            grant = srv.get("grantTo") or []
            if grant and agent not in grant:
                continue
        seen.add(name)
        out.append(srv)
    return out


def _render_one_opencode(srv: dict) -> dict:
    # UNCONFIRMED: OpenCode's mcp schema is documented as a per-name object with
    # "type": "local"|"remote". Local uses a "command" ARRAY (argv) plus an
    # optional "environment" map; remote uses "url". "enabled" gates the server.
    # (https://opencode.ai/docs/mcp-servers — confirm field names against the
    # installed OpenCode version.)
    transport = srv.get("transport")
    if transport == "http":
        return {"type": "remote", "url": srv.get("url"), "enabled": True}
    entry: dict = {
        "type": "local",
        "command": _split_command(srv.get("command")),
        "enabled": True,
    }
    var = _token_env_var(srv.get("auth"))
    if var:
        # OpenCode env interpolation form is "{env:VAR}".
        entry["environment"] = {var: "{env:%s}" % var}
    return entry


def render_opencode(servers: list[dict]) -> dict:
    return {"mcp": {s["name"]: _render_one_opencode(s) for s in servers}}


def _render_one_claude(srv: dict) -> dict:
    transport = srv.get("transport")
    if transport == "http":
        # UNCONFIRMED: Claude CLI .mcp.json http form is {"type":"http","url":...}.
        # oauth -> first run is interactive in the CLI; NO secret is rendered here.
        return {"type": "http", "url": srv.get("url")}
    argv = _split_command(srv.get("command"))
    entry: dict = {
        "command": argv[0] if argv else "",
        "args": argv[1:],
    }
    var = _token_env_var(srv.get("auth"))
    if var:
        # Claude CLI env values are literal strings; "${VAR}" passes the name through.
        entry["env"] = {var: "${%s}" % var}
    return entry


def render_claude(servers: list[dict]) -> dict:
    return {"mcpServers": {s["name"]: _render_one_claude(s) for s in servers}}


def _render_one_gemini(srv: dict) -> dict:
    transport = srv.get("transport")
    if transport == "http":
        # UNCONFIRMED: Gemini CLI settings.json uses "httpUrl" for HTTP MCP servers.
        return {"httpUrl": srv.get("url")}
    argv = _split_command(srv.get("command"))
    entry: dict = {
        "command": argv[0] if argv else "",
        "args": argv[1:],
    }
    var = _token_env_var(srv.get("auth"))
    if var:
        entry["env"] = {var: "${%s}" % var}
    return entry


def render_gemini(servers: list[dict]) -> dict:
    return {"mcpServers": {s["name"]: _render_one_gemini(s) for s in servers}}


def _toml_str(value: str) -> str:
    """Minimal TOML basic-string escaping (sufficient for our registry values)."""
    s = str(value)
    s = s.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{s}"'


def _toml_array(items: list[str]) -> str:
    return "[" + ", ".join(_toml_str(i) for i in items) + "]"


def _codex_already_registered(name: str, existing_toml: str) -> bool:
    """Return True if [mcp_servers.<name>] already appears as a table header in
    existing_toml. Used to make re-launches idempotent: TOML forbids duplicate
    table keys, so appending a header that is already present would corrupt the
    file."""
    header = f"[mcp_servers.{name}]"
    for line in existing_toml.splitlines():
        stripped = line.strip()
        if stripped == header:
            return True
    return False


def render_codex(
    servers: list[dict],
    existing_toml: str = "",
    warn=lambda msg: print(f"warning: {msg}", file=sys.stderr),
) -> str:
    """Render TOML [mcp_servers.<name>] tables for servers not already in the
    target file. The launcher appends this text to ~/.codex/config.toml.

    Pass existing_toml (the current content of config.toml, or "") to enable
    idempotency: servers whose [mcp_servers.<name>] header already appears in
    existing_toml are skipped so that running the launcher twice leaves exactly
    one table per server. TOML forbids duplicate table keys; blind-append on a
    second launch would produce an unparseable file.

    (TOML can't be 'merged' as a parsed object the way JSON can, so --merge-into
    is rejected for codex_local.)

    UNCONFIRMED: codex config.toml uses [mcp_servers.<name>] with `command`/
    `args` for stdio and `url` for streamable-HTTP servers, plus an `env` table.
    Confirm against the installed codex version's docs.
    """
    blocks: list[str] = []
    for srv in servers:
        name = srv["name"]
        if existing_toml and _codex_already_registered(name, existing_toml):
            warn(f"skipping '{name}' — [mcp_servers.{name}] already present in target file")
            continue
        lines = [f"[mcp_servers.{name}]"]
        if srv.get("transport") == "http":
            lines.append(f"url = {_toml_str(srv.get('url'))}")
        else:
            argv = _split_command(srv.get("command"))
            cmd = argv[0] if argv else ""
            lines.append(f"command = {_toml_str(cmd)}")
            lines.append(f"args = {_toml_array(argv[1:])}")
        var = _token_env_var(srv.get("auth"))
        if var:
            # codex env table: pass the var through by name.
            lines.append(f"[mcp_servers.{name}.env]")
            lines.append(f"{var} = {_toml_str('${%s}' % var)}")
        # oauth -> http url only; no secret rendered (first run is interactive).
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks) + ("\n" if blocks else "")


def _deep_merge(base: dict, overlay: dict) -> dict:
    """Merge overlay into a COPY of base. Nested dicts merge key-wise; overlay
    leaf values win. Used so an existing config keeps unrelated keys while the
    rendered MCP block is added/updated."""
    out = dict(base)
    for k, v in overlay.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def render(
    registry: dict,
    adapter: str,
    agent: str | None,
    existing_toml: str = "",
) -> Any:
    if adapter not in ADAPTERS:
        raise ValueError(
            f"unknown adapter '{adapter}'. Valid: {', '.join(ADAPTERS)}"
        )
    servers = select_servers(registry, agent)
    if adapter == "opencode_local":
        return render_opencode(servers)
    if adapter == "claude_local":
        return render_claude(servers)
    if adapter == "gemini_local":
        return render_gemini(servers)
    if adapter == "codex_local":
        return render_codex(servers, existing_toml=existing_toml)
    raise ValueError(f"unhandled adapter '{adapter}'")  # unreachable


def _self_test() -> int:
    registry = {
        "mcpServers": [
            {
                "name": "legal-data",
                "transport": "stdio",
                "command": "tsx mcp-servers/legal-data/src/server.ts",
                "auth": "none",
                "grantTo": ["legal-research-analyst", "case-law-summarizer"],
                "privacy": "sanitize-queries",
                "description": "legal data",
            },
            {
                "name": "courtlistener-official",
                "transport": "http",
                "url": "https://mcp.courtlistener.com",
                "auth": "oauth",
                "grantTo": ["legal-research-analyst"],
                "privacy": "standard",
                "description": "official",
            },
            {
                "name": "tokenized",
                "transport": "stdio",
                "command": "node serve.js",
                "auth": "token-env:SOME_API_KEY",
                "grantTo": [],  # empty grantTo => global
                "privacy": "standard",
                "description": "tokenized",
            },
        ]
    }

    # --- opencode_local: stdio + http top-level "mcp" key ---
    oc = render(registry, "opencode_local", None)
    assert set(oc.keys()) == {"mcp"}
    assert oc["mcp"]["legal-data"]["type"] == "local"
    assert oc["mcp"]["legal-data"]["command"] == [
        "tsx", "mcp-servers/legal-data/src/server.ts"
    ]
    assert oc["mcp"]["legal-data"]["enabled"] is True
    assert oc["mcp"]["courtlistener-official"]["type"] == "remote"
    assert oc["mcp"]["courtlistener-official"]["url"] == "https://mcp.courtlistener.com"
    # token-env injects an env passthrough by NAME, value form "{env:VAR}"
    assert oc["mcp"]["tokenized"]["environment"] == {"SOME_API_KEY": "{env:SOME_API_KEY}"}
    # oauth renders no secret (no environment/env key, just the url)
    assert "environment" not in oc["mcp"]["courtlistener-official"]

    # --- claude_local: stdio + http top-level "mcpServers" key ---
    cl = render(registry, "claude_local", None)
    assert set(cl.keys()) == {"mcpServers"}
    assert cl["mcpServers"]["legal-data"]["command"] == "tsx"
    assert cl["mcpServers"]["legal-data"]["args"] == ["mcp-servers/legal-data/src/server.ts"]
    assert cl["mcpServers"]["courtlistener-official"] == {
        "type": "http", "url": "https://mcp.courtlistener.com"
    }
    assert cl["mcpServers"]["tokenized"]["env"] == {"SOME_API_KEY": "${SOME_API_KEY}"}
    # oauth: no env / secret on the http entry
    assert "env" not in cl["mcpServers"]["courtlistener-official"]

    # --- gemini_local: stdio + http (httpUrl) top-level "mcpServers" key ---
    gm = render(registry, "gemini_local", None)
    assert set(gm.keys()) == {"mcpServers"}
    assert gm["mcpServers"]["legal-data"]["command"] == "tsx"
    assert gm["mcpServers"]["courtlistener-official"] == {
        "httpUrl": "https://mcp.courtlistener.com"
    }
    assert gm["mcpServers"]["tokenized"]["env"] == {"SOME_API_KEY": "${SOME_API_KEY}"}

    # --- codex_local: TOML text with [mcp_servers.<name>] ---
    toml = render(registry, "codex_local", None)
    assert "[mcp_servers.legal-data]" in toml
    assert 'command = "tsx"' in toml
    assert 'args = ["mcp-servers/legal-data/src/server.ts"]' in toml
    assert "[mcp_servers.courtlistener-official]" in toml
    assert 'url = "https://mcp.courtlistener.com"' in toml
    # token-env -> env table with the var name; oauth -> no secret
    assert "[mcp_servers.tokenized.env]" in toml
    assert 'SOME_API_KEY = "${SOME_API_KEY}"' in toml

    # --- --agent filters by grantTo (granted in, non-granted out, empty in) ---
    only = select_servers(registry, "case-law-summarizer", warn=lambda m: None)
    names = {s["name"] for s in only}
    # granted to case-law-summarizer
    assert "legal-data" in names
    # courtlistener-official is granted only to legal-research-analyst -> excluded
    assert "courtlistener-official" not in names
    # empty grantTo is always included (global)
    assert "tokenized" in names

    none_grant = select_servers(registry, "nobody", warn=lambda m: None)
    assert {s["name"] for s in none_grant} == {"tokenized"}, none_grant

    all_servers = select_servers(registry, None, warn=lambda m: None)
    assert len(all_servers) == 3

    # --- --merge-into preserves existing keys and adds the block ---
    existing = {
        "$schema": "https://opencode.ai/config.json",
        "provider": {"ollama": {"name": "Ollama"}},
        "mcp": {"pre-existing": {"type": "local", "command": ["x"], "enabled": True}},
    }
    merged = _deep_merge(existing, render(registry, "opencode_local", None))
    assert merged["$schema"] == "https://opencode.ai/config.json"
    assert merged["provider"]["ollama"]["name"] == "Ollama"
    assert merged["mcp"]["pre-existing"]["command"] == ["x"]  # kept
    assert merged["mcp"]["legal-data"]["type"] == "local"     # added
    # original not mutated
    assert "legal-data" not in existing["mcp"]

    # --- invalid adapter -> ValueError ---
    try:
        render(registry, "bogus_local", None)
    except ValueError as e:
        assert "unknown adapter" in str(e)
    else:
        raise AssertionError("expected ValueError for unknown adapter")

    # --- missing mcpServers -> ValueError ---
    try:
        select_servers({}, None, warn=lambda m: None)
    except ValueError as e:
        assert "mcpServers" in str(e)
    else:
        raise AssertionError("expected ValueError for missing mcpServers")

    # S2: name validation — malicious names are skipped, valid names pass.
    bad_names = [
        "evil]\ninjected = \"x\"\n[mcp_servers.evil",  # newline + bracket escape
        "bad name",        # space
        "bad]name",        # closing bracket
        "bad[name",        # opening bracket
        # Note: "" (empty name) is caught by the pre-existing no-name guard
        # before reaching name validation; tested separately below.
    ]
    good_names = ["legal-data", "my.server", "server_1", "A-B-C"]
    for bad in bad_names:
        warnings_seen: list[str] = []
        registry_bad = {
            "mcpServers": [
                {"name": bad, "transport": "stdio", "command": "node serve.js"},
                {"name": "good-server", "transport": "stdio", "command": "node serve.js"},
            ]
        }
        servers_filtered = select_servers(registry_bad, None, warn=lambda m: warnings_seen.append(m))
        names_out = {s["name"] for s in servers_filtered}
        assert "good-server" in names_out, f"good-server should pass; bad={bad!r}"
        assert bad not in names_out, f"bad name {bad!r} should be rejected"
        assert any("invalid name" in w for w in warnings_seen), \
            f"expected invalid-name warning for {bad!r}, got: {warnings_seen}"
    for good in good_names:
        registry_good = {"mcpServers": [{"name": good, "transport": "stdio", "command": "node x"}]}
        servers_good = select_servers(registry_good, None, warn=lambda m: None)
        assert len(servers_good) == 1 and servers_good[0]["name"] == good, \
            f"valid name {good!r} was incorrectly rejected"

    # S1: codex idempotency — second registration must not duplicate the table.
    # Simulate first registration.
    registry_cd = {
        "mcpServers": [
            {"name": "legal-data", "transport": "stdio",
             "command": "tsx mcp-servers/legal-data/src/server.ts"},
            {"name": "second-server", "transport": "stdio", "command": "node s.js"},
        ]
    }
    first_run = render(registry_cd, "codex_local", None, existing_toml="")
    assert first_run.count("[mcp_servers.legal-data]") == 1
    assert first_run.count("[mcp_servers.second-server]") == 1
    # Simulate second registration: existing_toml already contains first_run.
    second_run = render(registry_cd, "codex_local", None, existing_toml=first_run)
    # Nothing new should be emitted (all servers already present).
    assert second_run == "", \
        f"expected empty fragment on second run, got: {second_run!r}"
    # Combined file has exactly one copy of each header.
    combined = first_run + second_run
    assert combined.count("[mcp_servers.legal-data]") == 1
    assert combined.count("[mcp_servers.second-server]") == 1
    # Basic TOML duplicate-key check: no header appears more than once.
    headers_seen: set[str] = set()
    for line in combined.splitlines():
        stripped = line.strip()
        if stripped.startswith("[mcp_servers."):
            assert stripped not in headers_seen, \
                f"duplicate TOML table header: {stripped}"
            headers_seen.add(stripped)
    # Partial idempotency: one new server + one already-present server.
    partial_existing = "[theme]\nfoo = \"bar\"\n\n[mcp_servers.legal-data]\ncommand = \"tsx\"\nargs = []\n"
    partial_run = render(registry_cd, "codex_local", None, existing_toml=partial_existing)
    assert "[mcp_servers.legal-data]" not in partial_run, \
        "legal-data already in file, should be skipped"
    assert "[mcp_servers.second-server]" in partial_run, \
        "second-server not in file, should be appended"

    print("OK: _possiblaw_mcp self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--registry-json", help="path to mcp-servers.yaml as JSON (or '-' for stdin)")
    parser.add_argument("--adapter", help="opencode_local | codex_local | claude_local | gemini_local")
    parser.add_argument("--agent", help="optional agent slug; filter by grantTo (advisory)")
    parser.add_argument("--merge-into", help="path to existing config JSON (or '-'); print full merged object")
    parser.add_argument(
        "--existing-toml",
        help="path to the existing ~/.codex/config.toml (codex_local only); "
             "servers whose [mcp_servers.<name>] header already appears there "
             "are skipped so the launcher is idempotent across re-launches",
    )
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not (args.registry_json and args.adapter):
        parser.error("--registry-json and --adapter are required")
    if args.adapter not in ADAPTERS:
        print(
            f"error: unknown adapter '{args.adapter}'. Valid: {', '.join(ADAPTERS)}",
            file=sys.stderr,
        )
        return 2

    registry = _read_json(args.registry_json)

    existing_toml = ""
    if args.existing_toml:
        if args.adapter != "codex_local":
            print(
                "error: --existing-toml is only applicable to codex_local",
                file=sys.stderr,
            )
            return 2
        try:
            with open(args.existing_toml, "r", encoding="utf-8") as fh:
                existing_toml = fh.read()
        except FileNotFoundError:
            pass  # target file doesn't exist yet — treat as empty

    try:
        rendered = render(registry, args.adapter, args.agent, existing_toml=existing_toml)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    if args.merge_into:
        if args.adapter == "codex_local":
            print(
                "error: --merge-into is not applicable to codex_local (TOML); "
                "the launcher appends the rendered fragment to ~/.codex/config.toml",
                file=sys.stderr,
            )
            return 2
        if args.registry_json == "-" and args.merge_into == "-":
            parser.error("cannot read both registry and merge-into from stdin")
        existing = _read_json(args.merge_into)
        if not isinstance(existing, dict):
            print("error: --merge-into target must be a JSON object", file=sys.stderr)
            return 2
        merged = _deep_merge(existing, rendered)
        json.dump(merged, sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return 0

    if args.adapter == "codex_local":
        sys.stdout.write(rendered)  # TOML text
        return 0

    json.dump(rendered, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
