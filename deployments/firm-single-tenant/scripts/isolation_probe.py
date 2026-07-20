#!/usr/bin/env python3
"""Emit a redacted, deterministic isolation attestation from inside one worker."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import socket
import tempfile
import urllib.error
import urllib.request
from pathlib import Path


HEX64 = re.compile(r"^[0-9a-f]{64}$")


def _read_one_line(path: str) -> str:
    try:
        value = Path(path).read_text(encoding="utf-8")
    except OSError:
        return ""
    lines = value.splitlines()
    return lines[0] if len(lines) == 1 else ""


def _http_status(url: str, bearer: str = "") -> int:
    headers = {"Authorization": f"Bearer {bearer}"} if bearer else {}
    request = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=3) as response:
            response.read(512)
            return response.status
    except urllib.error.HTTPError as error:
        error.read(512)
        return error.code
    except (OSError, urllib.error.URLError, ValueError):
        return 0


def _tcp_unreachable(host: str, port: int) -> bool:
    try:
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except OSError:
        return True
    for family, socktype, proto, _canonname, address in addresses:
        candidate = socket.socket(family, socktype, proto)
        candidate.settimeout(2)
        try:
            candidate.connect(address)
        except OSError:
            continue
        finally:
            candidate.close()
        return False
    return True


def _root_filesystem_read_only() -> bool:
    probe = Path("/usr/local/share/.possiblaw-write-probe")
    try:
        probe.write_bytes(b"probe")
    except OSError:
        return True
    try:
        probe.unlink()
    except OSError:
        pass
    return False


def _workspace_writable() -> bool:
    try:
        with tempfile.NamedTemporaryFile(prefix=".isolation-", dir="/workspace", delete=True) as handle:
            handle.write(b"probe")
            handle.flush()
        return True
    except OSError:
        return False


def _status_field(name: str) -> str:
    try:
        status = Path("/proc/self/status").read_text(encoding="utf-8")
    except OSError:
        return ""
    for line in status.splitlines():
        if line.startswith(f"{name}:"):
            return line.split(":", 1)[1].strip()
    return ""


def _process_namespace_excludes_control() -> bool:
    forbidden = (b"server/dist/index.js", b"postgres", b"gate-proxy")
    for cmdline_path in Path("/proc").glob("[0-9]*/cmdline"):
        try:
            cmdline = cmdline_path.read_bytes()
        except OSError:
            continue
        if any(marker in cmdline for marker in forbidden):
            return False
    return True


def _workspace_manifest_sha256() -> str:
    path = Path("/workspace/.possiblaw-workspace-manifest.sha256")
    try:
        payload = path.read_bytes()
    except OSError:
        payload = b""
    return hashlib.sha256(payload).hexdigest()


def main() -> int:
    gate_url = os.environ.get("POSSIBLAW_GATE_URL", "")
    gate_key = _read_one_line(os.environ.get("POSSIBLAW_GATE_API_KEY_FILE", ""))
    bridge_key = os.environ.get("PAPERCLIP_API_KEY", "")
    ai_url = os.environ.get("POSSIBLAW_AI_GATEWAY_URL", "")
    ai_key = _read_one_line(os.environ.get("POSSIBLAW_AI_GATEWAY_API_KEY_FILE", ""))
    peer_host = os.environ.get("POSSIBLAW_PEER_WORKER_HOST", "worker-peer")
    peer_ip = os.environ.get("POSSIBLAW_PEER_WORKER_IP", "192.0.2.1")
    foreign_host = os.environ.get("POSSIBLAW_FOREIGN_COMPANY_HOST", "foreign-company")
    foreign_ip = os.environ.get("POSSIBLAW_FOREIGN_COMPANY_IP", "192.0.2.2")
    ssh_ingress_host = os.environ.get("POSSIBLAW_SSH_INGRESS_HOST", "ssh-ingress")

    sensitive_env = {
        "ANTHROPIC_API_KEY",
        "BETTER_AUTH_SECRET",
        "DATABASE_URL",
        "EXTERNAL_MODEL_API_KEY",
        "GDRIVE_ACCESS_TOKEN",
        "GMAIL_TOKEN",
        "MS_GRAPH_TOKEN",
        "NOTION_API_KEY",
        "OPENAI_API_KEY",
        "POSTGRES_PASSWORD",
        "PAPERCLIP_GATE_API_KEY",
    }
    forbidden_paths = (
        Path("/run/secrets/better_auth_secret"),
        Path("/run/secrets/postgres_password"),
        Path("/paperclip"),
        Path("/var/lib/postgresql/data"),
    )

    results: dict[str, bool | str] = {
        "root_filesystem_read_only": _root_filesystem_read_only(),
        "workspace_writable": _workspace_writable(),
        "host_secret_paths_unreadable": all(not path.exists() and not os.access(path, os.R_OK) for path in forbidden_paths),
        "sensitive_environment_absent": all(not os.environ.get(name) for name in sensitive_env),
        "process_namespace_excludes_control": _process_namespace_excludes_control(),
        "no_new_privileges": _status_field("NoNewPrivs") == "1",
        "capabilities_empty": int(_status_field("CapEff") or "1", 16) == 0,
        "docker_socket_unavailable": not Path("/var/run/docker.sock").exists(),
        "gate_reachable": bool(gate_url) and _http_status(f"{gate_url}/health") == 200,
        "gate_denies_sacrificial_capability": bool(gate_url and gate_key)
        and _http_status(f"{gate_url}/receipts/verify", gate_key) == 403,
        "gate_credential_separate_from_bridge": bool(gate_key and bridge_key)
        and not hmac.compare_digest(gate_key, bridge_key),
        "ai_gateway_reachable": bool(ai_url and ai_key)
        and _http_status(f"{ai_url}/health", ai_key) == 200,
        "direct_vendor_network_blocked": all(
            _tcp_unreachable(host, 443)
            for host in ("api.anthropic.com", "api.openai.com", "www.googleapis.com")
        ),
        "paperclip_control_plane_unreachable": _tcp_unreachable("paperclip", 3100)
        and _tcp_unreachable("172.30.0.20", 3100),
        "control_network_unreachable": all(
            _tcp_unreachable(host, port)
            for host, port in (
                ("172.30.0.30", 3802),
                ("172.30.0.51", 2222),
                ("172.30.0.52", 2222),
            )
        ),
        "ssh_ingress_reverse_path_blocked": _tcp_unreachable(ssh_ingress_host, 2222),
        "peer_worker_unreachable": _tcp_unreachable(peer_host, 2222)
        and _tcp_unreachable(peer_ip, 2222),
        "foreign_company_unreachable": _tcp_unreachable(foreign_host, 4000)
        and _tcp_unreachable(foreign_ip, 4000),
        "workspace_manifest_sha256": _workspace_manifest_sha256(),
    }

    print(json.dumps(results, sort_keys=True, separators=(",", ":")))
    valid = all(value is True for value in results.values() if isinstance(value, bool))
    valid = valid and all(HEX64.fullmatch(value) for value in results.values() if isinstance(value, str))
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
