// eval-harness/src/variants.ts
import { readFileSync } from "node:fs";
import { parse as yamlParse } from "yaml";

export interface ResolvedModel {
  variant: string;
  adapterType: string;
  model: string;
  params: Record<string, unknown>;
}

export function loadVariants(path: string): { variants: Record<string, unknown> } {
  const content = readFileSync(path, "utf-8");
  return yamlParse(content) as { variants: Record<string, unknown> };
}

export function resolveModel(
  variantsFile: { variants: Record<string, unknown> },
  variant: string,
  lane: string,
): ResolvedModel {
  const v = variantsFile.variants[variant] as Record<string, unknown> | undefined;
  if (!v) {
    throw new Error(`Unknown variant: ${variant}. Available: ${Object.keys(variantsFile.variants).join(", ")}`);
  }

  const defaultConf = v.default as Record<string, unknown>;
  const adapterType = String(defaultConf.adapterType);
  const adapterConfig = (defaultConf.adapterConfig ?? {}) as Record<string, unknown>;
  const lanes = (v.lanes ?? {}) as Record<string, Record<string, unknown>>;
  const laneOverride = lanes[lane] ?? {};

  const merged: Record<string, unknown> = { ...adapterConfig, ...laneOverride };
  const model = String(merged.model);

  // Remove model from params — it's promoted to its own field
  const params: Record<string, unknown> = { ...merged };
  delete params.model;

  return { variant, adapterType, model, params };
}
