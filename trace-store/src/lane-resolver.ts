// trace-store/src/lane-resolver.ts
//
// M3 — resolve WHICH MODEL an agent ran on, and WHY that lane, from static
// configuration.
//
// This is the cheap half of the trace. Model selection in this system is not a
// runtime decision the model makes — it falls out of config: an agent declares
// a `modelLane`, the operator picks a variant, and variants.yaml maps
// (variant, lane, agent) to a concrete adapter and model. So the answer is
// derivable without instrumenting anything, without a wrapper on the adapter
// path, and without trusting a self-report.
//
// Resolution is a three-layer merge, most specific last:
//
//     variant.default.adapterConfig      the variant's baseline
//   → variant.lanes[lane]                the lane's overrides
//   → variant.per_agent[agentSlug]       a named exception
//
// FAIL-LOUD, unlike the rest of this package. Config resolution is a
// programming/deployment error, not an untrusted input: a caller asking for a
// variant or lane that does not exist has a bug, and silently returning a
// default model would put a WRONG model id into an audit record. The fail-
// closed loaders elsewhere here guard privileged content; this guards the
// truthfulness of the trace.

import fs from "node:fs";
import yaml from "js-yaml";
import type { ModelLane } from "./types.ts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class LaneResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaneResolutionError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Contracted data terms of a variant's egress lane, as asserted by the operator. */
export interface VariantDataTerms {
  tier?: "cloud" | "local";
  zdr?: boolean;
  trains?: boolean;
  humanReview?: boolean;
  tenantIsolated?: boolean;
  consumerEndpoint?: boolean;
}

export interface VariantDefinition {
  label?: string;
  dataTerms?: VariantDataTerms;
  default: { adapterType: string; adapterConfig?: Record<string, unknown> };
  lanes?: Partial<Record<ModelLane, Record<string, unknown>>>;
  per_agent?: Record<string, Record<string, unknown>>;
}

export interface VariantsConfig {
  schema?: string;
  variants: Record<string, VariantDefinition>;
}

export interface ResolvedLane {
  variant: string;
  lane: ModelLane;
  agentSlug?: string;
  adapterType: string;
  /** Concrete model id the adapter will invoke, when the config names one. */
  model?: string;
  /** Fully merged adapter config — the effective settings for this agent. */
  adapterConfig: Record<string, unknown>;
  /** Which layers actually contributed, so a trace can show WHY. */
  appliedLayers: Array<"default" | "lane" | "per_agent">;
  dataTerms?: VariantDataTerms;
}

const VALID_LANES: readonly ModelLane[] = [
  "primary",
  "routing",
  "drafting",
  "review",
  "extractive",
];

export function isModelLane(v: unknown): v is ModelLane {
  return typeof v === "string" && (VALID_LANES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function parseVariants(raw: string): VariantsConfig {
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new LaneResolutionError(`variants.yaml is not valid YAML: ${(err as Error).message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new LaneResolutionError("variants.yaml must be a mapping");
  }
  const doc = parsed as Record<string, unknown>;
  const variants = doc["variants"];
  if (variants === null || typeof variants !== "object" || Array.isArray(variants)) {
    throw new LaneResolutionError("variants.yaml must contain a `variants` mapping");
  }
  return {
    ...(typeof doc["schema"] === "string" ? { schema: doc["schema"] } : {}),
    variants: variants as Record<string, VariantDefinition>,
  };
}

export function loadVariants(path: string): VariantsConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch {
    throw new LaneResolutionError(`cannot read variants file: ${path}`);
  }
  return parseVariants(raw);
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the concrete adapter + model for one agent under one variant.
 *
 * Throws on an unknown variant or lane rather than guessing — see the
 * fail-loud note at the top of this file.
 */
export function resolveLane(
  config: VariantsConfig,
  variantName: string,
  lane: ModelLane,
  agentSlug?: string,
): ResolvedLane {
  const variant = Object.prototype.hasOwnProperty.call(config.variants, variantName)
    ? config.variants[variantName]
    : undefined;
  if (variant === undefined) {
    const known = Object.keys(config.variants).sort().join(", ");
    throw new LaneResolutionError(`unknown variant '${variantName}' (known: ${known})`);
  }
  if (!isModelLane(lane)) {
    throw new LaneResolutionError(`unknown model lane '${String(lane)}'`);
  }
  if (variant.default === undefined || typeof variant.default.adapterType !== "string") {
    throw new LaneResolutionError(`variant '${variantName}' has no default.adapterType`);
  }

  const appliedLayers: Array<"default" | "lane" | "per_agent"> = ["default"];
  const merged: Record<string, unknown> = { ...(variant.default.adapterConfig ?? {}) };

  const laneOverride = variant.lanes?.[lane];
  if (laneOverride !== undefined && Object.keys(laneOverride).length > 0) {
    Object.assign(merged, laneOverride);
    appliedLayers.push("lane");
  }

  if (agentSlug !== undefined && variant.per_agent !== undefined) {
    const perAgent = Object.prototype.hasOwnProperty.call(variant.per_agent, agentSlug)
      ? variant.per_agent[agentSlug]
      : undefined;
    if (perAgent !== undefined && Object.keys(perAgent).length > 0) {
      Object.assign(merged, perAgent);
      appliedLayers.push("per_agent");
    }
  }

  const model = merged["model"];
  return {
    variant: variantName,
    lane,
    ...(agentSlug !== undefined ? { agentSlug } : {}),
    adapterType: variant.default.adapterType,
    ...(typeof model === "string" ? { model } : {}),
    adapterConfig: merged,
    appliedLayers,
    ...(variant.dataTerms !== undefined ? { dataTerms: variant.dataTerms } : {}),
  };
}

/**
 * The subset of a resolution worth putting on a TraceRecord.
 *
 * Deliberately narrow: lane, variant, adapter and model are the facts a
 * supervising lawyer or auditor needs. The full adapterConfig can carry
 * operational settings (timeouts, sandbox flags) that add noise to an audit
 * record without adding accountability.
 */
export function laneTraceFields(resolved: ResolvedLane): {
  modelLane: ModelLane;
  variant: string;
  adapter: string;
  model?: string;
} {
  return {
    modelLane: resolved.lane,
    variant: resolved.variant,
    adapter: resolved.adapterType,
    ...(resolved.model !== undefined ? { model: resolved.model } : {}),
  };
}
