// trace-store/src/record.ts
//
// Canonical hashing and capture-mode construction for trace records.
//
// The load-bearing property: contentSha256 is computed from the content AS
// SUPPLIED, before capture mode decides whether to keep it. Under
// "hashes-only" the store therefore proves what the prompt was without ever
// holding it — and the same hash survives a retention purge, so a receipt
// binding stays verifiable for the life of the matter.

import crypto from "node:crypto";
import type { TraceConfig } from "./config.ts";
import type { TraceContent, TraceInput, TraceRecord } from "./types.ts";

// ---------------------------------------------------------------------------
// Canonical JSON
// ---------------------------------------------------------------------------

/**
 * Deterministic JSON: object keys sorted, undefined-valued keys dropped.
 * Two contents that differ only in key order hash identically.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(obj).sort()) {
    const v = obj[key];
    if (v === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(",")}}`;
}

export function sha256hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Hash of a content object. Absent content normalizes to the empty object, so
 * "no content supplied" has one stable, recognizable hash rather than many.
 */
export function contentSha256(content: TraceContent | undefined): string {
  const normalized: Record<string, string> = {};
  if (content) {
    if (content.systemPrompt !== undefined) normalized["systemPrompt"] = content.systemPrompt;
    if (content.prompt !== undefined) normalized["prompt"] = content.prompt;
    if (content.output !== undefined) normalized["output"] = content.output;
  }
  return sha256hex(canonicalJson(normalized));
}

/** The hash yielded by absent or wholly empty content. */
export const EMPTY_CONTENT_SHA256 = contentSha256(undefined);

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface MakeTraceOptions {
  /** Injection point for tests. */
  now?: () => Date;
  /** Injection point for tests. */
  newId?: () => string;
}

/**
 * Build a record under the active capture mode.
 *
 * Returns null when the config is closed — callers treat null as "record
 * nothing" rather than writing a husk row. Under "hashes-only" the content is
 * dropped but its hash is retained.
 */
export function makeTraceRecord(
  input: TraceInput,
  config: TraceConfig,
  opts: MakeTraceOptions = {},
): TraceRecord | null {
  if (!config.enabled || config.capture === "off") return null;

  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? (() => crypto.randomUUID());

  const sha = contentSha256(input.content);

  const record: TraceRecord = {
    traceId: input.traceId ?? newId(),
    ts: input.ts ?? now().toISOString(),
    agentId: input.agentId,
    outcome: input.outcome,
    contentSha256: sha,
  };

  // Optional scalars — copied only when supplied, so canonical JSON stays tight.
  if (input.companyId !== undefined) record.companyId = input.companyId;
  if (input.issueId !== undefined) record.issueId = input.issueId;
  if (input.agentSlug !== undefined) record.agentSlug = input.agentSlug;
  if (input.step !== undefined) record.step = input.step;
  if (input.modelLane !== undefined) record.modelLane = input.modelLane;
  if (input.variant !== undefined) record.variant = input.variant;
  if (input.model !== undefined) record.model = input.model;
  if (input.adapter !== undefined) record.adapter = input.adapter;
  if (input.contextRefs !== undefined) record.contextRefs = input.contextRefs;
  if (input.costCents !== undefined) record.costCents = input.costCents;
  if (input.durationMs !== undefined) record.durationMs = input.durationMs;

  if (config.capture === "full" && input.content !== undefined) {
    record.content = input.content;
  }

  return record;
}

/** Strip content from a record, preserving the hash. Used by purge and redaction. */
export function withoutContent(record: TraceRecord, purgedAt?: string): TraceRecord {
  const { content: _drop, ...rest } = record;
  const out: TraceRecord = { ...rest };
  if (purgedAt !== undefined) out.contentPurgedAt = purgedAt;
  return out;
}
