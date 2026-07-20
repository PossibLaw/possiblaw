#!/usr/bin/env python3
"""Strict, dependency-free validator for ``possiblaw/config/v1`` JSON.

This module intentionally does not import, start, or mutate Paperclip. It is the
portable configuration-contract foundation for later launcher integration.
"""

from __future__ import annotations

import argparse
import copy
import json
import pathlib
import re
import sys
import zoneinfo
from dataclasses import dataclass
from typing import Any, Mapping, Sequence


SCHEMA_ID = "possiblaw/config/v1"
SCHEMA_FILE = pathlib.Path(__file__).with_name("schema") / "possiblaw-config-v1.schema.json"
CONNECTOR_CONTRACTS_FILE = pathlib.Path(__file__).with_name("catalog") / "connectors-v1.json"
DEFAULT_REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
MAX_CONFIG_BYTES = 1024 * 1024

# These are the reference packs named by the production-parity plan. Milestone
# 5 will replace this temporary catalog with declarative pack manifests.
REFERENCE_WORKFLOW_PACKS = frozenset(
    {
        "inhouse-commercial",
        "inhouse-privacy",
        "inhouse-product",
        "inhouse-ai-regulatory",
        "firm-corporate",
        "firm-litigation",
        "firm-employment",
        "firm-ip",
    }
)

RAW_SECRET_KEYS = frozenset(
    {
        "accesstoken",
        "apikey",
        "clientsecret",
        "credential",
        "credentials",
        "password",
        "privatekey",
        "refreshtoken",
        "secret",
        "token",
    }
)

SECRET_VALUE_PATTERNS = (
    re.compile(r"^sk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{12,}$"),
    re.compile(r"^gh[pousr]_[A-Za-z0-9]{20,}$"),
    re.compile(r"^xox[baprs]-[A-Za-z0-9-]{12,}$"),
    re.compile(r"^Bearer\s+\S+$", flags=re.IGNORECASE),
    re.compile(r"^-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"^AKIA[0-9A-Z]{16}$"),
    re.compile(r"^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$"),
    re.compile(r"^(?:ya29\.|1//)[A-Za-z0-9._/-]{12,}$"),
)

SUPPORTED_SCHEMA_KEYWORDS = frozenset(
    {
        "$schema", "$id", "$defs", "$ref", "title", "type", "additionalProperties",
        "required", "properties", "patternProperties", "oneOf", "const", "enum", "default",
        "minLength", "maxLength", "pattern", "minimum", "maximum", "minItems", "maxItems",
        "uniqueItems", "items", "maxProperties",
    }
)

GATE_BOUNDARIES = frozenset(
    {
        "THIRD_PARTY_EGRESS",
        "CONFIDENTIAL_TO_CLOUD",
        "COURT_FILING",
        "SIGNATURE",
        "MONEY_MOVEMENT",
        "IRREVERSIBLE_EXTERNAL_OP",
    }
)
GATE_DECISIONS = frozenset({"allow", "anonymize", "human", "block"})
GATE_TARGET_TO_TOOL = {
    "egress:send_email": "send_email",
    "egress:share_external": "share_external",
    "egress:upload_document": "upload_document",
    "egress:query_external_model": "query_external_model",
    "egress:file_court_document": "file_court_document",
    "egress:sign_document": "sign_document",
    "egress:send_payment": "send_payment",
    "egress:delete_external_resource": "delete_external_resource",
}


class ConfigError(ValueError):
    """Raised when a configuration fails schema or repository validation."""


@dataclass(frozen=True)
class Catalogs:
    agents: frozenset[str]
    skills: frozenset[str]
    connectors: frozenset[str]
    variants: frozenset[str]
    lanes: frozenset[str]
    tools: frozenset[str]
    routines: frozenset[str]
    workflow_packs: frozenset[str]


def _reject_duplicate_pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ConfigError(f"duplicate JSON object key: {key!r}")
        result[key] = value
    return result


def _load_json(path: pathlib.Path) -> Any:
    try:
        if path.is_symlink():
            raise ConfigError(f"refusing symbolic-link JSON input: {path}")
        raw = path.read_bytes()
        if len(raw) > MAX_CONFIG_BYTES:
            raise ConfigError(f"JSON input exceeds {MAX_CONFIG_BYTES} bytes: {path}")
        return json.loads(raw.decode("utf-8"), object_pairs_hook=_reject_duplicate_pairs)
    except OSError as exc:
        raise ConfigError(f"cannot read {path}: {exc}") from exc
    except UnicodeDecodeError as exc:
        raise ConfigError(f"invalid UTF-8 in {path}") from exc
    except json.JSONDecodeError as exc:
        raise ConfigError(f"invalid JSON in {path}: line {exc.lineno}, column {exc.colno}") from exc


def load_schema() -> Mapping[str, Any]:
    schema = _load_json(SCHEMA_FILE)
    if not isinstance(schema, dict):
        raise ConfigError(f"schema document must be an object: {SCHEMA_FILE}")
    _assert_supported_schema(schema)
    return schema


def _assert_supported_schema(schema: Any, path: str = "$") -> None:
    if not isinstance(schema, dict):
        raise ConfigError(f"schema node must be an object at {path}")
    unknown = set(schema) - SUPPORTED_SCHEMA_KEYWORDS
    if unknown:
        raise ConfigError(f"schema uses unsupported keyword(s) at {path}: {sorted(unknown)!r}")
    for key in ("properties", "patternProperties", "$defs"):
        children = schema.get(key, {})
        if not isinstance(children, dict):
            raise ConfigError(f"schema {key} must be an object at {path}")
        for name, child in children.items():
            _assert_supported_schema(child, f"{path}.{key}.{name}")
    if isinstance(schema.get("additionalProperties"), dict):
        _assert_supported_schema(schema["additionalProperties"], f"{path}.additionalProperties")
    if isinstance(schema.get("items"), dict):
        _assert_supported_schema(schema["items"], f"{path}.items")
    for index, child in enumerate(schema.get("oneOf", [])):
        _assert_supported_schema(child, f"{path}.oneOf[{index}]")


def _resolve_schema_ref(ref: str, root_schema: Mapping[str, Any]) -> Mapping[str, Any]:
    if not ref.startswith("#/"):
        raise ConfigError(f"unsupported non-local schema reference: {ref}")
    node: Any = root_schema
    for part in ref[2:].split("/"):
        part = part.replace("~1", "/").replace("~0", "~")
        if not isinstance(node, dict) or part not in node:
            raise ConfigError(f"broken schema reference: {ref}")
        node = node[part]
    if not isinstance(node, dict):
        raise ConfigError(f"schema reference does not resolve to an object: {ref}")
    return node


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    raise ConfigError(f"schema uses unsupported type: {expected}")


def _json_equal(left: Any, right: Any) -> bool:
    """Compare JSON values without Python's ``True == 1`` type confusion."""
    if isinstance(left, bool) or isinstance(right, bool):
        return isinstance(left, bool) and isinstance(right, bool) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        return left == right
    if type(left) is not type(right):
        return False
    if isinstance(left, list):
        return len(left) == len(right) and all(_json_equal(a, b) for a, b in zip(left, right))
    if isinstance(left, dict):
        return set(left) == set(right) and all(_json_equal(left[key], right[key]) for key in left)
    return left == right


def _schema_validate(
    value: Any,
    schema: Mapping[str, Any],
    root_schema: Mapping[str, Any],
    path: str = "$",
) -> None:
    if "$ref" in schema:
        _schema_validate(value, _resolve_schema_ref(str(schema["$ref"]), root_schema), root_schema, path)
        return

    if "oneOf" in schema:
        matches = 0
        messages: list[str] = []
        for option in schema["oneOf"]:
            try:
                _schema_validate(value, option, root_schema, path)
                matches += 1
            except ConfigError as exc:
                messages.append(str(exc))
        if matches != 1:
            detail = messages[0] if messages else "multiple alternatives matched"
            raise ConfigError(f"{path} must match exactly one allowed shape: {detail}")
        return

    expected_type = schema.get("type")
    if expected_type is not None and not _matches_type(value, str(expected_type)):
        raise ConfigError(f"{path} must be {expected_type}")

    if "const" in schema and not _json_equal(value, schema["const"]):
        raise ConfigError(f"{path} must equal {schema['const']!r}")
    if "enum" in schema and not any(_json_equal(value, item) for item in schema["enum"]):
        raise ConfigError(f"{path} must be one of {schema['enum']!r}")

    if isinstance(value, str):
        if len(value) < int(schema.get("minLength", 0)):
            raise ConfigError(f"{path} is shorter than minLength")
        if len(value) > int(schema.get("maxLength", len(value))):
            raise ConfigError(f"{path} is longer than maxLength")
        pattern = schema.get("pattern")
        if pattern is not None and re.search(str(pattern), value) is None:
            if path.endswith(".policyRef"):
                raise ConfigError(f"{path} is an invalid policy reference")
            raise ConfigError(f"{path} does not match required pattern")

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema and value < schema["minimum"]:
            raise ConfigError(f"{path} is below minimum")
        if "maximum" in schema and value > schema["maximum"]:
            raise ConfigError(f"{path} is above maximum")

    if isinstance(value, list):
        if len(value) < int(schema.get("minItems", 0)):
            raise ConfigError(f"{path} has fewer than minItems")
        if len(value) > int(schema.get("maxItems", len(value))):
            raise ConfigError(f"{path} has more than maxItems")
        if schema.get("uniqueItems"):
            canonical = [json.dumps(item, sort_keys=True, separators=(",", ":")) for item in value]
            if len(canonical) != len(set(canonical)):
                raise ConfigError(f"{path} items must be unique")
        item_schema = schema.get("items")
        if item_schema is not None:
            for index, item in enumerate(value):
                _schema_validate(item, item_schema, root_schema, f"{path}[{index}]")

    if isinstance(value, dict):
        required = schema.get("required", [])
        for key in required:
            if key not in value:
                raise ConfigError(f"{path} is missing required key {key!r}")
        if len(value) > int(schema.get("maxProperties", len(value))):
            raise ConfigError(f"{path} has more than maxProperties")

        properties = schema.get("properties", {})
        pattern_properties = schema.get("patternProperties", {})
        additional = schema.get("additionalProperties", True)
        for key, child in value.items():
            child_schema = properties.get(key)
            if child_schema is not None:
                _schema_validate(child, child_schema, root_schema, f"{path}.{key}")
                continue
            matching = [
                candidate
                for pattern, candidate in pattern_properties.items()
                if re.search(pattern, key) is not None
            ]
            if matching:
                for candidate in matching:
                    _schema_validate(child, candidate, root_schema, f"{path}.{key}")
                continue
            if additional is False:
                raise ConfigError(f"{path} contains unknown key {key!r}")
            if isinstance(additional, dict):
                _schema_validate(child, additional, root_schema, f"{path}.{key}")


def _schema_defaults(value: Any, schema: Mapping[str, Any], root_schema: Mapping[str, Any]) -> Any:
    if "$ref" in schema:
        return _schema_defaults(value, _resolve_schema_ref(str(schema["$ref"]), root_schema), root_schema)
    if "oneOf" in schema:
        for option in schema["oneOf"]:
            try:
                _schema_validate(value, option, root_schema)
            except ConfigError:
                continue
            return _schema_defaults(value, option, root_schema)
        return copy.deepcopy(value)
    if isinstance(value, dict):
        result = copy.deepcopy(value)
        for key, child_schema in schema.get("properties", {}).items():
            if key not in result and "default" in child_schema:
                result[key] = copy.deepcopy(child_schema["default"])
            if key in result:
                result[key] = _schema_defaults(result[key], child_schema, root_schema)
        for key, child in list(result.items()):
            if key in schema.get("properties", {}):
                continue
            for pattern, child_schema in schema.get("patternProperties", {}).items():
                if re.search(pattern, key) is not None:
                    result[key] = _schema_defaults(child, child_schema, root_schema)
        return result
    if isinstance(value, list) and "items" in schema:
        return [_schema_defaults(item, schema["items"], root_schema) for item in value]
    return copy.deepcopy(value)


def _reject_inline_secret_fields(value: Any, path: str = "$", inside_refs: bool = False) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            child_path = f"{path}.{key}"
            if not inside_refs and key != "secretRefs" and key.lower().replace("_", "-").replace("-", "") in RAW_SECRET_KEYS:
                raise ConfigError(f"{child_path} is an inline secret field; use secretRefs with env references")
            _reject_inline_secret_fields(child, child_path, inside_refs or key == "secretRefs")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            _reject_inline_secret_fields(child, f"{path}[{index}]", inside_refs)
    elif isinstance(value, str) and any(pattern.search(value) for pattern in SECRET_VALUE_PATTERNS):
        raise ConfigError(f"{path} contains a secret-shaped inline value; use an environment reference")


def _parse_variants_and_lanes(path: pathlib.Path) -> tuple[frozenset[str], frozenset[str]]:
    text = path.read_text(encoding="utf-8")
    variants = frozenset(re.findall(r"^  ([a-z0-9][a-z0-9-]*):\s*$", text, flags=re.MULTILINE))
    lanes: set[str] = set()
    in_lanes = False
    for line in text.splitlines():
        if re.match(r"^    lanes:\s*$", line):
            in_lanes = True
            continue
        if in_lanes:
            match = re.match(r"^      ([a-z][a-z0-9-]*):", line)
            if match:
                lanes.add(match.group(1))
                continue
            if line.strip() and not line.lstrip().startswith("#") and len(line) - len(line.lstrip()) <= 4:
                in_lanes = False
    return variants, frozenset(lanes)


def _parse_gate_tools(path: pathlib.Path) -> frozenset[str]:
    text = path.read_text(encoding="utf-8")
    start = text.find("TOOL_BOUNDARIES")
    end = text.find("});", start)
    block = text[start:end]
    return frozenset(re.findall(r"^  ([a-z][a-z0-9_]*):", block, flags=re.MULTILINE))


def _parse_legal_data_tools(path: pathlib.Path) -> frozenset[str]:
    text = path.read_text(encoding="utf-8")
    start = text.find("const REST_TOOLS")
    end = text.find("const PROVENANCE_NOTE", start)
    block = text[start:end]
    return frozenset(f"legal-data.{name}" for name in re.findall(r'name: "([a-z0-9_]+)"', block))


def _parse_routines(path: pathlib.Path) -> frozenset[str]:
    text = path.read_text(encoding="utf-8")
    marker = re.search(r"^routines:\s*$", text, flags=re.MULTILINE)
    if marker is None:
        return frozenset()
    return frozenset(
        re.findall(r"^  ([a-z0-9][a-z0-9-]*):\s*$", text[marker.end() :], flags=re.MULTILINE)
    )


def load_catalogs(repo_root: pathlib.Path) -> Catalogs:
    company = repo_root / "companies" / "legal-operations"
    agent_root = company / "agents"
    skill_root = company / "skills"
    required_paths = (
        agent_root,
        skill_root,
        company / "variants.yaml",
        company / ".paperclip.yaml",
        repo_root / "gate-proxy" / "src" / "boundary.ts",
        repo_root / "mcp-servers" / "legal-data" / "src" / "server.ts",
    )
    missing = [str(path) for path in required_paths if not path.exists()]
    if missing:
        raise ConfigError(f"repository catalogs are missing: {', '.join(missing)}")

    agents = frozenset(
        path.name for path in agent_root.iterdir()
        if path.is_dir() and (path / "AGENTS.md").is_file()
    )
    skills = frozenset(
        path.name for path in skill_root.iterdir()
        if path.is_dir() and (path / "SKILL.md").is_file()
    )
    variants, lanes = _parse_variants_and_lanes(company / "variants.yaml")
    tools = _parse_gate_tools(repo_root / "gate-proxy" / "src" / "boundary.ts")
    tools |= _parse_legal_data_tools(repo_root / "mcp-servers" / "legal-data" / "src" / "server.ts")
    if not agents or not skills or not variants or not lanes or not tools:
        raise ConfigError("one or more repository catalogs parsed as empty")
    return Catalogs(
        agents=agents,
        skills=skills,
        connectors=frozenset(skill for skill in skills if skill.startswith("connector-")),
        variants=variants,
        lanes=lanes,
        tools=tools,
        routines=_parse_routines(company / ".paperclip.yaml"),
        workflow_packs=REFERENCE_WORKFLOW_PACKS,
    )


def _require_refs(kind: str, values: Sequence[str], catalog: frozenset[str]) -> None:
    for value in values:
        if value not in catalog:
            raise ConfigError(f"unknown {kind} reference: {value}")


def _require_unique_ids(kind: str, values: Sequence[Mapping[str, Any]], key: str = "id") -> None:
    seen: set[str] = set()
    for value in values:
        identifier = str(value[key])
        if identifier in seen:
            raise ConfigError(f"duplicate {kind} id: {identifier}")
        seen.add(identifier)


def _validate_policy_reference(policy_ref: str, repo_root: pathlib.Path) -> None:
    root = repo_root.resolve()
    unresolved = root / policy_ref
    current = root
    for part in pathlib.PurePosixPath(policy_ref).parts:
        current = current / part
        if current.is_symlink():
            raise ConfigError(f"policy reference contains a symbolic link: {policy_ref}")
    candidate = unresolved.resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ConfigError(f"policy reference escapes repository: {policy_ref}") from exc
    if not candidate.is_file():
        raise ConfigError(f"policy reference does not exist: {policy_ref}")


def _parse_gate_policy_contract(path: pathlib.Path) -> dict[str, Any]:
    """Read the enforcement fields used by config without a general YAML dependency.

    The runtime remains the authoritative full YAML parser. This deliberately
    accepts only the simple scalar/inline-list representation used by the
    shipped policy so configuration validation cannot silently misunderstand a
    more complex YAML construct.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ConfigError(f"cannot read gate policy: {path}") from exc
    version: int | None = None
    section = ""
    boundaries: dict[str, str] = {}
    citation_boundaries: list[str] | None = None
    require_authority = False
    allow_work_product_text = False
    for raw_line in text.splitlines():
        line = raw_line.split("#", 1)[0].rstrip()
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()
        if indent == 0:
            section = ""
            if match := re.fullmatch(r"version:\s*([0-9]+)", stripped):
                version = int(match.group(1))
            elif stripped in {"boundaries:", "citationGate:", "firmFacade:"}:
                section = stripped[:-1]
            continue
        if indent != 2:
            continue
        if section == "boundaries":
            match = re.fullmatch(r"([A-Z][A-Z0-9_]*):\s*([a-z]+)", stripped)
            if match is None or match.group(1) not in GATE_BOUNDARIES or match.group(2) not in GATE_DECISIONS:
                raise ConfigError("referenced gate policy has an unsupported boundary declaration")
            boundaries[match.group(1)] = match.group(2)
        elif section == "citationGate":
            match = re.fullmatch(r"boundaries:\s*\[([^]]*)\]", stripped)
            if match is not None:
                citation_boundaries = [item.strip() for item in match.group(1).split(",") if item.strip()]
                if len(citation_boundaries) != len(set(citation_boundaries)) or not set(citation_boundaries) <= GATE_BOUNDARIES:
                    raise ConfigError("referenced gate policy has invalid citation boundaries")
                continue
            match = re.fullmatch(r"requireAuthorityProvenance:\s*(true|false)", stripped)
            if match is not None:
                require_authority = match.group(1) == "true"
        elif section == "firmFacade":
            match = re.fullmatch(r"allowWorkProductText:\s*(true|false)", stripped)
            if match is not None:
                allow_work_product_text = match.group(1) == "true"
    if version != 1 or set(boundaries) != GATE_BOUNDARIES or citation_boundaries is None:
        raise ConfigError("referenced gate policy is not a supported version-1 gate policy")
    return {
        "boundaries": boundaries,
        "citationGate": {
            "boundaries": citation_boundaries,
            "requireAuthorityProvenance": require_authority,
        },
        "firmFacade": {"allowWorkProductText": allow_work_product_text},
    }


def _validate_gate_contract(config_gate: Mapping[str, Any], policy_path: pathlib.Path) -> None:
    policy = _parse_gate_policy_contract(policy_path)
    matches = (
        config_gate["boundaries"] == policy["boundaries"]
        and set(config_gate["citationGate"]["boundaries"])
        == set(policy["citationGate"]["boundaries"])
        and config_gate["citationGate"]["requireAuthorityProvenance"]
        is policy["citationGate"]["requireAuthorityProvenance"]
        and config_gate["firmFacade"]["allowWorkProductText"]
        is policy["firmFacade"]["allowWorkProductText"]
    )
    if not matches:
        raise ConfigError("configuration gate contract does not match referenced gate policy")


def _load_connector_contracts() -> Mapping[str, Mapping[str, Any]]:
    document = _load_json(CONNECTOR_CONTRACTS_FILE)
    if not isinstance(document, dict) or set(document) != {"version", "connectors"} or document["version"] != 1:
        raise ConfigError("connector contract catalog must be version 1")
    connectors = document["connectors"]
    if not isinstance(connectors, dict) or not connectors:
        raise ConfigError("connector contract catalog must contain connectors")
    allowed_keys = {
        "gateTools", "directToolPrefixes", "destinationProviders", "gateCredentialAlternatives"
    }
    for connector_id, contract in connectors.items():
        if not isinstance(connector_id, str) or not isinstance(contract, dict) or set(contract) != allowed_keys:
            raise ConfigError("connector contract catalog contains an invalid entry")
        for key in ("gateTools", "directToolPrefixes", "destinationProviders", "gateCredentialAlternatives"):
            if not isinstance(contract[key], list):
                raise ConfigError(f"connector contract {connector_id} has invalid {key}")
        for alternative in contract["gateCredentialAlternatives"]:
            if not isinstance(alternative, list) or not alternative or not all(isinstance(item, str) for item in alternative):
                raise ConfigError(f"connector contract {connector_id} has an invalid credential alternative")
    return connectors


def _enabled_agents(config: Mapping[str, Any]) -> set[str]:
    enabled: set[str] = set()
    disabled: set[str] = set()
    for team in config["teams"]:
        if not team["enabled"]:
            continue
        enabled.update(team["agents"])
        for override in team.get("agentOverrides", []):
            if override.get("enabled") is False:
                disabled.add(override["agent"])
    return enabled - disabled


def _gate_tool_principals(repo_root: pathlib.Path) -> dict[str, set[str]]:
    template = _load_json(repo_root / "companies" / "legal-operations" / "gate-authorization.json")
    if not isinstance(template, dict) or not isinstance(template.get("grants"), dict):
        raise ConfigError("gate authorization template has no grant mapping")
    principals: dict[str, set[str]] = {}
    for agent, targets in template["grants"].items():
        if not isinstance(agent, str) or not isinstance(targets, list):
            raise ConfigError("gate authorization template contains a malformed grant")
        for target in targets:
            tool = GATE_TARGET_TO_TOOL.get(target)
            if tool is not None:
                principals.setdefault(tool, set()).add(agent)
    return principals


def _validate_capability_graph(config: Mapping[str, Any], repo_root: pathlib.Path) -> None:
    contracts = _load_connector_contracts()
    enabled_connectors = {
        entry["id"]: entry for entry in config["capabilities"]["connectors"] if entry["enabled"]
    }
    for connector_id, entry in enabled_connectors.items():
        contract = contracts.get(connector_id)
        if contract is None:
            raise ConfigError(f"enabled connector has no production capability contract: {connector_id}")
        alternatives = contract["gateCredentialAlternatives"]
        if alternatives:
            available = set(entry.get("secretRefs", {}))
            if not any(set(alternative) <= available for alternative in alternatives):
                raise ConfigError(f"enabled connector {connector_id} lacks a complete gate credential alternative")

    enabled_destinations = [entry for entry in config["trustedDestinations"] if entry["enabled"]]
    for destination in enabled_destinations:
        provider = destination["provider"]
        matches = [
            connector_id for connector_id, contract in contracts.items()
            if provider in contract["destinationProviders"] and connector_id in enabled_connectors
        ]
        if not matches:
            raise ConfigError(f"enabled {provider} destination has no matching enabled connector")

    allowed_tools = config["capabilities"]["allowedTools"]
    for tool in allowed_tools:
        compatible = [
            connector_id for connector_id, contract in contracts.items()
            if connector_id in enabled_connectors
            and (tool in contract["gateTools"] or any(tool.startswith(prefix) for prefix in contract["directToolPrefixes"]))
        ]
        if tool == "upload_document" and not enabled_destinations:
            raise ConfigError("upload_document requires at least one enabled trusted destination")
        if not compatible and tool not in {
            "file_court_document", "sign_document", "send_payment", "delete_external_resource"
        }:
            raise ConfigError(f"allowed tool has no compatible enabled production connector: {tool}")

    active_agents = _enabled_agents(config)
    gate_principals = _gate_tool_principals(repo_root)
    for tool in allowed_tools:
        if tool in gate_principals and not (gate_principals[tool] & active_agents):
            raise ConfigError(f"allowed gate tool has no enabled immutable-grant principal: {tool}")
        if tool in GATE_TARGET_TO_TOOL.values() and tool not in gate_principals:
            raise ConfigError(f"allowed gate tool has no principal grant: {tool}")


def _validate_catalog_refs(config: Mapping[str, Any], repo_root: pathlib.Path) -> None:
    catalogs = load_catalogs(repo_root)
    _require_unique_ids("team", config["teams"])
    _require_unique_ids("workflow pack", config["workflowPacks"])
    _require_unique_ids("connector", config["capabilities"]["connectors"])
    _require_unique_ids("trusted destination", config["trustedDestinations"])
    _require_unique_ids("routine", config["routines"])

    for team in config["teams"]:
        _require_refs("agent", team["agents"], catalogs.agents)
        _require_refs("skill", team["skills"], catalogs.skills)
        overrides = team.get("agentOverrides", [])
        _require_unique_ids("agent override", overrides, "agent")
        for override in overrides:
            _require_refs("agent", [override["agent"]], catalogs.agents)
            if "modelLane" in override:
                _require_refs("lane", [override["modelLane"]], catalogs.lanes)
            _require_refs("tool", override.get("allowedTools", []), catalogs.tools)

    _require_refs(
        "workflow pack",
        [entry["id"] for entry in config["workflowPacks"]],
        catalogs.workflow_packs,
    )
    _require_refs("variant", [config["models"]["variant"]], catalogs.variants)
    _require_refs("lane", list(config["models"]["lanes"]), catalogs.lanes)
    for override in config["models"]["lanes"].values():
        if "variant" in override:
            _require_refs("variant", [override["variant"]], catalogs.variants)
    _require_refs("tool", config["capabilities"]["allowedTools"], catalogs.tools)
    _require_refs(
        "connector",
        [entry["id"] for entry in config["capabilities"]["connectors"]],
        catalogs.connectors,
    )
    _require_refs("routine", [entry["id"] for entry in config["routines"]], catalogs.routines)
    _require_refs("variant", list(config["budgets"]["variantMonthlyCents"]), catalogs.variants)
    _require_refs("agent", list(config["budgets"]["agentMonthlyCents"]), catalogs.agents)
    _require_refs("lane", list(config["capacity"]["laneMaxTurns"]), catalogs.lanes)
    _validate_policy_reference(config["gate"]["policyRef"], repo_root)
    _validate_gate_contract(config["gate"], repo_root / config["gate"]["policyRef"])
    _validate_capability_graph(config, repo_root)
    if config["budgets"]["costMode"] in {"metered", "mixed"} and config["budgets"]["companyMonthlyCents"] <= 0:
        raise ConfigError("metered or mixed costMode requires a positive companyMonthlyCents budget")
    for routine in config["routines"]:
        cron = routine["schedule"]["cron"]
        fields = cron.split()
        if len(fields) != 5 or any(re.fullmatch(r"[0-9*/?,\-]+", field) is None for field in fields):
            raise ConfigError(f"routine {routine['id']} has an invalid five-field cron expression")
        timezone = routine["schedule"]["timezone"]
        try:
            zoneinfo.ZoneInfo(timezone)
        except zoneinfo.ZoneInfoNotFoundError as exc:
            raise ConfigError(f"routine {routine['id']} references an unknown IANA timezone") from exc


def validate_config(config: Any, repo_root: pathlib.Path | str = DEFAULT_REPO_ROOT) -> dict[str, Any]:
    """Validate and return a deep-copied effective v1 configuration.

    No environment variable is read and no network or import operation occurs.
    Schema defaults are applied before repository-catalog validation.
    """

    if not isinstance(config, dict):
        raise ConfigError("configuration must be a JSON object")
    _reject_inline_secret_fields(config)
    schema = load_schema()
    _schema_validate(config, schema, schema)
    effective = _schema_defaults(config, schema, schema)
    _schema_validate(effective, schema, schema)
    _validate_catalog_refs(effective, pathlib.Path(repo_root))
    return effective


def _redact_env_refs(value: Any) -> Any:
    if isinstance(value, dict):
        if set(value) == {"env"} and isinstance(value["env"], str):
            return {"env": "<redacted-env-ref>"}
        return {key: _redact_env_refs(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_redact_env_refs(child) for child in value]
    if isinstance(value, str) and any(pattern.search(value) for pattern in SECRET_VALUE_PATTERNS):
        return "<redacted-suspicious-value>"
    return value


def render_effective_config(
    config: Any,
    repo_root: pathlib.Path | str = DEFAULT_REPO_ROOT,
) -> str:
    """Return deterministic, redacted effective-configuration JSON."""

    effective = validate_config(config, repo_root)
    return json.dumps(_redact_env_refs(effective), indent=2, sort_keys=True) + "\n"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate possiblaw/config/v1 JSON")
    parser.add_argument("command", choices=("validate", "effective"))
    parser.add_argument("config", type=pathlib.Path)
    parser.add_argument("--repo-root", type=pathlib.Path, default=DEFAULT_REPO_ROOT)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    try:
        config = _load_json(args.config)
        if args.command == "validate":
            effective = validate_config(config, args.repo_root)
            print(f"valid {effective['schema']}: {args.config}")
        else:
            sys.stdout.write(render_effective_config(config, args.repo_root))
    except ConfigError as exc:
        print(f"invalid configuration: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
