import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendTrace,
  readTrace,
  readTraces,
  purgeExpiredContent,
  tracePartitionPath,
  TraceStoreError,
  UNFILED_PARTITION,
} from "./store.ts";
import { makeTraceRecord } from "./record.ts";
import type { TraceConfig } from "./config.ts";
import type { TraceInput } from "./types.ts";

const FULL: TraceConfig = {
  enabled: true,
  capture: "full",
  contentRoles: ["admin"],
  retentionDays: 90,
};

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trace-store-"));
}

function input(over: Partial<TraceInput> = {}): TraceInput {
  return {
    agentId: "agent-1",
    issueId: "POS-42",
    outcome: "ok",
    content: { prompt: "p", output: "o" },
    ...over,
  };
}

function at(iso: string, id: string) {
  return { now: () => new Date(iso), newId: () => id };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

test("partition path is per matter", () => {
  assert.equal(tracePartitionPath("/d", "POS-42"), path.join("/d", "POS-42.jsonl"));
  assert.equal(tracePartitionPath("/d", undefined), path.join("/d", `${UNFILED_PARTITION}.jsonl`));
});

test("traversal and malformed ids throw rather than being sanitized", () => {
  for (const bad of ["../etc/passwd", "a/b", "POS 42", "", "x".repeat(65), "POS.42"]) {
    assert.throws(() => tracePartitionPath("/d", bad), TraceStoreError, `id: ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// Append + read
// ---------------------------------------------------------------------------

test("append then read round-trips in order", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-07-27T10:00:00.000Z", "t1")));
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-07-27T11:00:00.000Z", "t2")));
  const rs = readTraces(dir, "POS-42");
  assert.equal(rs.length, 2);
  assert.deepEqual(rs.map((r) => r.traceId), ["t1", "t2"]);
  assert.equal(rs[0]?.content?.prompt, "p");
});

test("appending null is a no-op", () => {
  const dir = tmpdir();
  appendTrace(dir, null);
  assert.deepEqual(readTraces(dir, "POS-42"), []);
});

test("matters are partitioned from one another", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input({ issueId: "POS-1" }), FULL, at("2026-07-27T10:00:00.000Z", "a")));
  appendTrace(dir, makeTraceRecord(input({ issueId: "POS-2" }), FULL, at("2026-07-27T10:00:00.000Z", "b")));
  assert.deepEqual(readTraces(dir, "POS-1").map((r) => r.traceId), ["a"]);
  assert.deepEqual(readTraces(dir, "POS-2").map((r) => r.traceId), ["b"]);
});

test("a missing partition reads empty", () => {
  assert.deepEqual(readTraces(tmpdir(), "POS-99"), []);
});

test("a corrupt partition throws rather than silently dropping rows", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-07-27T10:00:00.000Z", "t1")));
  fs.appendFileSync(tracePartitionPath(dir, "POS-42"), "{not json\n", "utf8");
  assert.throws(() => readTraces(dir, "POS-42"), TraceStoreError);
});

test("readTrace finds by id and returns null when absent", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-07-27T10:00:00.000Z", "t1")));
  assert.equal(readTrace(dir, "POS-42", "t1")?.traceId, "t1");
  assert.equal(readTrace(dir, "POS-42", "nope"), null);
});

// ---------------------------------------------------------------------------
// Retention purge
// ---------------------------------------------------------------------------

test("purge strips expired content but preserves record, hash and metadata", () => {
  const dir = tmpdir();
  const old = makeTraceRecord(input(), FULL, at("2026-01-01T00:00:00.000Z", "old"));
  const fresh = makeTraceRecord(input(), FULL, at("2026-07-20T00:00:00.000Z", "fresh"));
  appendTrace(dir, old);
  appendTrace(dir, fresh);

  const res = purgeExpiredContent(dir, "POS-42", FULL, {
    now: () => new Date("2026-07-27T00:00:00.000Z"),
  });
  assert.deepEqual(res, { purged: 1, scanned: 2 });

  const rs = readTraces(dir, "POS-42");
  const purged = rs.find((r) => r.traceId === "old");
  assert.equal(purged?.content, undefined);
  assert.equal(purged?.contentSha256, old?.contentSha256, "hash survives the purge");
  assert.equal(purged?.agentId, "agent-1");
  assert.ok(purged?.contentPurgedAt);
  // Inside the window, content is untouched.
  assert.equal(rs.find((r) => r.traceId === "fresh")?.content?.prompt, "p");
});

test("purge is idempotent", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-01-01T00:00:00.000Z", "old")));
  const opts = { now: () => new Date("2026-07-27T00:00:00.000Z") };
  assert.equal(purgeExpiredContent(dir, "POS-42", FULL, opts).purged, 1);
  assert.equal(purgeExpiredContent(dir, "POS-42", FULL, opts).purged, 0);
});

test("content with an unparseable timestamp is treated as expired", () => {
  const dir = tmpdir();
  const r = makeTraceRecord(input(), FULL, at("2026-07-27T10:00:00.000Z", "bad-ts"));
  assert.ok(r);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(
    tracePartitionPath(dir, "POS-42"),
    `${JSON.stringify({ ...r, ts: "not-a-date" })}\n`,
    "utf8",
  );
  const res = purgeExpiredContent(dir, "POS-42", FULL, {
    now: () => new Date("2026-07-27T11:00:00.000Z"),
  });
  assert.equal(res.purged, 1);
  assert.equal(readTraces(dir, "POS-42")[0]?.content, undefined);
});

test("purge on an empty partition is a no-op", () => {
  assert.deepEqual(purgeExpiredContent(tmpdir(), "POS-42", FULL), { purged: 0, scanned: 0 });
});

test("an invalid retention window throws", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-01-01T00:00:00.000Z", "old")));
  assert.throws(
    () => purgeExpiredContent(dir, "POS-42", FULL, { retentionDays: 0 }),
    TraceStoreError,
  );
});

test("purge leaves no temp file behind", () => {
  const dir = tmpdir();
  appendTrace(dir, makeTraceRecord(input(), FULL, at("2026-01-01T00:00:00.000Z", "old")));
  purgeExpiredContent(dir, "POS-42", FULL, { now: () => new Date("2026-07-27T00:00:00.000Z") });
  assert.deepEqual(
    fs.readdirSync(dir).filter((f) => f.includes(".tmp-")),
    [],
  );
});
