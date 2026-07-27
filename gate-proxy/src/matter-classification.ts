// gate-proxy/src/matter-classification.ts
// Per-matter confidentiality classification registry (Task H / S1 fix).
//
// Problem: meta.confidentiality on an egress request is typed by the CALLING
// AGENT — a mis-prompted or injected agent can downgrade the label and route
// privileged text to a cloud model unanonymized. This registry gives the gate
// proxy its own trustworthy source: the operator/launcher/chief-of-staff intake
// registers each matter's tier once (POST /matters/classification), and at
// egress the EFFECTIVE confidentiality = max(registered floor, request tier) —
// a request may RAISE the tier, never LOWER it (standard < confidential <
// privileged).
//
// State derives from the receipt chain (restart-safe) — the same pattern as
// CitationRegistry / AuthorityRegistry: no separate state file, rebuilt on
// every construction. Receipts carry ids + enums + hashes only (issueId, tier,
// effectiveTier, payload sha) — never matter content (payload-text invariant).
//
// Raise-only registry semantics are security-load-bearing: the POST route is
// reachable by the same agents whose self-reported labels we distrust, so a
// later lower registration must NOT lower an existing floor (the attempt is
// still receipted for audit). Corrupt-chain posture mirrors the other
// registries (Phase 1): the proxy stays bootable, get() returns undefined
// (no floors), register() throws — the operator repairs the chain and
// restarts. Residual gap while corrupt: unregistered-matter behavior applies,
// which for query_external_model still fail-closes via the policy's
// unspecified-confidentiality default.
import type { ReceiptChain } from "./receipts.ts";
import { ReceiptChainCorruptError, sha256hex, canonicalJson } from "./receipts.ts";
import type { Confidentiality } from "./types.ts";

// ---------------------------------------------------------------------------
// Confidentiality ordering + guards
// ---------------------------------------------------------------------------

/** Ordering for the raise-only comparison: standard < confidential < privileged. */
export const CONFIDENTIALITY_ORDER: Readonly<Record<Confidentiality, number>> = Object.freeze({
  standard: 0,
  confidential: 1,
  privileged: 2,
});

/** Fail-closed enum guard: exactly the three known tiers, nothing else. */
export function isConfidentiality(v: unknown): v is Confidentiality {
  return v === "standard" || v === "confidential" || v === "privileged";
}

/** I1 (a) safe ID pattern — mirrored from server.ts (same contract). */
const SAFE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

// ---------------------------------------------------------------------------
// resolveEffectiveConfidentiality — pure decision helper used by handleEgress
// ---------------------------------------------------------------------------

export interface EffectiveConfidentialityInput {
  /** Raw request-supplied meta.confidentiality (untrusted; may be anything). */
  claimed: unknown;
  /** Registered per-matter floor from the registry, if any. */
  registeredFloor: Confidentiality | undefined;
  /**
   * Fail-closed default applied when there is no registered floor and no
   * usable claimed tier (null = no default → legacy behavior). The server
   * passes "confidential" here ONLY for query_external_model when the policy's
   * unspecifiedConfidentialityDefault knob is on.
   */
  unspecifiedDefault: Confidentiality | null;
  /**
   * C2 — registered floors of every OTHER matter that contributed context to
   * this payload, from the trace's contextRefs.
   *
   * The gate previously reasoned only about the matter an egress was filed
   * under. That is blind to contamination: an agent working a standard matter
   * can draw on a privileged one, and the payload inherits the standard floor
   * while carrying privileged facts. Folding contributing floors into the max
   * makes confidentiality a property of what went INTO the work rather than an
   * assertion about where it was filed.
   *
   * Honesty limit, stated plainly: this is only as complete as the declared
   * context. An agent that omits a source matter evades it. What it defeats is
   * the ordinary case — an agent that correctly reports its context and would
   * otherwise have had that context silently under-classified. The trace store
   * records the same refs, so an omission is detectable after the fact even
   * when it is not preventable.
   */
  contributingFloors?: readonly (Confidentiality | undefined)[];
}

export interface EffectiveConfidentialityResult {
  effective: Confidentiality | undefined;
  /** True when the registered floor raised (or filled in) the request tier. */
  floorApplied: boolean;
  /** True when the fail-closed unspecified default supplied the value. */
  defaultApplied: boolean;
  /**
   * C2 — true when a CONTRIBUTING matter's floor set the tier above what the
   * filed matter alone would have produced. This is the contamination signal:
   * the work is filed under a standard matter but drew on a privileged one.
   */
  provenanceApplied: boolean;
}

/**
 * Highest tier among the supplied values, ignoring undefined. Returns
 * undefined when nothing is known — never a default; the caller decides what
 * "nothing known" means.
 */
export function maxConfidentiality(
  tiers: readonly (Confidentiality | undefined)[],
): Confidentiality | undefined {
  let best: Confidentiality | undefined;
  for (const t of tiers) {
    if (t === undefined) continue;
    if (best === undefined || CONFIDENTIALITY_ORDER[t] > CONFIDENTIALITY_ORDER[best]) best = t;
  }
  return best;
}

/**
 * EFFECTIVE confidentiality = max(registered floor, claimed tier). The request
 * may RAISE the tier above the floor, never LOWER it. An unrecognized claimed
 * value counts as unspecified (fail-closed — a crafted label cannot dodge the
 * floor or the default). Without a floor: claimed wins when valid, else the
 * unspecified default (when configured), else undefined (legacy behavior).
 */
export function resolveEffectiveConfidentiality(
  input: EffectiveConfidentialityInput,
): EffectiveConfidentialityResult {
  const claimedTier = isConfidentiality(input.claimed) ? input.claimed : undefined;

  // C2: the operative floor is the highest of the filed matter's floor and the
  // floor of every matter that contributed context. Raise-only is preserved —
  // adding contributors can only push the tier up, never down.
  const provenanceFloor = maxConfidentiality(input.contributingFloors ?? []);
  const floor = maxConfidentiality([input.registeredFloor, provenanceFloor]);

  // Did provenance push above what the filed matter alone would have given?
  const provenanceApplied =
    provenanceFloor !== undefined &&
    (input.registeredFloor === undefined ||
      CONFIDENTIALITY_ORDER[provenanceFloor] > CONFIDENTIALITY_ORDER[input.registeredFloor]);

  if (floor !== undefined) {
    const effective =
      claimedTier !== undefined &&
      CONFIDENTIALITY_ORDER[claimedTier] >= CONFIDENTIALITY_ORDER[floor]
        ? claimedTier
        : floor;
    return {
      effective,
      floorApplied: effective !== claimedTier,
      defaultApplied: false,
      // Only report contamination when it actually changed the outcome.
      provenanceApplied: provenanceApplied && effective === floor,
    };
  }

  if (claimedTier !== undefined) {
    return { effective: claimedTier, floorApplied: false, defaultApplied: false, provenanceApplied: false };
  }

  if (input.unspecifiedDefault !== null) {
    return { effective: input.unspecifiedDefault, floorApplied: false, defaultApplied: true, provenanceApplied: false };
  }

  return { effective: undefined, floorApplied: false, defaultApplied: false, provenanceApplied: false };
}

// ---------------------------------------------------------------------------
// MatterClassificationRegistry
// ---------------------------------------------------------------------------

export interface RegisterClassificationInput {
  issueId: string;
  tier: Confidentiality;
  agentId?: string;
}

export interface RegisterClassificationResult {
  ok: true;
  issueId: string;
  /** The tier that was requested in this registration. */
  requestedTier: Confidentiality;
  /** The floor now in force (raise-only merge of all registrations). */
  effectiveTier: Confidentiality;
}

export class MatterClassificationRegistry {
  // SECURITY INVARIANT: the map holds only safe-pattern issueIds → tier enums.
  // It is never persisted independently — state is rebuilt from the receipt
  // chain on every construction so it survives restarts without a state file.
  private readonly tiers = new Map<string, Confidentiality>();

  // Phase 1 posture (mirrors CitationRegistry/AuthorityRegistry): a corrupt
  // chain does NOT crash the proxy at startup. The registry fails closed
  // (no floors readable, registration refused) until the operator repairs the
  // chain and restarts; /health surfaces 503 receipts_corrupt for diagnostics.
  private chainCorrupt = false;

  constructor(private readonly receipts: ReceiptChain) {
    const chainResult = receipts.verify();
    if (!chainResult.ok) {
      this.chainCorrupt = true;
      return;
    }
    // Rebuild floors from the chain: only performed matter_classification
    // quality receipts count (fail-closed: anything else — wrong tool, wrong
    // outcome, malformed tier or issueId — is ignored). Replaying the
    // requested tier through the same raise-only merge converges to the exact
    // in-memory state the writing process had.
    for (const entry of receipts.entries()) {
      if (
        entry.body.kind === "quality" &&
        entry.body.tool === "matter_classification" &&
        entry.body.outcome === "performed"
      ) {
        const issueId = entry.body.issueId;
        const tier = entry.body.meta?.["tier"];
        if (typeof issueId === "string" && SAFE_ID_RE.test(issueId) && isConfidentiality(tier)) {
          this.applyRaiseOnly(issueId, tier);
        }
      }
    }
  }

  /** Raise-only merge: a lower tier never overwrites a higher one. */
  private applyRaiseOnly(issueId: string, tier: Confidentiality): Confidentiality {
    const previous = this.tiers.get(issueId);
    const effective =
      previous !== undefined && CONFIDENTIALITY_ORDER[previous] > CONFIDENTIALITY_ORDER[tier]
        ? previous
        : tier;
    this.tiers.set(issueId, effective);
    return effective;
  }

  /** The registered floor for a matter, or undefined when never registered. */
  get(issueId: string): Confidentiality | undefined {
    // Fail-closed: no floors are readable over a corrupt chain.
    if (this.chainCorrupt) return undefined;
    return this.tiers.get(issueId);
  }

  /**
   * Register (or attempt to raise) a matter's confidentiality floor.
   *
   * Appends a performed quality receipt (tool=matter_classification) carrying
   * ids/enums/hashes only: issueId, the requested tier, and the effective tier
   * after the raise-only merge — a downgrade ATTEMPT is therefore receipted
   * with honest meta ({tier: lower, effectiveTier: unchanged-higher}) while the
   * floor itself never lowers.
   *
   * Throws (no receipt appended) on invalid input or a corrupt chain.
   */
  register(input: RegisterClassificationInput): RegisterClassificationResult {
    if (this.chainCorrupt) {
      throw new ReceiptChainCorruptError(
        "MatterClassificationRegistry: receipt chain failed integrity verification; repair the chain and restart the proxy",
      );
    }
    // Defense in depth: the route pre-validates, but the registry is
    // independently callable — re-check the same contracts fail-closed.
    if (typeof input.issueId !== "string" || !SAFE_ID_RE.test(input.issueId)) {
      throw new Error("invalid_issueId: must match [A-Za-z0-9-]{1,64}");
    }
    if (!isConfidentiality(input.tier)) {
      throw new Error('invalid_tier: must be one of "standard", "confidential", "privileged"');
    }

    const previous = this.tiers.get(input.issueId);
    const effectiveTier =
      previous !== undefined &&
      CONFIDENTIALITY_ORDER[previous] > CONFIDENTIALITY_ORDER[input.tier]
        ? previous
        : input.tier;

    // SECURITY INVARIANT: receipt carries ids/enums/hashes only.
    this.receipts.append({
      kind: "quality",
      tool: "matter_classification",
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: sha256hex(canonicalJson({ issueId: input.issueId, tier: input.tier })),
      agentId: input.agentId,
      issueId: input.issueId,
      meta: { tier: input.tier, effectiveTier },
    });
    this.tiers.set(input.issueId, effectiveTier);
    return { ok: true, issueId: input.issueId, requestedTier: input.tier, effectiveTier };
  }
}
