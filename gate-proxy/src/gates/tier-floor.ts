import type { Confidentiality } from "../types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelTier = "local" | "cloud";

export interface TierFloorInput {
  confidentiality: Confidentiality | undefined; // undefined treated as fail-closed unknown
  targetTier: ModelTier;
  localAvailable: boolean;
}

export type TierFloorResult =
  | { action: "allow"; useLocal: boolean }
  | { action: "anonymize" }
  | { action: "block"; reason: string };

// ---------------------------------------------------------------------------
// evaluateTierFloor
//
// Pure function. Rules applied in priority order:
//   1. undefined or unknown confidentiality → block (fail-closed)
//   2. standard → allow, useLocal: false
//   3. confidential/privileged + local tier → allow, useLocal: true
//   4. confidential/privileged + cloud + localAvailable → allow, useLocal: true (prefer local)
//   5. confidential/privileged + cloud + no local → anonymize (caller decides block vs proceed)
// ---------------------------------------------------------------------------

const KNOWN_CONFIDENTIALITY: ReadonlySet<string> = new Set<Confidentiality>([
  "standard",
  "confidential",
  "privileged",
]);

export function evaluateTierFloor(input: TierFloorInput): TierFloorResult {
  const { confidentiality, targetTier, localAvailable } = input;

  // Rule 1: fail-closed on unknown/undefined confidentiality
  if (confidentiality === undefined || !KNOWN_CONFIDENTIALITY.has(confidentiality)) {
    return {
      action: "block",
      reason: `Unknown confidentiality value: ${JSON.stringify(confidentiality)}. Must be "standard", "confidential", or "privileged".`,
    };
  }

  // Rule 2: standard → allow without local preference
  if (confidentiality === "standard") {
    return { action: "allow", useLocal: false };
  }

  // Rules 3–5: confidential or privileged
  // Rule 3: caller targeted local → honour it
  if (targetTier === "local") {
    return { action: "allow", useLocal: true };
  }

  // Rule 4: cloud target but local is available → prefer local
  if (localAvailable) {
    return { action: "allow", useLocal: true };
  }

  // Rule 5: cloud target, no local → caller must anonymize
  return { action: "anonymize" };
}
