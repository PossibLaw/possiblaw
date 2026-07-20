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
import stat
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


def validate_companies(companies) -> list:
    if not isinstance(companies, list) or not all(isinstance(c, dict) for c in companies):
        raise ValueError("companies JSON must be an array of company objects")
    return companies


def check_collision(org_name: str, companies: list) -> str:
    prefix = derive_prefix(org_name)
    for c in companies:
        raw_existing = c.get("issuePrefix")
        if not isinstance(raw_existing, str) or not re.fullmatch(
            r"[A-Za-z0-9]{3,16}", raw_existing
        ):
            raise ValueError(
                "paperclip company payload is missing a valid issuePrefix; "
                "refusing to rely on an unverified wall-collision contract"
            )
        existing = raw_existing.upper()
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


def load_registry_strict(path: str) -> list:
    """Load a production registry without converting custody errors to empty."""
    with open(path, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, list):
        raise ValueError("walls registry must be a JSON array")
    return data


def validate_production_registry(
    registry: list, *, paperclip_port: int, firm_gate_port: int, receipts_root: str
) -> list:
    """Return active wall records after fail-closed production validation."""
    if not isinstance(registry, list):
        raise ValueError("walls registry must be a JSON array")
    if not 1 <= paperclip_port <= 65535 or not 1 <= firm_gate_port <= 65535:
        raise ValueError("Paperclip and firm gate ports must be in 1..65535")

    active: list[dict] = []
    prefixes: set[str] = set()
    company_ids: set[str] = set()
    ports = {paperclip_port, firm_gate_port}
    receipt_paths: set[str] = set()
    required = {"prefix", "companyId", "gatePort", "receiptsPath", "status"}

    for index, record in enumerate(registry):
        if not isinstance(record, dict):
            raise ValueError(f"walls registry entry {index} must be an object")
        status = record.get("status")
        if status not in {"active", "inactive"}:
            raise ValueError(f"walls registry entry {index} has invalid status")
        if status != "active":
            continue
        missing = sorted(key for key in required if record.get(key) in (None, ""))
        if missing:
            raise ValueError(f"active wall entry {index} missing fields: {missing}")

        prefix = record["prefix"]
        company_id = record["companyId"]
        gate_port = record["gatePort"]
        receipts_path = record["receiptsPath"]
        if not isinstance(prefix, str) or not re.fullmatch(r"[A-Z0-9]{3,16}", prefix):
            raise ValueError(f"active wall entry {index} has unsafe prefix")
        if not isinstance(company_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{1,128}", company_id):
            raise ValueError(f"active wall entry {index} has unsafe companyId")
        if isinstance(gate_port, bool) or not isinstance(gate_port, int) or not 1 <= gate_port <= 65535:
            raise ValueError(f"active wall entry {index} has invalid gatePort")
        try:
            normalized_receipts = validate_receipts_path(receipts_path, receipts_root)
        except ValueError as exc:
            raise ValueError(f"active wall entry {index} has unsafe receiptsPath: {exc}") from exc
        if prefix in prefixes:
            raise ValueError(f"duplicate active wall prefix: {prefix}")
        if company_id in company_ids:
            raise ValueError(f"duplicate active wall companyId: {company_id}")
        if gate_port in ports:
            raise ValueError(f"duplicate or reserved active wall gatePort: {gate_port}")
        if normalized_receipts in receipt_paths:
            raise ValueError(f"duplicate active wall receiptsPath: {receipts_path}")
        prefixes.add(prefix)
        company_ids.add(company_id)
        ports.add(gate_port)
        receipt_paths.add(normalized_receipts)
        active.append(record)
    return active


def validate_receipts_path(receipts_path: object, receipts_root: str) -> str:
    if not isinstance(receipts_path, str) or not os.path.isabs(receipts_path):
        raise ValueError("receipts path must be absolute")
    if not os.path.isabs(receipts_root):
        raise ValueError("receipts root must be absolute")
    absolute_root = os.path.abspath(receipts_root)
    # A symlink beneath the operator's home can redirect a custody root. Do
    # not reject OS-managed ancestor symlinks (for example macOS /var), but do
    # reject every existing component from $HOME down to the configured root.
    home = os.path.abspath(os.path.expanduser("~"))
    try:
        beneath_home = os.path.commonpath([home, absolute_root]) == home
    except ValueError:
        beneath_home = False
    if beneath_home:
        cursor = home
        components = os.path.relpath(absolute_root, home).split(os.path.sep)
    else:
        cursor = os.path.dirname(absolute_root)
        components = [os.path.basename(absolute_root)]
    for component in components:
        cursor = os.path.join(cursor, component)
        if os.path.lexists(cursor):
            info = os.lstat(cursor)
            if stat.S_ISLNK(info.st_mode):
                raise ValueError("receipts root must not traverse symlinks")
            if not stat.S_ISDIR(info.st_mode):
                raise ValueError("existing receipts-root components must be directories")
            if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o022:
                raise ValueError("existing receipts-root components must be owned and private")

    root = os.path.realpath(absolute_root)
    resolved = os.path.realpath(receipts_path)
    try:
        contained = os.path.commonpath([root, resolved]) == root
    except ValueError:
        contained = False
    if not contained or resolved == root:
        raise ValueError("receipts path must stay beneath the dedicated custody root")

    # Reject symlinks in every existing component beneath the custody root.
    relative = os.path.relpath(os.path.abspath(receipts_path), absolute_root)
    cursor = absolute_root
    path_components = relative.split(os.sep)
    for index, component in enumerate(path_components):
        cursor = os.path.join(cursor, component)
        if os.path.lexists(cursor):
            info = os.lstat(cursor)
            if stat.S_ISLNK(info.st_mode):
                raise ValueError("receipts path must not traverse symlinks")
            is_final = index == len(path_components) - 1
            if not is_final and not stat.S_ISDIR(info.st_mode):
                raise ValueError("existing custody ancestors must be directories")
            if is_final and not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
                raise ValueError("existing custody target must be a regular file or directory")
            if info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) & 0o022:
                raise ValueError("existing custody components must be owned and private")
    return resolved


def upsert_wall(registry: list, record: dict) -> list:
    required = {"name", "companyId", "prefix", "gatePort", "receiptsPath", "status"}
    missing = required - set(record)
    if missing:
        raise ValueError(f"wall record missing fields: {sorted(missing)}")
    for existing in registry:
        if (
            existing.get("prefix") == record["prefix"]
            and existing.get("companyId") != record["companyId"]
        ):
            raise ValueError(
                f"wall prefix {record['prefix']} is already bound to another company"
            )
    out = [w for w in registry if w.get("companyId") != record["companyId"]]
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
        check_collision("Acme Litigation", [{"name": "Broken API contract"}])
        raise AssertionError("missing issuePrefix must fail closed")
    except ValueError as exc:
        assert "issuePrefix" in str(exc)
    try:
        check_collision("Possible Corp", companies)  # POS collides
        raise AssertionError("collision must raise")
    except LookupError as exc:
        assert "POS" in str(exc) and "PossibLaw" in str(exc)

    # validate_companies: valid list of dicts passes through unchanged
    good = [{"name": "x", "issuePrefix": "ABC"}]
    assert validate_companies(good) == good
    # Non-list JSON raises ValueError
    try:
        validate_companies({"error": "boom"})
        raise AssertionError("non-list JSON must raise")
    except ValueError as exc:
        assert "array of company objects" in str(exc)
    # List with non-dict elements raises ValueError
    try:
        validate_companies(["not-a-dict"])
        raise AssertionError("list with non-dict must raise")
    except ValueError as exc:
        assert "array of company objects" in str(exc)

    rec = {
        "name": "Acme Litigation", "companyId": "c-1", "prefix": "ACM",
        "gatePort": 3802, "receiptsPath": "/tmp/r.jsonl",
        "facadeConfig": None, "status": "active", "createdAt": "2026-07-02T00:00:00Z",
    }
    reg = upsert_wall([], rec)
    assert len(reg) == 1
    reg = upsert_wall(reg, {**rec, "gatePort": 3803})  # upsert by company id
    assert len(reg) == 1 and reg[0]["gatePort"] == 3803
    try:
        upsert_wall(reg, {**rec, "companyId": "c-2"})
        raise AssertionError("same prefix for a different company must fail closed")
    except ValueError as exc:
        assert "prefix" in str(exc)
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
        receipts_root = os.path.join(td, "receipts")
        safe_receipt = os.path.join(receipts_root, "custody", "receipts.jsonl")
        assert validate_receipts_path(safe_receipt, receipts_root) == os.path.realpath(safe_receipt)
        os.mkdir(receipts_root, 0o700)
        os.chmod(receipts_root, 0o777)
        try:
            validate_receipts_path(safe_receipt, receipts_root)
            raise AssertionError("writable custody root must raise")
        except ValueError:
            pass
        os.chmod(receipts_root, 0o700)
        try:
            validate_receipts_path(os.path.join(td, "outside.jsonl"), receipts_root)
            raise AssertionError("receipt path outside custody root must raise")
        except ValueError:
            pass
        symlink_root = os.path.join(td, "receipts-link")
        os.symlink(td, symlink_root)
        try:
            validate_receipts_path(os.path.join(symlink_root, "receipt.jsonl"), symlink_root)
            raise AssertionError("symlinked custody root must raise")
        except ValueError:
            pass

        good = [{
            "status": "active", "prefix": "ACM", "companyId": "c-1",
            "gatePort": 3802, "receiptsPath": os.path.join(td, "acm.jsonl"),
        }]
        assert validate_production_registry(
            good, paperclip_port=3100, firm_gate_port=3801, receipts_root=td
        ) == good
        try:
            validate_production_registry(
                [{**good[0], "prefix": "../BAD", "gatePort": 3801}],
                paperclip_port=3100,
                firm_gate_port=3801,
                receipts_root=td,
            )
            raise AssertionError("unsafe production registry must raise")
        except ValueError:
            pass
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
    parser.add_argument("--validate-production", action="store_true")
    parser.add_argument("--paperclip-port", type=int)
    parser.add_argument("--firm-gate-port", type=int)
    parser.add_argument("--receipts-root")
    parser.add_argument("--validate-receipts-path")
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
            print(check_collision(args.name, validate_companies(companies)))
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
        if args.registry and args.validate_production:
            if args.paperclip_port is None or args.firm_gate_port is None or not args.receipts_root:
                print(
                    "--validate-production requires --paperclip-port, --firm-gate-port, and --receipts-root",
                    file=sys.stderr,
                )
                return 2
            active = validate_production_registry(
                load_registry_strict(args.registry),
                paperclip_port=args.paperclip_port,
                firm_gate_port=args.firm_gate_port,
                receipts_root=args.receipts_root,
            )
            print(json.dumps(active))
            return 0
        if args.validate_receipts_path:
            if not args.receipts_root:
                print("--validate-receipts-path requires --receipts-root", file=sys.stderr)
                return 2
            print(validate_receipts_path(args.validate_receipts_path, args.receipts_root))
            return 0
        if args.alloc_gate_port:
            if not args.registry:
                print("--alloc-gate-port requires --registry", file=sys.stderr)
                return 2
            print(alloc_gate_port(load_registry(args.registry), args.base))
            return 0
    except (ValueError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    except LookupError as exc:
        print(str(exc), file=sys.stderr)
        return 3
    parser.print_usage(file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
