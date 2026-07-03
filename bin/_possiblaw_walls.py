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
