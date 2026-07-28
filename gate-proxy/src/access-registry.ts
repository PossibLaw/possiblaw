// gate-proxy/src/access-registry.ts
// C3 PR 2 — effective matter access: the firm baseline folded with receipted
// override events.
//
// Two orthogonal questions, composed with AND by the caller:
//   isEntitled(user, matter)              — may this human touch the content?
//   hasDecisionAuthority(user, boundary)  — may this human approve this class?
//
// Decision authority deliberately does NOT imply matter entitlement. If it did,
// an owner would punch straight through the ethical walls `--add-wall` exists to
// build, and a screened partner would stop being screened. Seniority is not a
// cure for a conflict. This works without a new approval surface because the
// human gate already shows only a hash (gates/human.ts) — an owner can authorize
// a wire on a matter they cannot read.
//
// ⚠ REVOCATION INVERTS VERSUS matter-classification.ts. That registry is
// RAISE-ONLY: a later, lower registration is IGNORED, because its write route is
// reachable by the very agents whose labels it distrusts. This registry is the
// opposite — a later REVOKE must WIN, including over the baseline. If revoke only
// beat prior grants, revoking someone the firm document lists would be a no-op
// until the file was edited: a wall that cannot be taken down. Do not "simplify"
// the two into one shape.
//
// Ordering is CHAIN ORDER, never wall-clock. Clocks move backwards and two
// events can share a millisecond; the chain is the authority on sequence. Same
// reasoning that made M4's cursor a set of ids rather than a timestamp.
//
// FAIL CLOSED. Tracing is fail-soft because it is evidence ABOUT a control.
// This IS the control: an unverifiable chain means no readable entitlements,
// which means deny. That is the inverse of MatterClassificationRegistry, which
// degrades to "no floors" and leans on the policy default.
import type { ReceiptChain } from "./receipts.ts";
import { sha256hex, canonicalJson } from "./receipts.ts";
import type { CompiledMatterAccess } from "./matter-access.ts";
import type { BoundaryType } from "./types.ts";

export class MatterAccessRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatterAccessRegistryError";
  }
}

/** Control-plane ids: Paperclip user ids and issue uuids. */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** The tool name every access event shares, so the fold can select on it. */
export const MATTER_ACCESS_TOOL = "matter_access";

export const ACCESS_GRANT_REASON = "access_override";
export const ACCESS_REVOKE_REASON = "access_revoke";
export const ACCESS_EPOCH_REASON = "access_document_epoch";

export interface AccessOverrideInput {
  /** The principal whose access changes. */
  subject: string;
  /** The matter (issue uuid). */
  matter: string;
  /** The admin performing the change. */
  actor: string;
  /** ISO 8601. Required on a grant; an override without expiry becomes the new baseline. */
  expiresAt?: string;
}

interface FoldedEvent {
  kind: "grant" | "revoke";
  /** Epoch in force when the event was appended; undefined before any reload. */
  epoch: string | undefined;
  /** Epoch millis; grants only. */
  expiresAtMs: number | undefined;
}

function pairKey(subject: string, matter: string): string {
  // A space cannot appear in either id under SAFE_ID_RE, so the join is
  // unambiguous and two distinct pairs can never collide on one key.
  return `${subject} ${matter}`;
}

export class MatterAccessRegistry {
  /** Last event per (subject, matter), in chain order. */
  private readonly events = new Map<string, FoldedEvent>();
  /** documentSha256 of the most recent reload, if any. */
  private currentEpoch: string | undefined;
  private chainCorrupt = false;

  constructor(
    private readonly receipts: ReceiptChain,
    private readonly baseline: Readonly<CompiledMatterAccess>,
    private readonly now: () => number = Date.now,
  ) {
    const verified = receipts.verify();
    if (!verified.ok) {
      this.chainCorrupt = true;
      return;
    }
    for (const entry of receipts.entries()) {
      const body = entry.body;
      if (
        body.kind !== "authorization" ||
        body.tool !== MATTER_ACCESS_TOOL ||
        body.outcome !== "performed"
      ) {
        continue;
      }
      const meta = body.meta ?? {};
      const reason = meta["reason"];

      if (reason === ACCESS_EPOCH_REASON) {
        const sha = meta["documentSha256"];
        if (typeof sha === "string" && /^[0-9a-f]{64}$/.test(sha)) this.currentEpoch = sha;
        continue;
      }

      const subject = meta["subject"];
      const matter = meta["matter"];
      // Fail closed on a malformed event: ignore it rather than guess. A
      // malformed GRANT that we drop denies; a malformed REVOKE that we drop
      // could wrongly allow, so both are dropped only when the ids are
      // unusable, which no writer of ours can produce.
      if (typeof subject !== "string" || !SAFE_ID_RE.test(subject)) continue;
      if (typeof matter !== "string" || !SAFE_ID_RE.test(matter)) continue;

      if (reason === ACCESS_GRANT_REASON) {
        const expiresAt = meta["expiresAt"];
        const ms = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
        if (!Number.isFinite(ms)) continue;
        this.events.set(pairKey(subject, matter), {
          kind: "grant",
          epoch: this.currentEpoch,
          expiresAtMs: ms,
        });
      } else if (reason === ACCESS_REVOKE_REASON) {
        this.events.set(pairKey(subject, matter), {
          kind: "revoke",
          epoch: this.currentEpoch,
          expiresAtMs: undefined,
        });
      }
    }
  }

  /** True when the receipt chain failed verification and everything is denied. */
  get corrupt(): boolean {
    return this.chainCorrupt;
  }

  private baselineGrants(userId: string, issueId: string): boolean {
    const matters = Object.prototype.hasOwnProperty.call(this.baseline.matterAccess, userId)
      ? this.baseline.matterAccess[userId]
      : undefined;
    return Array.isArray(matters) && matters.includes(issueId);
  }

  /**
   * May this human touch this matter's content?
   *
   * The last event in chain order decides; with no event the baseline decides.
   * A revoke beats the baseline. A grant is honoured until it expires, after
   * which the pair falls back to the baseline rather than staying denied.
   */
  isEntitled(userId: string, issueId: string): boolean {
    if (this.chainCorrupt) return false;
    if (!SAFE_ID_RE.test(userId) || !SAFE_ID_RE.test(issueId)) return false;

    const base = this.baselineGrants(userId, issueId);
    const last = this.events.get(pairKey(userId, issueId));
    if (last === undefined) return base;

    if (last.kind === "revoke") {
      // Epoch supersession: a reload of the firm document restates the firm's
      // intent, so a revoke recorded under an EARLIER epoch no longer suppresses
      // a pair the new document grants. Without this a runtime revoke silently
      // outlives the firm's own edit — they add Jane back, reload, and nothing
      // happens. Grants are not superseded: they are time-bounded overrides the
      // roster does not speak to.
      if (last.epoch !== this.currentEpoch && base) return true;
      return false;
    }

    // Grant. Later-wins applies even when the later grant is LESS permissive
    // (a shorter expiry) — deliberately unlike the raise-only registry.
    if (last.expiresAtMs !== undefined && this.now() < last.expiresAtMs) return true;
    return base;
  }

  /**
   * Entitlement to EVERY matter in the set — the filed matter plus everything
   * that contributed context. This is what catches the contamination case C1/C2
   * exposes: work filed under a matter the requester holds, drawing on one they
   * do not. An empty set is entitled; nothing to check is not a denial.
   */
  isEntitledToAll(userId: string, issueIds: readonly string[]): boolean {
    for (const issueId of new Set(issueIds)) {
      if (!this.isEntitled(userId, issueId)) return false;
    }
    return true;
  }

  /**
   * May this human approve this class of decision? Baseline only — decision
   * authority is a standing role, not something an override grants for an hour.
   */
  hasDecisionAuthority(userId: string, boundary: BoundaryType): boolean {
    if (this.chainCorrupt) return false;
    if (!SAFE_ID_RE.test(userId)) return false;
    const holders = Object.prototype.hasOwnProperty.call(this.baseline.decisionAuthority, boundary)
      ? this.baseline.decisionAuthority[boundary]
      : undefined;
    return Array.isArray(holders) && holders.includes(userId);
  }

  private assertWritable(): void {
    if (this.chainCorrupt) {
      throw new MatterAccessRegistryError(
        "matter access registry: receipt chain failed integrity verification; repair the chain and restart the gate",
      );
    }
  }

  private assertIds(subject: string, matter: string, actor: string): void {
    for (const [label, value] of [["subject", subject], ["matter", matter], ["actor", actor]] as const) {
      if (typeof value !== "string" || !SAFE_ID_RE.test(value)) {
        throw new MatterAccessRegistryError(`invalid_${label}: must match [A-Za-z0-9_-]{1,128}`);
      }
    }
  }

  /**
   * Grant time-bounded access, receipted rather than configured.
   *
   * Under the ICME rubric an override is good evidence: "the rule fired and a
   * named human overrode it at 14:52" beats a rule that never fired.
   */
  grant(input: AccessOverrideInput): { ok: true; subject: string; matter: string; expiresAt: string } {
    this.assertWritable();
    this.assertIds(input.subject, input.matter, input.actor);

    // Separation of duties. Without it the override is self-service and the
    // control is decorative.
    if (input.actor === input.subject) {
      throw new MatterAccessRegistryError(
        "separation_of_duties: the granting admin must differ from the subject",
      );
    }

    const expiresAt = input.expiresAt;
    if (typeof expiresAt !== "string") {
      throw new MatterAccessRegistryError("expiresAt is required: an override without expiry becomes the new baseline");
    }
    const ms = Date.parse(expiresAt);
    if (!Number.isFinite(ms)) {
      throw new MatterAccessRegistryError("invalid_expiresAt: must be an ISO 8601 timestamp");
    }
    if (ms <= this.now()) {
      throw new MatterAccessRegistryError("invalid_expiresAt: must be in the future");
    }

    // SECURITY INVARIANT: ids and enums only. No email, no matter name, no
    // free-text reason — this receipt is designed to travel.
    this.receipts.append({
      kind: "authorization",
      tool: MATTER_ACCESS_TOOL,
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: sha256hex(canonicalJson({ subject: input.subject, matter: input.matter, expiresAt })),
      issueId: input.matter,
      meta: {
        reason: ACCESS_GRANT_REASON,
        subject: input.subject,
        matter: input.matter,
        grantedBy: input.actor,
        expiresAt,
      },
    });
    this.events.set(pairKey(input.subject, input.matter), {
      kind: "grant",
      epoch: this.currentEpoch,
      expiresAtMs: ms,
    });
    return { ok: true, subject: input.subject, matter: input.matter, expiresAt };
  }

  /**
   * Revoke access. Wins over the baseline and over any prior grant.
   *
   * No separation-of-duties requirement: reducing your own reach is safe, and
   * requiring a second party to withdraw access would slow down the one
   * direction that should always be easy.
   */
  revoke(input: Omit<AccessOverrideInput, "expiresAt">): { ok: true; subject: string; matter: string } {
    this.assertWritable();
    this.assertIds(input.subject, input.matter, input.actor);

    this.receipts.append({
      kind: "authorization",
      tool: MATTER_ACCESS_TOOL,
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: sha256hex(canonicalJson({ subject: input.subject, matter: input.matter })),
      issueId: input.matter,
      meta: {
        reason: ACCESS_REVOKE_REASON,
        subject: input.subject,
        matter: input.matter,
        revokedBy: input.actor,
      },
    });
    this.events.set(pairKey(input.subject, input.matter), {
      kind: "revoke",
      epoch: this.currentEpoch,
      expiresAtMs: undefined,
    });
    return { ok: true, subject: input.subject, matter: input.matter };
  }

  /**
   * Record that the firm document was (re)loaded, opening a new epoch.
   *
   * Called at startup after compiling the document. Revokes recorded under an
   * earlier epoch stop suppressing pairs the new document grants.
   */
  recordDocumentEpoch(documentSha256: string): void {
    this.assertWritable();
    if (!/^[0-9a-f]{64}$/.test(documentSha256)) {
      throw new MatterAccessRegistryError("invalid_documentSha256: must be 64 lowercase hex characters");
    }
    this.receipts.append({
      kind: "authorization",
      tool: MATTER_ACCESS_TOOL,
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: documentSha256,
      meta: { reason: ACCESS_EPOCH_REASON, documentSha256 },
    });
    this.currentEpoch = documentSha256;
  }
}

// ---------------------------------------------------------------------------
// Enforcement adapter — C3 PR 3
// ---------------------------------------------------------------------------

/** Distinct denial reasons, so a receipt says WHICH check failed. */
export const APPROVER_DENIAL = {
  noHuman: "approver_not_identified",
  noAuthority: "approver_lacks_decision_authority",
  notEntitled: "approver_not_entitled_to_matter",
} as const;

/**
 * Discriminated on `ok` so a caller cannot read `reason` off an allow, and
 * cannot forget it on a deny.
 */
export type ApproverVerdict =
  | { ok: true }
  | {
      ok: false;
      /** Machine-readable; one of APPROVER_DENIAL. */
      code: string;
      /** For the issue comment. Carries ids only, never matter facts. */
      reason: string;
    };

/**
 * Decide whether the human who approved may actually have it performed.
 *
 * Returns ok when `enforcement` is "off": the registry still folds and still
 * receipts, but no decision changes. See MatterAccessDocument.enforcement for
 * why that is the default rather than a strict fail-closed.
 *
 * Both checks apply and compose with AND:
 *   - decision authority over the boundary
 *   - entitlement to EVERY matter involved, filed and contributing
 *
 * `local-board` is rejected as a principal: it is paperclip's placeholder for
 * "trusted local machine, nobody logged in", not a person. A production gate is
 * expected to run with --auth-mode authenticated so every approval names a human.
 */
export function checkApprover(
  registry: MatterAccessRegistry,
  enforcement: "off" | "on",
  input: { approverUserId: string | undefined; boundary: BoundaryType; matters: readonly string[] },
): ApproverVerdict {
  if (enforcement === "off") return { ok: true };

  const approver = input.approverUserId;
  if (approver === undefined || approver === "" || approver === "local-board" || approver === "board") {
    return {
      ok: false,
      code: APPROVER_DENIAL.noHuman,
      reason:
        "matter access enforcement is on, but this approval names no authenticated human. " +
        "Run the instance with --auth-mode authenticated so every approval is attributable.",
    };
  }
  if (!registry.hasDecisionAuthority(approver, input.boundary)) {
    return {
      ok: false,
      code: APPROVER_DENIAL.noAuthority,
      reason: `approver ${approver} does not hold decision authority for ${input.boundary}.`,
    };
  }
  if (!registry.isEntitledToAll(approver, input.matters)) {
    return {
      ok: false,
      code: APPROVER_DENIAL.notEntitled,
      // Names the ids only. Which matters exist is not secret (a screened lawyer
      // may legitimately need to know they are screened) but their contents are.
      reason: `approver ${approver} is not entitled to every matter involved in this action.`,
    };
  }
  return { ok: true };
}
