import type { Confidentiality } from "../types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelTier = "local" | "cloud";

/**
 * Contracted data terms of the active cloud lane. The operator asserts these in
 * `companies/legal-operations/variants.yaml`; the gate trusts + records them, it
 * does not verify the underlying contract (see the build spec, "Out of scope").
 *
 * The load-bearing term is `zdr` (zero data retention), not merely `!trains` —
 * see docs/privilege-and-confidentiality.md ("The load-bearing term is ZDR").
 * The NYT v. OpenAI preservation order spared ZDR/Enterprise/API customers
 * because nothing was retained; "no training" alone is insufficient.
 */
export interface DataTerms {
  /** Zero data retention contracted with the provider. */
  zdr: boolean;
  /** Provider trains on inputs/outputs. trains:true is a hard block (see below). */
  trains: boolean;
  /** Provider performs human review of content. */
  humanReview: boolean;
  /** Tenant-isolated deployment. */
  tenantIsolated: boolean;
  /**
   * Consumer-subscription endpoint (trains by default, reserves third-party
   * disclosure rights). This is the only configuration the case law condemns
   * (U.S. v. Heppner). Treated identically to trains:true — a hard block.
   */
  consumerEndpoint?: boolean;
}

export interface TierFloorInput {
  confidentiality: Confidentiality | undefined; // undefined treated as fail-closed unknown
  targetTier: ModelTier;
  localAvailable: boolean;
  /**
   * Optional data-terms posture of the cloud lane. When omitted, the function
   * falls back to the legacy binary cloud/local behaviour for backward
   * compatibility with existing callers/tests.
   */
  dataTerms?: DataTerms;
  /**
   * Operator's documented choice to run a privileged matter on a (ZDR) cloud
   * lane under counsel direction — the path Heppner expressly left open for
   * counsel-directed enterprise use. Only honoured when the strict ZDR terms
   * also hold; never overrides the training-lane hard block.
   */
  counselDirected?: boolean;
}

/**
 * Which data-terms posture the decision relied on, recorded into the receipt
 * meta (`meta.dataTermsTier`) so the sign-off bundle can show *why* a cloud lane
 * was acceptable for a sensitive matter.
 *   - "standard-cloud": standard matter on a non-training cloud lane.
 *   - "zdr-cloud": confidential matter on a strict-ZDR cloud lane.
 *   - "zdr-cloud-counsel-directed": privileged matter on a strict-ZDR cloud
 *     lane under explicit counsel direction.
 *   - "local": routed to a local model (binary-local or preferred-local).
 *   - "anonymize": caller must anonymize before any cloud egress.
 *   - "blocked-trains": training / consumer endpoint — hard blocked.
 */
export type DataTermsTier =
  | "standard-cloud"
  | "zdr-cloud"
  | "zdr-cloud-counsel-directed"
  | "local"
  | "anonymize"
  | "blocked-trains";

export type TierFloorResult =
  | { action: "allow"; useLocal: boolean; dataTermsTier?: DataTermsTier }
  | { action: "anonymize"; dataTermsTier?: DataTermsTier }
  | { action: "block"; reason: string; dataTermsTier?: DataTermsTier };

// ---------------------------------------------------------------------------
// evaluateTierFloor
//
// Pure function (no I/O). Reasons about a cloud lane's *data terms*, not just
// binary cloud-vs-local. Policy table (per the build spec and
// docs/privilege-and-confidentiality.md "The tier policy PossibLaw should
// encode"):
//
//   | Tier         | Policy                                                    |
//   |--------------|-----------------------------------------------------------|
//   | standard     | cloud OK (enterprise terms)                               |
//   | confidential | cloud OK only if strict-ZDR terms; else prefer local /    |
//   |              | anonymize                                                 |
//   | privileged   | local, OR ZDR-cloud-under-counsel-direction (documented)  |
//   | ANY tier on  | HARD BLOCK — the only config the case law condemns; cannot|
//   | trains:true  | be overridden by tier, counsel direction, or any fallback |
//   | / consumer   |                                                           |
//
// Rule order is significant: the training/consumer hard block is evaluated
// FIRST so no tier or counsel-direction path can route matter data to a
// training endpoint.
//
// Backward compatibility: when `dataTerms` is undefined the function reproduces
// the original binary behaviour exactly:
//   1. undefined/unknown confidentiality → block (fail-closed)
//   2. standard → allow, useLocal:false
//   3. confidential/privileged + local tier → allow, useLocal:true
//   4. confidential/privileged + cloud + localAvailable → allow, useLocal:true
//   5. confidential/privileged + cloud + no local → anonymize
// ---------------------------------------------------------------------------

const KNOWN_CONFIDENTIALITY: ReadonlySet<string> = new Set<Confidentiality>([
  "standard",
  "confidential",
  "privileged",
]);

/** Strict ZDR posture the case law blesses: zero retention + no training + no
 *  human review + tenant isolation (docs/privilege-and-confidentiality.md). */
function isStrictZdr(terms: DataTerms): boolean {
  return terms.zdr && !terms.trains && !terms.humanReview && terms.tenantIsolated;
}

export function evaluateTierFloor(input: TierFloorInput): TierFloorResult {
  const { confidentiality, targetTier, localAvailable, dataTerms, counselDirected } = input;

  // Rule 1: fail-closed on unknown/undefined confidentiality
  if (confidentiality === undefined || !KNOWN_CONFIDENTIALITY.has(confidentiality)) {
    return {
      action: "block",
      reason: `Unknown confidentiality value: ${JSON.stringify(confidentiality)}. Must be "standard", "confidential", or "privileged".`,
    };
  }

  // Rule 0 (highest priority): a training / consumer-tier lane is a HARD BLOCK
  // for ANY tier. This is the only configuration the case law condemns
  // (docs/privilege-and-confidentiality.md). It must be evaluated before any
  // tier reasoning so that no tier, counsel direction, or local/anonymize
  // fallback can route matter data to a training endpoint.
  if (dataTerms && (dataTerms.trains || dataTerms.consumerEndpoint)) {
    return {
      action: "block",
      reason:
        "blocked: target lane trains on inputs/outputs or is a consumer-tier endpoint; " +
        "matter data may not reach a training endpoint (docs/privilege-and-confidentiality.md).",
      dataTermsTier: "blocked-trains",
    };
  }

  // Rule 2: standard → cloud OK. Standard never prefers local (useLocal:false).
  // Record a posture only when dataTerms are present; otherwise preserve the
  // legacy shape exactly.
  if (confidentiality === "standard") {
    if (!dataTerms) {
      return { action: "allow", useLocal: false };
    }
    // dataTerms present (and—per Rule 0—not a training lane).
    return {
      action: "allow",
      useLocal: false,
      dataTermsTier: targetTier === "local" ? "local" : "standard-cloud",
    };
  }

  // Rules 3+: confidential or privileged.

  // Rule 3: caller targeted local → honour it.
  if (targetTier === "local") {
    return dataTerms
      ? { action: "allow", useLocal: true, dataTermsTier: "local" }
      : { action: "allow", useLocal: true };
  }

  // Cloud target from here down.

  // Rule 4 (data-terms aware): a strict-ZDR cloud lane MAY be used directly.
  //   - confidential: allowed on the ZDR cloud lane.
  //   - privileged: allowed on the ZDR cloud lane ONLY under explicit counsel
  //     direction (the documented operator choice Heppner left open). Without
  //     counselDirected, privileged falls through to prefer-local/anonymize
  //     (belt-and-suspenders).
  if (dataTerms && isStrictZdr(dataTerms)) {
    if (confidentiality === "confidential") {
      return { action: "allow", useLocal: false, dataTermsTier: "zdr-cloud" };
    }
    // privileged
    if (counselDirected) {
      return { action: "allow", useLocal: false, dataTermsTier: "zdr-cloud-counsel-directed" };
    }
    // privileged without counsel direction → fall through to prefer local.
  }

  // Rule 5: cloud target but local is available → prefer local. (Covers: no
  // dataTerms [legacy]; non-strict-ZDR cloud lane; privileged-ZDR-without-
  // counsel-direction.)
  if (localAvailable) {
    return dataTerms
      ? { action: "allow", useLocal: true, dataTermsTier: "local" }
      : { action: "allow", useLocal: true };
  }

  // Rule 6: cloud target, no local → caller must anonymize.
  return dataTerms ? { action: "anonymize", dataTermsTier: "anonymize" } : { action: "anonymize" };
}
