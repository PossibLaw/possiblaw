// mcp-servers/firm-facade/src/policy.ts
//
// loadFirmFacadePolicy — reads the firmFacade section from the shared gate-policy.yaml.
//
// FAIL-CLOSED design mirrors gate-proxy/src/policy.ts:
//   missing file, parse error, missing `firmFacade` key, or
//   `allowWorkProductText !== true` (literal boolean) → { allowWorkProductText: false }.
//
// ONLY the literal boolean `true` in YAML enables full-text disclosure.
// The string "true", the integer 1, null, or any other value → closed.
//
// Path resolution: explicit `path` arg → GATE_POLICY_PATH env var → fail-closed.
// The GATE_POLICY_PATH env var is the same variable the gate proxy uses so operators
// can configure a single env var for both processes.

import fs from "node:fs";
import yaml from "js-yaml";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FirmFacadePolicy {
  allowWorkProductText: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Immutable closed-policy sentinel. Returned on every error path. */
const CLOSED: Readonly<FirmFacadePolicy> = Object.freeze({ allowWorkProductText: false });

// ---------------------------------------------------------------------------
// loadFirmFacadePolicy
// ---------------------------------------------------------------------------

/**
 * Load the `firmFacade` section from the gate policy YAML.
 *
 * Fail-closed: missing file, parse error, missing `firmFacade` key,
 * or `allowWorkProductText !== true` (literal boolean) → `{ allowWorkProductText: false }`.
 */
export function loadFirmFacadePolicy(path?: string): FirmFacadePolicy {
  const filePath = path ?? process.env["GATE_POLICY_PATH"];
  if (!filePath) return CLOSED;

  // Read file — fail-closed on any read error (including ENOENT)
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return CLOSED;
  }

  // Parse YAML — fail-closed on any parse error
  let parsed: unknown;
  try {
    parsed = yaml.load(raw);
  } catch {
    return CLOSED;
  }

  // Must be a plain object
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return CLOSED;
  }

  const doc = parsed as Record<string, unknown>;

  // firmFacade section must be present and a plain object
  const facade = doc["firmFacade"];
  if (facade === null || typeof facade !== "object" || Array.isArray(facade)) {
    return CLOSED;
  }

  const facadeObj = facade as Record<string, unknown>;

  // ONLY the literal boolean `true` enables full-text disclosure.
  // String "true", integer 1, null, or any other value → closed.
  if (facadeObj["allowWorkProductText"] !== true) {
    return CLOSED;
  }

  return { allowWorkProductText: true };
}
