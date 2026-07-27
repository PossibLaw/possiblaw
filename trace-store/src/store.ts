// trace-store/src/store.ts
//
// Append-only JSONL trace store, partitioned per matter.
//
// Partitioning by matter is the ethical-wall seam: a reader entitled to one
// matter reads one file, and a wall breach would require reaching a path the
// caller never names. Ids are validated against SAFE_ID_RE before touching the
// filesystem — an id is a filename here, so traversal is a real attack surface
// and an invalid id throws rather than being sanitized into something adjacent.

import fs from "node:fs";
import path from "node:path";
import type { TraceConfig } from "./config.ts";
import { withoutContent } from "./record.ts";
import type { TraceRecord } from "./types.ts";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TraceStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TraceStoreError";
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Matches gate-proxy's issue-id validation so ids agree across both stores. */
const SAFE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** Partition for records that carry no matter id. */
export const UNFILED_PARTITION = "_unfiled";

const MS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Resolve the JSONL file backing one matter's traces.
 * Throws on any id that is not a plain safe token — never coerces.
 */
export function tracePartitionPath(dir: string, issueId: string | undefined): string {
  const partition = issueId ?? UNFILED_PARTITION;
  if (partition !== UNFILED_PARTITION && !SAFE_ID_RE.test(partition)) {
    throw new TraceStoreError(`invalid issueId: must match ${SAFE_ID_RE}`);
  }
  return path.join(dir, `${partition}.jsonl`);
}

// ---------------------------------------------------------------------------
// Append
// ---------------------------------------------------------------------------

/**
 * Append one record. Creates the directory on first write.
 *
 * A null record (the closed-config signal from makeTraceRecord) is a no-op, so
 * callers can pipe straight through without branching on capture state.
 */
export function appendTrace(dir: string, record: TraceRecord | null): void {
  if (record === null) return;
  const file = tracePartitionPath(dir, record.issueId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, "utf8");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Read every record for a matter in append order. Missing partition → []. */
export function readTraces(dir: string, issueId: string | undefined): TraceRecord[] {
  const file = tracePartitionPath(dir, issueId);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: TraceRecord[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed) as TraceRecord);
    } catch {
      throw new TraceStoreError(`corrupt trace partition: ${file}`);
    }
  }
  return out;
}

/** Read a single record by id, or null. */
export function readTrace(
  dir: string,
  issueId: string | undefined,
  traceId: string,
): TraceRecord | null {
  return readTraces(dir, issueId).find((r) => r.traceId === traceId) ?? null;
}

// ---------------------------------------------------------------------------
// Retention purge
// ---------------------------------------------------------------------------

export interface PurgeOptions {
  now?: () => Date;
  /** Overrides config.retentionDays when supplied. */
  retentionDays?: number;
}

export interface PurgeResult {
  /** Records whose content was stripped by this run. */
  purged: number;
  /** Records examined. */
  scanned: number;
}

/**
 * Strip content from records past the retention window.
 *
 * The record, its contentSha256, and any receipt bound to it all survive — a
 * purge removes the privileged text and nothing else, so attestation over the
 * matter stays verifiable for its full life. Already-purged records are
 * skipped; the run is idempotent.
 *
 * Rewrites via a temp file + rename so an interrupted purge cannot truncate
 * the partition.
 */
export function purgeExpiredContent(
  dir: string,
  issueId: string | undefined,
  config: TraceConfig,
  opts: PurgeOptions = {},
): PurgeResult {
  const now = (opts.now ?? (() => new Date()))();
  const retentionDays = opts.retentionDays ?? config.retentionDays;
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    throw new TraceStoreError("retentionDays must be a positive integer");
  }

  const file = tracePartitionPath(dir, issueId);
  const records = readTraces(dir, issueId);
  if (records.length === 0) return { purged: 0, scanned: 0 };

  const cutoff = now.getTime() - retentionDays * MS_PER_DAY;
  const purgedAt = now.toISOString();

  let purged = 0;
  const next = records.map((record) => {
    if (record.content === undefined) return record;
    const ts = Date.parse(record.ts);
    // An unparseable timestamp is treated as expired: content whose age cannot
    // be established must not be retained indefinitely.
    if (!Number.isNaN(ts) && ts > cutoff) return record;
    purged += 1;
    return withoutContent(record, purgedAt);
  });

  if (purged > 0) {
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, next.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
    fs.renameSync(tmp, file);
  }

  return { purged, scanned: records.length };
}
