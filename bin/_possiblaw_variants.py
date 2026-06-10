#!/usr/bin/env python3
"""Build adapterOverrides for POST /api/companies/import from a variant choice.

Inputs (all JSON, pre-converted from YAML by the bash launcher):
  --variants-json   path to variants.yaml-as-json (or "-" for stdin)
  --paperclip-json  path to .paperclip.yaml-as-json (or "-" for stdin, when reading via --both-from-stdin)
  --variant         variant slug (e.g. codex, claude, ollama)

Output: JSON object on stdout, keyed by agent slug, conforming to
CompanyPortabilityAdapterOverride[] from paperclip's shared types:
  { "<agent-slug>": { "adapterType": "...", "adapterConfig": { ... } } }

Extra modes:
  --show-secret-env     print 'ENV_KEY<TAB>display name' lines for the
                        variant's secret_env block (dual-auth variants)
  --list-models         print the variant's distinct effective models
                        (consumed by the launcher's preflight model probe)
  --build-env-patches   given --overrides-json and --secret-ids-json, emit
                        per-agent { adapterConfig } patch bodies that bind
                        each secret into adapterConfig.env as a secret_ref
  --lint                structurally validate the variants doc (adapterType,
                        models present, opencode provider/model format) and
                        exit non-zero on problems

Warnings go to stderr (one per line, prefixed "warning: ").
Errors exit non-zero with a "error: ..." line on stderr.

Self-test: `python3 bin/_possiblaw_variants.py --self-test`.
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def _read_json(path: str) -> Any:
    if path == "-":
        return json.load(sys.stdin)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def build_overrides(
    variants_doc: dict,
    paperclip_doc: dict,
    variant_slug: str,
    warn=lambda msg: print(f"warning: {msg}", file=sys.stderr),
) -> dict:
    """Pure function: build adapterOverrides map for the chosen variant.

    Algorithm per agent:
      1. Start from variant.default.adapterConfig (deep copy).
      2. If the agent declares metadata.possiblaw.modelLane, look up the lane
         in variants[variant].lanes and merge those keys over the base.
         Unknown lane → warn, no merge.
         No lane declared → warn, no merge.
      3. If the agent slug exists in variants[variant].per_agent, merge those
         keys on top.
      4. Return { adapterType: variant.default.adapterType, adapterConfig: merged }.
    """
    if not isinstance(variants_doc, dict) or "variants" not in variants_doc:
        raise ValueError("variants document missing 'variants' key")

    variants_block = variants_doc["variants"]
    if variant_slug not in variants_block:
        valid = ", ".join(sorted(variants_block.keys())) or "(none)"
        raise ValueError(
            f"unknown variant '{variant_slug}'. Valid: {valid}"
        )

    variant = variants_block[variant_slug]
    default = variant.get("default") or {}
    adapter_type = default.get("adapterType")
    if not adapter_type:
        raise ValueError(
            f"variant '{variant_slug}' missing default.adapterType"
        )
    base_config = dict(default.get("adapterConfig") or {})
    lanes = variant.get("lanes") or {}
    per_agent = variant.get("per_agent") or {}

    agents = paperclip_doc.get("agents") or {}
    if not isinstance(agents, dict):
        raise ValueError("paperclip document 'agents' must be a mapping")

    overrides: dict[str, dict] = {}
    for slug, agent in agents.items():
        merged = dict(base_config)

        meta = ((agent or {}).get("metadata") or {}).get("possiblaw") or {}
        lane = meta.get("modelLane")
        if lane is None:
            warn(
                f"agent '{slug}' has no metadata.possiblaw.modelLane; "
                f"using variant '{variant_slug}' default config"
            )
        elif lane not in lanes:
            warn(
                f"agent '{slug}' declares lane '{lane}' which is not defined "
                f"in variant '{variant_slug}'; using variant default config"
            )
        else:
            lane_overrides = lanes[lane] or {}
            for k, v in lane_overrides.items():
                merged[k] = v

        if slug in per_agent:
            for k, v in (per_agent[slug] or {}).items():
                merged[k] = v

        overrides[slug] = {
            "adapterType": adapter_type,
            "adapterConfig": merged,
        }

    # Warn about per_agent entries that don't match any package agent.
    for slug in per_agent:
        if slug not in agents:
            warn(
                f"variant '{variant_slug}' per_agent['{slug}'] does not match "
                f"any agent in the package; skipped"
            )

    return overrides


def _variant_block(variants_doc: dict, variant_slug: str) -> dict:
    variants_block = (variants_doc or {}).get("variants") or {}
    if variant_slug not in variants_block:
        valid = ", ".join(sorted(variants_block.keys())) or "(none)"
        raise ValueError(f"unknown variant '{variant_slug}'. Valid: {valid}")
    return variants_block[variant_slug] or {}


def variant_secret_env(variants_doc: dict, variant_slug: str) -> dict[str, str]:
    """Return the variant's secret_env map: env key -> secret display name.

    Variants that don't take API keys return {}. Display name falls back to
    the env key itself when the YAML value is empty.
    """
    raw = _variant_block(variants_doc, variant_slug).get("secret_env") or {}
    if not isinstance(raw, dict):
        raise ValueError(
            f"variant '{variant_slug}' secret_env must be a mapping of "
            f"ENV_KEY -> display name"
        )
    return {str(k): (str(v) if v else str(k)) for k, v in raw.items()}


def list_models(
    variants_doc: dict, paperclip_doc: dict, variant_slug: str
) -> list[str]:
    """Distinct effective `model` values across all agents for a variant.

    Used by the launcher's preflight model probe so model-access errors
    surface at launch time instead of mid-run.
    """
    overrides = build_overrides(
        variants_doc, paperclip_doc, variant_slug, warn=lambda m: None
    )
    models = {
        (entry.get("adapterConfig") or {}).get("model")
        for entry in overrides.values()
    }
    return sorted(m for m in models if m)


def build_env_patches(
    overrides: dict, secret_ids: dict[str, str]
) -> dict[str, dict]:
    """Build PATCH /api/agents/:id bodies binding secrets into adapter env.

    Input: the adapterOverrides map already produced by build_overrides, and
    a map of ENV_KEY -> paperclip secretId (created post-import via
    POST /api/companies/:id/secrets). Output per agent slug:
    { "adapterConfig": <override config + env secret_ref bindings> }.
    Inputs are not mutated; existing env bindings are preserved.
    """
    if not secret_ids:
        return {}
    patches: dict[str, dict] = {}
    for slug, entry in overrides.items():
        config = dict((entry or {}).get("adapterConfig") or {})
        env = dict(config.get("env") or {})
        for key, secret_id in secret_ids.items():
            env[key] = {"type": "secret_ref", "secretId": secret_id}
        config["env"] = env
        patches[slug] = {"adapterConfig": config}
    return patches


def _is_opencode_model_id(value: Any) -> bool:
    """Mirror paperclip's isValidOpenCodeModelId: 'provider/model', both halves
    non-empty (paperclip/packages/adapters/opencode-local/src/index.ts)."""
    if not isinstance(value, str):
        return False
    trimmed = value.strip()
    slash = trimmed.find("/")
    return bool(trimmed) and slash > 0 and slash != len(trimmed) - 1


def lint_variants(variants_doc: dict) -> list[str]:
    """Structural lint of a variants doc. Returns problem strings (empty = clean).

    Per variant:
      - default.adapterType and default.adapterConfig.model are present
      - secret_env / lanes / per_agent are mappings when present
      - opencode_local variants: every model (default, lane, per_agent) is in
        OpenCode's required provider/model format — paperclip rejects agents
        whose opencode_local model id has no provider prefix
    """
    problems: list[str] = []
    variants_block = (variants_doc or {}).get("variants")
    if not isinstance(variants_block, dict) or not variants_block:
        return ["variants document missing a non-empty 'variants' mapping"]

    for slug, v in variants_block.items():
        v = v or {}
        default = v.get("default") or {}
        adapter_type = default.get("adapterType")
        config = default.get("adapterConfig") or {}
        if not adapter_type:
            problems.append(f"variant '{slug}': missing default.adapterType")
        if not config.get("model"):
            problems.append(f"variant '{slug}': missing default.adapterConfig.model")
        for field in ("secret_env", "lanes", "per_agent"):
            val = v.get(field)
            if val is not None and not isinstance(val, dict):
                problems.append(f"variant '{slug}': {field} must be a mapping")

        if adapter_type == "opencode_local":
            def check_model(model: Any, where: str) -> None:
                if model is None:
                    return
                if not _is_opencode_model_id(model):
                    problems.append(
                        f"variant '{slug}': {where} model '{model}' is not in "
                        f"OpenCode provider/model format"
                    )

            check_model(config.get("model"), "default")
            lanes = v.get("lanes")
            if isinstance(lanes, dict):
                for lane, overrides in lanes.items():
                    if isinstance(overrides, dict):
                        check_model(overrides.get("model"), f"lane '{lane}'")
            per_agent = v.get("per_agent")
            if isinstance(per_agent, dict):
                for agent, overrides in per_agent.items():
                    if isinstance(overrides, dict):
                        check_model(overrides.get("model"), f"per_agent '{agent}'")

    return problems


def _self_test() -> int:
    variants = {
        "schema": "possiblaw/variants/v1",
        "variants": {
            "codex": {
                "default": {
                    "adapterType": "codex_local",
                    "adapterConfig": {
                        "model": "gpt-5.3-codex",
                        "modelReasoningEffort": "medium",
                        "timeoutSec": 600,
                    },
                },
                "lanes": {
                    "primary": {"modelReasoningEffort": "high"},
                    "drafting": {"modelReasoningEffort": "high", "timeoutSec": 900},
                },
                "per_agent": {"nda-drafter": {"timeoutSec": 1200}},
            },
            "claude": {
                "default": {
                    "adapterType": "claude_local",
                    "adapterConfig": {"model": "claude-opus-4-7"},
                },
                "lanes": {"extractive": {"model": "claude-haiku-4-5"}},
                "per_agent": {},
            },
        },
    }
    paperclip = {
        "agents": {
            "chief-of-staff": {
                "metadata": {"possiblaw": {"modelLane": "primary"}}
            },
            "nda-drafter": {
                "metadata": {"possiblaw": {"modelLane": "drafting"}}
            },
            "billing-prep": {
                "metadata": {"possiblaw": {"modelLane": "extractive"}}
            },
            "stray-agent": {},  # no lane → warn, default config
        }
    }

    warnings: list[str] = []
    out = build_overrides(variants, paperclip, "codex", warn=warnings.append)

    # primary lane bumps reasoning effort, keeps everything else
    assert out["chief-of-staff"]["adapterType"] == "codex_local"
    assert out["chief-of-staff"]["adapterConfig"]["modelReasoningEffort"] == "high"
    assert out["chief-of-staff"]["adapterConfig"]["model"] == "gpt-5.3-codex"
    assert out["chief-of-staff"]["adapterConfig"]["timeoutSec"] == 600

    # drafting lane + per_agent override stack: timeoutSec from per_agent wins
    assert out["nda-drafter"]["adapterConfig"]["modelReasoningEffort"] == "high"
    assert out["nda-drafter"]["adapterConfig"]["timeoutSec"] == 1200

    # extractive lane is unknown for codex → warning + base config
    assert out["billing-prep"]["adapterConfig"]["modelReasoningEffort"] == "medium"
    assert any("billing-prep" in w and "extractive" in w for w in warnings)

    # stray-agent without lane → warning + base config
    assert out["stray-agent"]["adapterConfig"]["modelReasoningEffort"] == "medium"
    assert any("stray-agent" in w and "no metadata" in w for w in warnings)

    # claude variant: extractive lane overrides model
    out2 = build_overrides(variants, paperclip, "claude", warn=lambda m: None)
    assert out2["billing-prep"]["adapterType"] == "claude_local"
    assert out2["billing-prep"]["adapterConfig"]["model"] == "claude-haiku-4-5"
    # primary lane is unknown for claude → falls back to default
    assert out2["chief-of-staff"]["adapterConfig"]["model"] == "claude-opus-4-7"

    # unknown variant raises
    try:
        build_overrides(variants, paperclip, "nope", warn=lambda m: None)
    except ValueError as e:
        assert "unknown variant" in str(e)
    else:
        raise AssertionError("expected ValueError for unknown variant")

    # --- secret_env extraction (dual-auth variants) ---
    variants["variants"]["codex-api"] = {
        "default": {
            "adapterType": "codex_local",
            "adapterConfig": {"model": "gpt-5.3-codex"},
        },
        "secret_env": {"OPENAI_API_KEY": "OpenAI API Key"},
        "lanes": {},
        "per_agent": {},
    }
    assert variant_secret_env(variants, "codex-api") == {
        "OPENAI_API_KEY": "OpenAI API Key"
    }
    assert variant_secret_env(variants, "codex") == {}
    try:
        variant_secret_env(variants, "nope")
    except ValueError:
        pass
    else:
        raise AssertionError("expected ValueError for unknown variant")

    # --- list_models: distinct effective models across all agents ---
    models = list_models(variants, paperclip, "claude")
    assert models == ["claude-haiku-4-5", "claude-opus-4-7"], models
    models_codex = list_models(variants, paperclip, "codex")
    assert models_codex == ["gpt-5.3-codex"], models_codex

    # --- build_env_patches: secret_ref env bindings merged per agent ---
    overrides_for_patch = {
        "chief-of-staff": {
            "adapterType": "codex_local",
            "adapterConfig": {"model": "gpt-5.3-codex", "env": {"EXISTING": "keep"}},
        },
        "nda-drafter": {
            "adapterType": "codex_local",
            "adapterConfig": {"model": "gpt-5.3-codex"},
        },
    }
    patches = build_env_patches(overrides_for_patch, {"OPENAI_API_KEY": "sec-123"})
    assert patches["nda-drafter"]["adapterConfig"]["env"]["OPENAI_API_KEY"] == {
        "type": "secret_ref",
        "secretId": "sec-123",
    }
    assert patches["chief-of-staff"]["adapterConfig"]["env"]["EXISTING"] == "keep"
    assert patches["chief-of-staff"]["adapterConfig"]["env"]["OPENAI_API_KEY"] == {
        "type": "secret_ref",
        "secretId": "sec-123",
    }
    assert patches["chief-of-staff"]["adapterConfig"]["model"] == "gpt-5.3-codex"
    # originals must not be mutated
    assert "OPENAI_API_KEY" not in (
        overrides_for_patch["nda-drafter"]["adapterConfig"].get("env") or {}
    )
    assert overrides_for_patch["chief-of-staff"]["adapterConfig"]["env"] == {
        "EXISTING": "keep"
    }
    # no secrets → no patches
    assert build_env_patches(overrides_for_patch, {}) == {}

    # --- lint_variants: structural validation of a variants doc ---
    lint_doc = {
        "schema": "possiblaw/variants/v1",
        "variants": {
            "good-opencode": {
                "default": {
                    "adapterType": "opencode_local",
                    "adapterConfig": {"model": "openrouter/anthropic/claude-opus-4.7"},
                },
                "lanes": {
                    "extractive": {"model": "openrouter/anthropic/claude-haiku-4.5"},
                    "drafting": {"timeoutSec": 900},  # no model key → no format check
                },
                "secret_env": {"OPENROUTER_API_KEY": "OpenRouter API Key"},
                "local": False,
                "per_agent": {},
            },
            "bad-model-format": {
                "default": {
                    "adapterType": "opencode_local",
                    "adapterConfig": {"model": "no-slash-model"},
                },
                "lanes": {"routing": {"model": "also-bad/"}},
                "per_agent": {"nda-drafter": {"model": "/leading-slash"}},
            },
            "missing-model": {
                "default": {"adapterType": "codex_local", "adapterConfig": {}},
                "lanes": {},
                "per_agent": {},
            },
            "bad-secret-env": {
                "default": {
                    "adapterType": "codex_local",
                    "adapterConfig": {"model": "gpt-5.5"},
                },
                "secret_env": ["OPENAI_API_KEY"],
                "lanes": {},
                "per_agent": {},
            },
        },
    }
    problems = lint_variants(lint_doc)
    assert not [p for p in problems if "good-opencode" in p], problems
    assert any("bad-model-format" in p and "no-slash-model" in p for p in problems), problems
    assert any("bad-model-format" in p and "also-bad/" in p for p in problems), problems
    assert any("bad-model-format" in p and "/leading-slash" in p for p in problems), problems
    assert any("missing-model" in p and "default.adapterConfig.model" in p for p in problems), problems
    assert any("bad-secret-env" in p and "secret_env" in p for p in problems), problems
    # non-opencode adapters are exempt from the provider/model format rule
    assert not any("missing-model" in p and "format" in p for p in problems), problems
    # empty doc fails loudly
    assert lint_variants({}) == ["variants document missing a non-empty 'variants' mapping"]

    print("OK: _possiblaw_variants self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variants-json", help="path to variants doc as JSON (or '-' for stdin)")
    parser.add_argument("--paperclip-json", help="path to .paperclip.yaml as JSON (or '-' for stdin)")
    parser.add_argument("--variant", help="variant slug")
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    parser.add_argument(
        "--show-secret-env", action="store_true",
        help="print the variant's secret_env as 'ENV_KEY<TAB>display name' lines and exit",
    )
    parser.add_argument(
        "--list-models", action="store_true",
        help="print the variant's distinct effective models, one per line, and exit",
    )
    parser.add_argument(
        "--lint", action="store_true",
        help="structurally validate the variants doc and exit non-zero on problems",
    )
    parser.add_argument(
        "--build-env-patches", action="store_true",
        help="emit per-agent adapterConfig patches binding secrets into env",
    )
    parser.add_argument("--overrides-json", help="path to a previously generated overrides map (for --build-env-patches)")
    parser.add_argument("--secret-ids-json", help="path to {ENV_KEY: secretId} map (for --build-env-patches)")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if args.build_env_patches:
        if not (args.overrides_json and args.secret_ids_json):
            parser.error("--build-env-patches requires --overrides-json and --secret-ids-json")
        overrides = _read_json(args.overrides_json)
        secret_ids = _read_json(args.secret_ids_json)
        json.dump(build_env_patches(overrides, secret_ids), sys.stdout, indent=2, sort_keys=True)
        sys.stdout.write("\n")
        return 0

    if args.lint:
        if not args.variants_json:
            parser.error("--lint requires --variants-json")
        doc = _read_json(args.variants_json)
        problems = lint_variants(doc)
        if problems:
            for p in problems:
                print(f"error: {p}", file=sys.stderr)
            return 1
        count = len((doc.get("variants") or {}))
        print(f"OK: variants lint passed ({count} variants)")
        return 0

    if args.show_secret_env:
        if not (args.variants_json and args.variant):
            parser.error("--show-secret-env requires --variants-json and --variant")
        try:
            secret_env = variant_secret_env(_read_json(args.variants_json), args.variant)
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        for key, name in sorted(secret_env.items()):
            print(f"{key}\t{name}")
        return 0

    if not (args.variants_json and args.paperclip_json and args.variant):
        parser.error("--variants-json, --paperclip-json, and --variant are required")

    if args.variants_json == "-" and args.paperclip_json == "-":
        parser.error("cannot read both variants and paperclip from stdin")

    variants_doc = _read_json(args.variants_json)
    paperclip_doc = _read_json(args.paperclip_json)

    if args.list_models:
        try:
            for model in list_models(variants_doc, paperclip_doc, args.variant):
                print(model)
        except ValueError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        return 0

    try:
        overrides = build_overrides(variants_doc, paperclip_doc, args.variant)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    json.dump(overrides, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
