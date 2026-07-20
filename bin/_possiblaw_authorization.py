#!/usr/bin/env python3
"""Persist trusted import bindings and compile company-bound gate authorization.

Package slugs are consumed only from Paperclip's trusted portability import
response. Runtime compilation cross-checks the persisted immutable IDs against
the real company-agent list and never authorizes by mutable name or urlKey.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import stat
import sys
import tempfile
from pathlib import Path


SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
SAFE_SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,126}[a-z0-9])?$")
SAFE_ALIAS = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$")
SAFE_ENV = re.compile(r"^[A-Z][A-Z0-9_]{0,127}$")
VALID_TARGETS = {
    "receipts:verify",
    "receipts:bundle",
    "receipts:anchor",
    "quality:citation",
    "quality:authority",
    "receipts:facade",
    "receipts:deadline",
    "matters:classification:write",
    "matters:classification:read",
    "egress:send_email",
    "egress:share_external",
    "egress:upload_document",
    "egress:query_external_model",
    "egress:file_court_document",
    "egress:sign_document",
    "egress:send_payment",
    "egress:delete_external_resource",
}


def _plain_dict(value: object) -> bool:
    return isinstance(value, dict)


def _agent_list(document: object, label: str) -> list[dict[str, object]]:
    if isinstance(document, list):
        raw = document
    elif isinstance(document, dict):
        raw = document.get("agents") or document.get("data") or document.get("items")
    else:
        raw = None
    if not isinstance(raw, list) or not raw:
        raise ValueError(f"{label} must contain a non-empty agent array")
    if not all(isinstance(item, dict) for item in raw):
        raise ValueError(f"{label} contains a malformed agent entry")
    return raw  # type: ignore[return-value]


def compile_bindings(
    import_response: object,
    company_id: str,
    catalog_root: Path,
) -> dict[str, object]:
    """Persist the trusted portability import's package slug -> immutable ID map."""
    if not SAFE_ID.fullmatch(company_id):
        raise ValueError("company id is invalid")
    bindings: dict[str, str] = {}
    seen_ids: set[str] = set()
    for entry in _agent_list(import_response, "import response"):
        slug = entry.get("slug")
        agent_id = entry.get("id")
        if not isinstance(slug, str) or not SAFE_SLUG.fullmatch(slug):
            raise ValueError("import response contains an invalid package slug")
        if not isinstance(agent_id, str) or not SAFE_ID.fullmatch(agent_id):
            raise ValueError(f"import response contains no immutable id for package agent {slug}")
        if not (catalog_root / slug / "AGENTS.md").is_file():
            raise ValueError(f"import response references unknown package agent: {slug}")
        if slug in bindings or agent_id in seen_ids:
            raise ValueError("import response contains a duplicate package slug or immutable id")
        bindings[slug] = agent_id
        seen_ids.add(agent_id)
    return {
        "version": 1,
        "companyId": company_id,
        "agents": bindings,
    }


def _binding_map(document: object, company_id: str, catalog_root: Path) -> dict[str, str]:
    if not _plain_dict(document) or set(document) != {"version", "companyId", "agents"}:
        raise ValueError("principal bindings must contain exactly version, companyId, and agents")
    if document.get("version") != 1 or document.get("companyId") != company_id:
        raise ValueError("principal bindings version or company mismatch")
    raw = document.get("agents")
    if not _plain_dict(raw) or not raw or len(raw) > 512:
        raise ValueError("principal bindings agents must be a non-empty bounded mapping")
    bindings: dict[str, str] = {}
    seen_ids: set[str] = set()
    for slug, agent_id in raw.items():
        if not isinstance(slug, str) or not SAFE_SLUG.fullmatch(slug):
            raise ValueError("principal bindings contain an invalid package slug")
        if not isinstance(agent_id, str) or not SAFE_ID.fullmatch(agent_id):
            raise ValueError("principal bindings contain an invalid immutable agent id")
        if not (catalog_root / slug / "AGENTS.md").is_file():
            raise ValueError(f"principal bindings reference unknown package agent: {slug}")
        if agent_id in seen_ids:
            raise ValueError("principal bindings reuse an immutable agent id")
        bindings[slug] = agent_id
        seen_ids.add(agent_id)
    return bindings


def _live_agent_ids(document: object, company_id: str) -> set[str]:
    ids: set[str] = set()
    for entry in _agent_list(document, "live agent response"):
        agent_id = entry.get("id")
        entry_company = entry.get("companyId")
        if not isinstance(agent_id, str) or not SAFE_ID.fullmatch(agent_id):
            raise ValueError("live agent response contains an invalid immutable agent id")
        if not isinstance(entry_company, str) or entry_company != company_id:
            raise ValueError("live agent response contains a missing or cross-company company id")
        if agent_id in ids:
            raise ValueError("live agent response contains a duplicate immutable agent id")
        ids.add(agent_id)
    return ids


def compile_authorization(
    template: object,
    bindings_document: object,
    live_agents_document: object,
    company_id: str,
    catalog_root: Path,
    env: dict[str, str],
) -> dict[str, object]:
    if not SAFE_ID.fullmatch(company_id):
        raise ValueError("company id is invalid")
    if not _plain_dict(template) or set(template) != {
        "version", "default", "grants", "destinations", "destinationGrants"
    }:
        raise ValueError(
            "authorization template must contain exactly version, default, grants, destinations, and destinationGrants"
        )
    if template.get("version") != 1 or template.get("default") != "deny":
        raise ValueError("authorization template must use version 1 and default deny")
    grants = template.get("grants")
    if not _plain_dict(grants) or len(grants) > 512:
        raise ValueError("authorization template grants must be a bounded mapping")

    agents_by_slug = _binding_map(bindings_document, company_id, catalog_root)
    live_agent_ids = _live_agent_ids(live_agents_document, company_id)
    missing_live_ids = sorted(set(agents_by_slug.values()) - live_agent_ids)
    if missing_live_ids:
        raise ValueError("principal bindings contain an agent id absent from the live company")

    resolved: dict[str, list[str]] = {}
    for slug, raw_targets in sorted(grants.items()):
        if not isinstance(slug, str) or not SAFE_SLUG.fullmatch(slug):
            raise ValueError("authorization template contains an invalid agent slug")
        if not (catalog_root / slug / "AGENTS.md").is_file():
            raise ValueError(f"authorization template references unknown package agent: {slug}")
        if not isinstance(raw_targets, list) or len(raw_targets) > 32:
            raise ValueError(f"authorization targets for {slug} must be a bounded list")
        targets: list[str] = []
        for target in raw_targets:
            if not isinstance(target, str) or target not in VALID_TARGETS:
                raise ValueError(f"authorization template contains an unknown target for {slug}")
            if target in targets:
                raise ValueError(f"authorization template contains a duplicate target for {slug}")
            targets.append(target)
        present = agents_by_slug.get(slug)
        if present is not None:
            resolved[present] = targets

    destinations_template = template.get("destinations")
    if not _plain_dict(destinations_template) or len(destinations_template) > 64:
        raise ValueError("authorization destinations must be a bounded mapping")
    resolved_destinations: dict[str, dict[str, str]] = {}
    for alias, raw_destination in sorted(destinations_template.items()):
        if not isinstance(alias, str) or not SAFE_ALIAS.fullmatch(alias) or not _plain_dict(raw_destination):
            raise ValueError("authorization template contains an invalid destination")
        provider = raw_destination.get("provider")
        required = raw_destination.get("required")
        if not isinstance(required, bool):
            raise ValueError(f"destination {alias} requires a boolean required field")
        env_names: list[str]
        if provider == "gdrive" and set(raw_destination) == {"provider", "folderIdEnv", "required"}:
            env_names = [raw_destination.get("folderIdEnv")]  # type: ignore[list-item]
        elif provider == "onedrive" and set(raw_destination) == {
            "provider", "driveIdEnv", "parentItemIdEnv", "required"
        }:
            env_names = [
                raw_destination.get("driveIdEnv"),  # type: ignore[list-item]
                raw_destination.get("parentItemIdEnv"),  # type: ignore[list-item]
            ]
        else:
            raise ValueError(f"destination {alias} has an invalid provider-specific schema")
        if not all(isinstance(name, str) and SAFE_ENV.fullmatch(name) for name in env_names):
            raise ValueError(f"destination {alias} contains an invalid environment reference")
        values = [env.get(name, "") for name in env_names]
        if not all(values):
            if required:
                raise ValueError(f"required destination {alias} is not configured")
            continue
        if not all(
            1 <= len(value) <= 512 and not re.search(r"[/\s\x00-\x1f\x7f]", value)
            for value in values
        ):
            raise ValueError(f"destination {alias} resolved an unsafe vendor id")
        if provider == "gdrive":
            resolved_destinations[alias] = {"provider": "gdrive", "folderId": values[0]}
        else:
            resolved_destinations[alias] = {
                "provider": "onedrive",
                "driveId": values[0],
                "parentItemId": values[1],
            }

    destination_grants_template = template.get("destinationGrants")
    if not _plain_dict(destination_grants_template) or len(destination_grants_template) > 512:
        raise ValueError("authorization destinationGrants must be a bounded mapping")
    resolved_destination_grants: dict[str, list[str]] = {}
    for slug, raw_aliases in sorted(destination_grants_template.items()):
        if not isinstance(slug, str) or not SAFE_SLUG.fullmatch(slug):
            raise ValueError("authorization destination grant contains an invalid agent slug")
        if not (catalog_root / slug / "AGENTS.md").is_file():
            raise ValueError(f"authorization destination grant references unknown package agent: {slug}")
        if not isinstance(raw_aliases, list) or len(raw_aliases) > 32:
            raise ValueError(f"destination grants for {slug} must be a bounded list")
        aliases: list[str] = []
        for alias in raw_aliases:
            if not isinstance(alias, str) or alias not in destinations_template or alias in aliases:
                raise ValueError(f"destination grants for {slug} contain an unknown or duplicate alias")
            aliases.append(alias)
        present = agents_by_slug.get(slug)
        if present is not None:
            available_aliases = [alias for alias in aliases if alias in resolved_destinations]
            if available_aliases:
                if "egress:upload_document" not in resolved.get(present, []):
                    raise ValueError(f"destination-granted agent {slug} lacks egress:upload_document")
                resolved_destination_grants[present] = available_aliases

    return {
        "version": 1,
        "companyId": company_id,
        "default": "deny",
        "grants": resolved,
        "destinations": resolved_destinations,
        "destinationGrants": resolved_destination_grants,
    }


def write_private_json(path: Path, document: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        raise ValueError("refusing symlink authorization output")
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(document, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
        os.chmod(path, 0o600)
        dir_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except Exception:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass
        raise


def read_private_json(path: Path) -> object:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    try:
        fd = os.open(path, flags)
    except OSError as exc:
        raise ValueError("principal bindings could not be opened safely") from exc
    try:
        info = os.fstat(fd)
        if (
            not stat.S_ISREG(info.st_mode)
            or info.st_uid != os.geteuid()
            or info.st_nlink != 1
            or stat.S_IMODE(info.st_mode) != 0o600
        ):
            raise ValueError("principal bindings file has unsafe ownership, type, links, or mode")
        raw = os.read(fd, 1024 * 1024 + 1)
        if len(raw) > 1024 * 1024:
            raise ValueError("principal bindings file is too large")
    finally:
        os.close(fd)
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError("principal bindings file is not valid UTF-8 JSON") from exc


def _self_test() -> int:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        catalog = root / "agents"
        for slug in ("deliverables-courier", "legal-citation-checker", "deadline-calculator"):
            d = catalog / slug
            d.mkdir(parents=True)
            (d / "AGENTS.md").write_text(f"---\nslug: {slug}\n---\n", encoding="utf-8")
        template = {
            "version": 1,
            "default": "deny",
            "grants": {
                "deliverables-courier": ["egress:upload_document"],
                "legal-citation-checker": ["quality:citation"],
                "deadline-calculator": ["receipts:deadline"],
            },
            "destinations": {
                "firm-review-google": {
                    "provider": "gdrive",
                    "folderIdEnv": "TEST_GDRIVE_FOLDER",
                    "required": False,
                }
            },
            "destinationGrants": {
                "deliverables-courier": ["firm-review-google"],
            },
        }
        import_response = {"agents": [
            {"id": "agent-courier-1", "slug": "deliverables-courier"},
            {"id": "agent-quality-1", "slug": "legal-citation-checker"},
        ]}
        bindings = compile_bindings(import_response, "company-1", catalog)
        live_agents = [
            {
                "id": "agent-courier-1",
                "companyId": "company-1",
                "urlKey": "mutable-display-key",
            },
            {
                "id": "agent-quality-1",
                "companyId": "company-1",
                "urlKey": "renamed-agent",
            },
        ]
        compiled = compile_authorization(
            template,
            bindings,
            live_agents,
            "company-1",
            catalog,
            {"TEST_GDRIVE_FOLDER": "folder-server-1"},
        )
        assert compiled["grants"] == {
            "agent-courier-1": ["egress:upload_document"],
            "agent-quality-1": ["quality:citation"],
        }
        assert "deliverables-courier" not in compiled["grants"]
        assert compiled["destinations"] == {
            "firm-review-google": {"provider": "gdrive", "folderId": "folder-server-1"}
        }
        assert compiled["destinationGrants"] == {
            "agent-courier-1": ["firm-review-google"]
        }
        output = root / "runtime.json"
        write_private_json(output, compiled)
        assert (output.stat().st_mode & 0o777) == 0o600
        bindings_path = root / "bindings.json"
        write_private_json(bindings_path, bindings)
        assert read_private_json(bindings_path) == bindings
        try:
            compile_bindings({
                "agents": [
                    {"id": "a-1", "slug": "deliverables-courier"},
                    {"id": "a-2", "slug": "deliverables-courier"},
                ]
            }, "company-1", catalog)
            raise AssertionError("duplicate agent slug was accepted")
        except ValueError:
            pass
        try:
            compile_authorization(
                template,
                bindings,
                [{"id": "agent-courier-1", "companyId": "company-2"}],
                "company-1",
                catalog,
                {"TEST_GDRIVE_FOLDER": "folder-server-1"},
            )
            raise AssertionError("cross-company live agent entry was accepted")
        except ValueError:
            pass
        os.chmod(bindings_path, 0o644)
        try:
            read_private_json(bindings_path)
            raise AssertionError("unsafe principal-bindings mode was accepted")
        except ValueError:
            pass
    print("OK: _possiblaw_authorization self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--template")
    parser.add_argument("--agents")
    parser.add_argument("--bindings")
    parser.add_argument("--import-response")
    parser.add_argument("--company-id")
    parser.add_argument("--catalog-root")
    parser.add_argument("--output")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        return _self_test()
    common = (args.company_id, args.catalog_root, args.output)
    if any(value is None for value in common):
        parser.error("--company-id, --catalog-root, and --output are required")
    try:
        catalog_root = Path(args.catalog_root)
        if args.import_response is not None:
            if args.template is not None or args.agents is not None or args.bindings is not None:
                parser.error("--import-response cannot be combined with --template, --agents, or --bindings")
            import_response = json.loads(Path(args.import_response).read_text(encoding="utf-8"))
            write_private_json(
                Path(args.output),
                compile_bindings(import_response, args.company_id, catalog_root),
            )
        else:
            if args.template is None or args.agents is None or args.bindings is None:
                parser.error("runtime compile requires --template, --bindings, and --agents")
            template = json.loads(Path(args.template).read_text(encoding="utf-8"))
            agents = json.loads(Path(args.agents).read_text(encoding="utf-8"))
            bindings = read_private_json(Path(args.bindings))
            compiled = compile_authorization(
                template,
                bindings,
                agents,
                args.company_id,
                catalog_root,
                dict(os.environ),
            )
            write_private_json(Path(args.output), compiled)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
