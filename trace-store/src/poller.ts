// trace-store/src/poller.ts
//
// M4 — reconstruct the run skeleton from the control plane.
//
// The gate proxy writes a trace for every EGRESS. That is a small fraction of
// what an agent does: drafting, delegating, and producing work product never
// cross an egress boundary, so the gate never sees them. This poller fills that
// half in by reading what the control plane already exposes — work products,
// delegation, timing, cost — and emitting trace records for it.
//
// STRUCTURAL SOURCE, same rationale as gate-proxy's TraceSink: this module does
// not import a Paperclip client. Two already exist (orchestration-eval and
// firm-overview); a third would be the wrong answer. The caller supplies a
// RunSource and the poller stays testable without a server.
//
// DISTINGUISHABLE FROM GATE TRACES. Polled records carry a `work-product` or
// `issue` contextRef, never the `connector` ref the gate sink writes. A reader
// can therefore tell "the gate observed this action" from "we reconstructed
// this after the fact", which matters because the two have different evidential
// weight — one was witnessed at a control point, the other is a report from the
// system being audited.

import type { TraceConfig } from "./config.ts";
import { makeTraceRecord, type MakeTraceOptions } from "./record.ts";
import { appendTrace } from "./store.ts";
import { readCursor, writeCursor } from "./cursor.ts";
import type { TraceOutcome, TraceRecord } from "./types.ts";

// ---------------------------------------------------------------------------
// Source contract
// ---------------------------------------------------------------------------

export interface WorkProductSummary {
  id: string;
  /** Agent credited with producing it, when the control plane records one. */
  agentId?: string;
  /** ISO-8601 creation time, when available. */
  createdAt?: string;
  type?: string;
  title?: string;
}

export interface SubIssueSummary {
  id: string;
  /** Agent the sub-issue was delegated to. */
  assigneeAgentId?: string;
  createdAt?: string;
}

export interface MatterSnapshot {
  issueId: string;
  status?: string;
  /** Agent the parent matter is assigned to; the fallback attribution. */
  assigneeAgentId?: string;
  workProducts: WorkProductSummary[];
  subIssues: SubIssueSummary[];
  /** Total cost for the matter in cents, when the control plane reports it. */
  costCents?: number;
  companyId?: string;
  /** The human principal on whose behalf the matter is being worked. */
  requestedBy?: string;
}

/** Everything the poller needs, supplied by the caller. Never constructed here. */
export type RunSource = (issueId: string) => Promise<MatterSnapshot>;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface PollResult {
  issueId: string;
  /** Records written by this run. */
  emitted: number;
  /** Sources already accounted for by a previous run. */
  skipped: number;
  /** True when the trace config is closed and nothing was recorded. */
  closed: boolean;
}

export interface PollOptions extends MakeTraceOptions {
  /**
   * Attribute the matter's total cost to the first record emitted for it.
   *
   * The control plane reports cost per MATTER, not per step, so spreading it
   * across records would invent a precision we do not have. Attaching it once
   * and leaving the rest undefined is the honest representation. Default true.
   */
  attributeCost?: boolean;
}

// ---------------------------------------------------------------------------
// Poll
// ---------------------------------------------------------------------------

/**
 * Poll one matter and append trace records for anything not already emitted.
 *
 * Idempotent by construction: the cursor holds the source ids already written,
 * so re-polling an unchanged matter emits nothing. Respects capture mode by
 * routing every record through makeTraceRecord, which returns null on a closed
 * config — the poller must never reach appendTrace directly.
 */
export async function pollMatter(
  source: RunSource,
  dir: string,
  issueId: string,
  config: TraceConfig,
  opts: PollOptions = {},
): Promise<PollResult> {
  // Cheap exit before any network call: a closed config records nothing, so
  // polling would be pure cost.
  if (!config.enabled || config.capture === "off") {
    return { issueId, emitted: 0, skipped: 0, closed: true };
  }

  const snapshot = await source(issueId);
  const cursor = readCursor(dir, issueId);
  const seen = new Set(cursor.emittedSourceIds);
  const attributeCost = opts.attributeCost ?? true;

  let emitted = 0;
  let skipped = 0;
  let costAttributed = false;
  const newlyEmitted: string[] = [];

  const write = (record: TraceRecord | null, sourceId: string): void => {
    if (record === null) return;
    appendTrace(dir, record);
    newlyEmitted.push(sourceId);
    emitted += 1;
  };

  // --- work products ------------------------------------------------------
  for (const wp of snapshot.workProducts) {
    const sourceId = `wp:${wp.id}`;
    if (seen.has(sourceId)) {
      skipped += 1;
      continue;
    }
    const wantsCost = attributeCost && !costAttributed && snapshot.costCents !== undefined;
    const record = makeTraceRecord(
      {
        agentId: wp.agentId ?? snapshot.assigneeAgentId ?? "unknown",
        issueId,
        outcome: "ok" as TraceOutcome,
        ...(snapshot.companyId !== undefined ? { companyId: snapshot.companyId } : {}),
        ...(snapshot.requestedBy !== undefined ? { requestedBy: snapshot.requestedBy } : {}),
        ...(wp.createdAt !== undefined ? { ts: wp.createdAt } : {}),
        ...(wantsCost ? { costCents: snapshot.costCents } : {}),
        contextRefs: [{ kind: "work-product", ref: wp.id, sourceIssueId: issueId }],
      },
      config,
      opts,
    );
    if (record !== null && wantsCost) costAttributed = true;
    write(record, sourceId);
  }

  // --- delegation ---------------------------------------------------------
  // A sub-issue is an agent handing work to another agent. It produces no
  // artifact of its own, but it is the step that explains WHY a different agent
  // appears later in the matter, so it belongs in the skeleton.
  for (const sub of snapshot.subIssues) {
    const sourceId = `sub:${sub.id}`;
    if (seen.has(sourceId)) {
      skipped += 1;
      continue;
    }
    const record = makeTraceRecord(
      {
        agentId: sub.assigneeAgentId ?? snapshot.assigneeAgentId ?? "unknown",
        issueId,
        outcome: "ok" as TraceOutcome,
        ...(snapshot.companyId !== undefined ? { companyId: snapshot.companyId } : {}),
        ...(snapshot.requestedBy !== undefined ? { requestedBy: snapshot.requestedBy } : {}),
        ...(sub.createdAt !== undefined ? { ts: sub.createdAt } : {}),
        contextRefs: [{ kind: "work-product", ref: sub.id, sourceIssueId: sub.id }],
      },
      config,
      opts,
    );
    write(record, sourceId);
  }

  // Cursor written LAST — see cursor.ts on why a duplicate beats a silent gap.
  if (newlyEmitted.length > 0) {
    const now = opts.now ?? (() => new Date());
    writeCursor(dir, {
      issueId,
      emittedSourceIds: [...cursor.emittedSourceIds, ...newlyEmitted],
      lastPolledAt: now().toISOString(),
    });
  }

  return { issueId, emitted, skipped, closed: false };
}
