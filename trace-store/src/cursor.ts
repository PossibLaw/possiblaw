// trace-store/src/cursor.ts
//
// M4 — durable per-matter poll cursor.
//
// The trace store is append-only and has no dedupe. A poller that restarts
// mid-run and re-emits what it already wrote would double every record, and a
// duplicated audit trail is worse than a thin one: it makes counts meaningless
// and invites the reader to assume an agent acted twice.
//
// The cursor is a SET OF EMITTED SOURCE IDS rather than a timestamp watermark.
// Timestamps are the obvious choice and the wrong one here: the control plane
// can create two work products in the same second, clocks can move backwards,
// and a paused matter can gain an item with an older timestamp than one already
// seen. An id set is exact, and a matter's item count is small enough that the
// storage cost is irrelevant.

import fs from "node:fs";
import path from "node:path";
import { TraceStoreError } from "./store.ts";

/** Matches the store's partition-id rule — a cursor id is also a filename. */
const SAFE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export interface PollCursor {
  issueId: string;
  /** Source ids already turned into trace records. Order is not significant. */
  emittedSourceIds: string[];
  /** ISO-8601 of the last completed poll. Informational only. */
  lastPolledAt?: string;
}

export function cursorPath(dir: string, issueId: string): string {
  if (!SAFE_ID_RE.test(issueId)) {
    throw new TraceStoreError(`invalid issueId: must match ${SAFE_ID_RE}`);
  }
  return path.join(dir, "cursors", `${issueId}.json`);
}

/** Read a cursor, or an empty one when the matter has never been polled. */
export function readCursor(dir: string, issueId: string): PollCursor {
  const file = cursorPath(dir, issueId);
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return { issueId, emittedSourceIds: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new TraceStoreError(`corrupt poll cursor: ${file}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TraceStoreError(`corrupt poll cursor: ${file}`);
  }

  const doc = parsed as Record<string, unknown>;
  const ids = doc["emittedSourceIds"];
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string")) {
    throw new TraceStoreError(`corrupt poll cursor: ${file}`);
  }

  const cursor: PollCursor = { issueId, emittedSourceIds: ids as string[] };
  if (typeof doc["lastPolledAt"] === "string") cursor.lastPolledAt = doc["lastPolledAt"];
  return cursor;
}

/**
 * Persist a cursor via temp file + rename.
 *
 * Written AFTER the records it accounts for. A crash between the two re-emits
 * on the next poll, which is a duplicate; the reverse order would drop records
 * silently. Given the choice, a visible duplicate beats an invisible gap in an
 * audit trail.
 */
export function writeCursor(dir: string, cursor: PollCursor): void {
  const file = cursorPath(dir, cursor.issueId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(cursor, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}
