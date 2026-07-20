#!/usr/bin/env python3
"""Validate that every production agent is bound to the attested gate URL."""

from __future__ import annotations

import argparse
import json
import sys


PRODUCTION_SECRET_OVERRIDES = (
    "BETTER_AUTH_SECRET",
    "PAPERCLIP_SECRETS_MASTER_KEY",
    "PAPERCLIP_SECRETS_MASTER_KEY_FILE",
)


def require_gate_url(document: object, expected_url: str, require_secret_scrub: bool = False) -> int:
    if isinstance(document, list):
        agents = document
    elif isinstance(document, dict):
        agents = document.get("agents") or document.get("data") or document.get("items")
    else:
        agents = None
    if not isinstance(agents, list) or not agents:
        raise ValueError("agent response must contain a non-empty agent array")

    checked = 0
    for index, agent in enumerate(agents):
        if not isinstance(agent, dict) or not agent.get("id"):
            raise ValueError(f"agent entry {index} is malformed")
        config = agent.get("adapterConfig")
        env = config.get("env") if isinstance(config, dict) else None
        actual = env.get("GATE_PROXY_URL") if isinstance(env, dict) else None
        if actual != expected_url:
            identity = agent.get("slug") or agent.get("id") or index
            raise ValueError(f"agent {identity} is not bound to the expected gate URL")
        if require_secret_scrub:
            missing = [key for key in PRODUCTION_SECRET_OVERRIDES if env.get(key) != ""]
            if missing:
                identity = agent.get("slug") or agent.get("id") or index
                raise ValueError(f"agent {identity} is missing production secret overrides")
        checked += 1
    return checked


def _self_test() -> int:
    expected = "http://127.0.0.1:3801"
    assert require_gate_url(
        [{"id": "a-1", "adapterConfig": {"env": {"GATE_PROXY_URL": expected}}}],
        expected,
    ) == 1
    scrubbed = {
        "id": "a-1",
        "adapterConfig": {
            "env": {
                "GATE_PROXY_URL": expected,
                **{key: "" for key in PRODUCTION_SECRET_OVERRIDES},
            }
        },
    }
    assert require_gate_url([scrubbed], expected, True) == 1
    for unsafe in ([], [{"id": "a-1", "adapterConfig": {"env": {}}}], {"error": "no"}):
        try:
            require_gate_url(unsafe, expected)
            raise AssertionError(f"unsafe agent response accepted: {unsafe!r}")
        except ValueError:
            pass
    print("OK: _possiblaw_agents self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-gate-url")
    parser.add_argument("--require-production-secret-scrub", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    if not args.require_gate_url:
        parser.error("--require-gate-url is required")
    try:
        count = require_gate_url(
            json.load(sys.stdin),
            args.require_gate_url,
            args.require_production_secret_scrub,
        )
    except (json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    print(count)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
