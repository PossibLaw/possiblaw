#!/usr/bin/env python3
"""Validate the Paperclip health document used by production reattach."""

from __future__ import annotations

import argparse
import json
import sys


def validate_production_health(document: object) -> None:
    if not isinstance(document, dict):
        raise ValueError("health response must be a JSON object")
    if document.get("status") != "ok":
        raise ValueError("health status is not ok")
    if document.get("deploymentMode") != "authenticated":
        raise ValueError("Paperclip deploymentMode is not authenticated")
    if document.get("bootstrapStatus") != "ready":
        raise ValueError("Paperclip authenticated bootstrap is not ready")


def _self_test() -> int:
    validate_production_health(
        {
            "status": "ok",
            "deploymentMode": "authenticated",
            "bootstrapStatus": "ready",
        }
    )
    for unsafe in (
        None,
        {},
        {"status": "ok", "deploymentMode": "local_trusted", "bootstrapStatus": "ready"},
        {
            "status": "ok",
            "deploymentMode": "authenticated",
            "bootstrapStatus": "bootstrap_pending",
        },
    ):
        try:
            validate_production_health(unsafe)
            raise AssertionError(f"unsafe health accepted: {unsafe!r}")
        except ValueError:
            pass
    print("OK: _possiblaw_health self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-production", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    if not args.require_production:
        parser.error("--require-production is required")
    try:
        document = json.load(sys.stdin)
        validate_production_health(document)
    except (json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
