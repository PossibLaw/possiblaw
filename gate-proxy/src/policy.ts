import fs from "node:fs";
import yaml from "js-yaml";
import type { BoundaryType, Decision } from "./types.ts";

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicyError";
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Policy {
  version: 1;
  boundaries: Record<BoundaryType, Decision>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_BOUNDARIES: ReadonlySet<string> = new Set<BoundaryType>([
  "THIRD_PARTY_EGRESS",
  "CONFIDENTIAL_TO_CLOUD",
  "COURT_FILING",
  "SIGNATURE",
  "MONEY_MOVEMENT",
  "IRREVERSIBLE_EXTERNAL_OP",
]);

const VALID_DECISIONS: ReadonlySet<string> = new Set<Decision>([
  "allow",
  "anonymize",
  "human",
  "block",
]);

/** The only top-level keys permitted in a policy file. */
const VALID_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set(["version", "boundaries"]);

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_POLICY: Policy = Object.freeze({
  version: 1 as const,
  boundaries: Object.freeze({
    THIRD_PARTY_EGRESS: "allow" as const,
    CONFIDENTIAL_TO_CLOUD: "anonymize" as const,
    COURT_FILING: "human" as const,
    SIGNATURE: "human" as const,
    MONEY_MOVEMENT: "human" as const,
    IRREVERSIBLE_EXTERNAL_OP: "human" as const,
  }),
});

function freshDefaults(): Policy {
  return {
    version: 1,
    boundaries: { ...DEFAULT_POLICY.boundaries },
  };
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateBoundariesObject(raw: unknown): Record<BoundaryType, Decision> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new PolicyError(
      `boundaries must be a plain object, got: ${Array.isArray(raw) ? "array" : typeof raw}`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (!VALID_BOUNDARIES.has(key)) {
      throw new PolicyError(
        `Unknown boundary key "${key}". Valid keys are: ${[...VALID_BOUNDARIES].join(", ")}`,
      );
    }
    if (!VALID_DECISIONS.has(value as string)) {
      throw new PolicyError(
        `Invalid decision value "${value}" for boundary "${key}". Valid values are: ${[...VALID_DECISIONS].join(", ")}`,
      );
    }
  }

  return obj as Record<BoundaryType, Decision>;
}

// ---------------------------------------------------------------------------
// loadPolicy
// ---------------------------------------------------------------------------

export function loadPolicy(filePath?: string): Policy {
  // No path → conservative defaults
  if (filePath === undefined) {
    return freshDefaults();
  }

  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch (err) {
    // Only ENOENT (file not found) falls back to safe defaults.
    // Any other read error (permissions, I/O) is re-thrown as PolicyError
    // so a misconfigured environment fails loudly rather than silently
    // downgrading enforcement.
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return freshDefaults();
    }
    throw new PolicyError(
      `Failed to read policy file "${filePath}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Parse — any YAML error becomes PolicyError
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch (err) {
    throw new PolicyError(
      `Failed to parse policy YAML: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Must be a plain object (not null, not array, not primitive)
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PolicyError(
      `Policy file must be a YAML mapping, got: ${parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed}`,
    );
  }

  const doc = parsed as Record<string, unknown>;

  // Reject unknown top-level keys — a typo like "boundarys:" silently downgrades
  // the firm to defaults without this check.
  for (const key of Object.keys(doc)) {
    if (!VALID_TOP_LEVEL_KEYS.has(key)) {
      throw new PolicyError(
        `Unknown top-level key "${key}" in policy file. Only "version" and "boundaries" are allowed.`,
      );
    }
  }

  // Validate version if present
  if ("version" in doc) {
    if (doc["version"] !== 1) {
      throw new PolicyError(
        `Unsupported policy version ${String(doc["version"])}. Only version 1 is supported.`,
      );
    }
  }

  // Merge boundaries over defaults
  const merged = freshDefaults();
  if ("boundaries" in doc && doc["boundaries"] !== undefined) {
    const overrides = validateBoundariesObject(doc["boundaries"]);
    for (const [key, value] of Object.entries(overrides)) {
      merged.boundaries[key as BoundaryType] = value;
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// decide
// ---------------------------------------------------------------------------

export function decide(boundary: BoundaryType | null, policy: Policy): Decision {
  if (boundary === null) {
    return "allow";
  }
  return policy.boundaries[boundary];
}
