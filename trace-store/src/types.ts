// trace-store/src/types.ts
//
// Execution trace schema. A TraceRecord answers, for one agent step: which
// model ran, when, what went in, what context was pulled, what came out.
//
// SPLIT-STORE INVARIANT: the gate-proxy receipt chain stays hash-only and
// shareable; this store is the content-bearing half and never leaves the
// firm perimeter. A receipt binds to a record via traceId + contentSha256,
// so the attestation survives a retention purge of the content itself.

/** Model lane declared per agent in companies/legal-operations/variants.yaml. */
export type ModelLane = "primary" | "routing" | "drafting" | "review" | "extractive";

/**
 * How much of each step is retained.
 *   - "off"          — nothing recorded (the store is closed).
 *   - "hashes-only"  — record + contentSha256 retained, content discarded.
 *                      Proves what the prompt WAS without storing it.
 *   - "full"         — content retained, readable by roles on the allow list.
 */
export type CaptureMode = "off" | "hashes-only" | "full";

/** Roles that may be granted visibility of captured prompt/output content. */
export type TraceRole = "admin" | "supervising-lawyer" | "auditor" | "agent";

export const TRACE_ROLES: readonly TraceRole[] = Object.freeze([
  "admin",
  "supervising-lawyer",
  "auditor",
  "agent",
]);

export type TraceOutcome = "ok" | "error" | "blocked";

/**
 * A pointer to something pulled into the model's context. Carries a reference
 * and optionally a hash — NEVER the retrieved text itself. Retrieved text, when
 * retained at all, belongs in TraceContent under the same capture rules.
 */
export interface ContextRef {
  kind: "skill" | "document" | "connector" | "memory" | "work-product";
  /** Slug, id, or connector name. Not content. */
  ref: string;
  /** Hash of the pulled content, when the caller knows it. */
  sha256?: string;
}

/** The sensitive half of a trace record. Present only under capture "full". */
export interface TraceContent {
  systemPrompt?: string;
  prompt?: string;
  output?: string;
}

export interface TraceRecord {
  traceId: string;
  /** ISO-8601 UTC. */
  ts: string;
  companyId?: string;
  /** Matter id. Also the per-matter partition key of the store. */
  issueId?: string;
  agentId: string;
  agentSlug?: string;
  step?: number;

  // ---- the decision -------------------------------------------------------
  modelLane?: ModelLane;
  /** Variant name from variants.yaml, e.g. "claude-api". */
  variant?: string;
  /** Concrete model id the adapter actually invoked. */
  model?: string;
  /** Paperclip adapter type, e.g. "claude_local". */
  adapter?: string;

  // ---- what it drew on ----------------------------------------------------
  contextRefs?: ContextRef[];
  costCents?: number;
  durationMs?: number;
  outcome: TraceOutcome;

  // ---- content ------------------------------------------------------------
  /** Omitted under "hashes-only", after a purge, and for roles without access. */
  content?: TraceContent;
  /** Always present. Computed from the content as supplied, before any drop. */
  contentSha256: string;
  /** Set when a retention purge removed the content. */
  contentPurgedAt?: string;
}

/** Fields a caller supplies; the store derives traceId, ts and contentSha256. */
export type TraceInput = Omit<TraceRecord, "traceId" | "ts" | "contentSha256" | "contentPurgedAt"> & {
  traceId?: string;
  ts?: string;
};
