#!/usr/bin/env python3
"""Build adapterOverrides for POST /api/companies/import from a variant choice.

Inputs (all JSON, pre-converted from YAML by the bash launcher):
  --variants-json   path to variants.yaml-as-json (or "-" for stdin)
  --paperclip-json  path to .paperclip.yaml-as-json (or "-" for stdin, when reading via --both-from-stdin)
  --variant         variant slug (e.g. codex, claude, ollama)

Output: JSON object on stdout, keyed by agent slug, conforming to
CompanyPortabilityAdapterOverride[] from paperclip's shared types:
  { "<agent-slug>": { "adapterType": "...", "adapterConfig": { ... } } }

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

    print("OK: _possiblaw_variants self-test passed")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--variants-json", help="path to variants doc as JSON (or '-' for stdin)")
    parser.add_argument("--paperclip-json", help="path to .paperclip.yaml as JSON (or '-' for stdin)")
    parser.add_argument("--variant", help="variant slug")
    parser.add_argument("--self-test", action="store_true", help="run built-in tests and exit")
    args = parser.parse_args(argv)

    if args.self_test:
        return _self_test()

    if not (args.variants_json and args.paperclip_json and args.variant):
        parser.error("--variants-json, --paperclip-json, and --variant are required")

    if args.variants_json == "-" and args.paperclip_json == "-":
        parser.error("cannot read both variants and paperclip from stdin")

    variants_doc = _read_json(args.variants_json)
    paperclip_doc = _read_json(args.paperclip_json)

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
