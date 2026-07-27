import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pollMatter, type MatterSnapshot, type RunSource } from "./poller.ts";
import { readCursor, writeCursor, cursorPath } from "./cursor.ts";
import { readTraces } from "./store.ts";
import { TraceStoreError } from "./store.ts";
import { closedTraceConfig, type TraceConfig } from "./config.ts";

const OPEN: TraceConfig = {
  enabled: true,
  capture: "hashes-only",
  contentRoles: [],
  retentionDays: 90,
};

const FIXED = {
  now: () => new Date("2026-07-27T12:00:00.000Z"),
  newId: (() => {
    let n = 0;
    return () => `trace-${++n}`;
  })(),
};

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trace-poll-"));
}

function snapshot(over: Partial<MatterSnapshot> = {}): MatterSnapshot {
  return {
    issueId: "POS-42",
    assigneeAgentId: "agent-lead",
    workProducts: [
      { id: "wp-1", agentId: "agent-drafting", createdAt: "2026-07-27T10:00:00.000Z" },
      { id: "wp-2", agentId: "agent-review", createdAt: "2026-07-27T11:00:00.000Z" },
    ],
    subIssues: [{ id: "sub-1", assigneeAgentId: "agent-specialist" }],
    costCents: 250,
    companyId: "co-1",
    requestedBy: "user-partner-z",
    ...over,
  };
}

function sourceFor(s: MatterSnapshot): RunSource {
  return async () => s;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

test("emits one record per work product and per delegation", async () => {
  const dir = tmpdir();
  const res = await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);

  assert.equal(res.closed, false);
  assert.equal(res.emitted, 3, "2 work products + 1 sub-issue");
  assert.equal(res.skipped, 0);

  const records = readTraces(dir, "POS-42");
  assert.equal(records.length, 3);
  assert.deepEqual(
    records.map((r) => r.agentId),
    ["agent-drafting", "agent-review", "agent-specialist"],
    "each step is attributed to the agent that performed it",
  );
});

test("carries matter, company and requesting human onto every record", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);
  for (const r of readTraces(dir, "POS-42")) {
    assert.equal(r.issueId, "POS-42");
    assert.equal(r.companyId, "co-1");
    assert.equal(r.requestedBy, "user-partner-z", "supervision record needs the principal");
  }
});

test("uses the control plane's own timestamps when it supplies them", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);
  const [first, second] = readTraces(dir, "POS-42");
  assert.equal(first?.ts, "2026-07-27T10:00:00.000Z");
  assert.equal(second?.ts, "2026-07-27T11:00:00.000Z");
});

test("falls back to the matter assignee when a step names no agent", async () => {
  const dir = tmpdir();
  const s = snapshot({ workProducts: [{ id: "wp-1" }], subIssues: [] });
  await pollMatter(sourceFor(s), dir, "POS-42", OPEN, FIXED);
  assert.equal(readTraces(dir, "POS-42")[0]?.agentId, "agent-lead");
});

test("records 'unknown' rather than inventing an agent", async () => {
  const dir = tmpdir();
  const s = snapshot({ assigneeAgentId: undefined, workProducts: [{ id: "wp-1" }], subIssues: [] });
  await pollMatter(sourceFor(s), dir, "POS-42", OPEN, FIXED);
  assert.equal(readTraces(dir, "POS-42")[0]?.agentId, "unknown");
});

// ---------------------------------------------------------------------------
// Distinguishable from gate-written traces
// ---------------------------------------------------------------------------

test("polled records are marked as reconstructed, not gate-observed", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);
  for (const r of readTraces(dir, "POS-42")) {
    const kinds = (r.contextRefs ?? []).map((c) => c.kind);
    assert.ok(kinds.includes("work-product"), "carries a work-product ref");
    assert.ok(
      !kinds.includes("connector"),
      "must not look like a gate-observed egress — the two have different evidential weight",
    );
  }
});

test("work-product refs record the matter they came from", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);
  assert.equal(readTraces(dir, "POS-42")[0]?.contextRefs?.[0]?.sourceIssueId, "POS-42");
});

// ---------------------------------------------------------------------------
// Idempotence — the contract that shapes the design
// ---------------------------------------------------------------------------

test("re-polling an unchanged matter emits nothing", async () => {
  const dir = tmpdir();
  const src = sourceFor(snapshot());
  await pollMatter(src, dir, "POS-42", OPEN, FIXED);

  const again = await pollMatter(src, dir, "POS-42", OPEN, FIXED);
  assert.equal(again.emitted, 0, "no duplicates");
  assert.equal(again.skipped, 3, "and it says why");
  assert.equal(readTraces(dir, "POS-42").length, 3);
});

test("only genuinely new items are emitted on a later poll", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);

  const grown = snapshot({
    workProducts: [
      { id: "wp-1", agentId: "agent-drafting" },
      { id: "wp-2", agentId: "agent-review" },
      { id: "wp-3", agentId: "agent-drafting" },
    ],
  });
  const res = await pollMatter(sourceFor(grown), dir, "POS-42", OPEN, FIXED);
  assert.equal(res.emitted, 1);
  assert.equal(res.skipped, 3);
  assert.equal(readTraces(dir, "POS-42").length, 4);
});

test("an out-of-order timestamp cannot cause a duplicate", async () => {
  // Why the cursor is an id set and not a watermark: a later poll can surface
  // an item whose createdAt precedes one already emitted.
  const dir = tmpdir();
  await pollMatter(
    sourceFor(snapshot({ workProducts: [{ id: "wp-2", createdAt: "2026-07-27T11:00:00.000Z" }], subIssues: [] })),
    dir, "POS-42", OPEN, FIXED,
  );
  const res = await pollMatter(
    sourceFor(snapshot({
      workProducts: [
        { id: "wp-2", createdAt: "2026-07-27T11:00:00.000Z" },
        { id: "wp-1", createdAt: "2026-07-27T09:00:00.000Z" }, // older, arrived later
      ],
      subIssues: [],
    })),
    dir, "POS-42", OPEN, FIXED,
  );
  assert.equal(res.emitted, 1, "the older item is new and is emitted");
  assert.equal(res.skipped, 1, "the already-seen item is not re-emitted");
});

// ---------------------------------------------------------------------------
// Cost
// ---------------------------------------------------------------------------

test("matter cost is attributed once, not spread across steps", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);
  const withCost = readTraces(dir, "POS-42").filter((r) => r.costCents !== undefined);
  assert.equal(withCost.length, 1, "the control plane reports per-matter cost, not per-step");
  assert.equal(withCost[0]?.costCents, 250);
});

test("cost attribution can be switched off", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, { ...FIXED, attributeCost: false });
  assert.equal(readTraces(dir, "POS-42").every((r) => r.costCents === undefined), true);
});

test("a matter with no reported cost yields no cost field", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot({ costCents: undefined })), dir, "POS-42", OPEN, FIXED);
  assert.equal(readTraces(dir, "POS-42").every((r) => !("costCents" in r)), true);
});

// ---------------------------------------------------------------------------
// Capture mode
// ---------------------------------------------------------------------------

test("a closed config records nothing and never calls the source", async () => {
  const dir = tmpdir();
  let called = false;
  const src: RunSource = async () => {
    called = true;
    return snapshot();
  };
  const res = await pollMatter(src, dir, "POS-42", closedTraceConfig(), FIXED);
  assert.equal(res.closed, true);
  assert.equal(res.emitted, 0);
  assert.equal(called, false, "no network call when there is nothing to record");
  assert.deepEqual(readTraces(dir, "POS-42"), []);
});

test("capture off is treated as closed", async () => {
  const dir = tmpdir();
  const res = await pollMatter(sourceFor(snapshot()), dir, "POS-42", { ...OPEN, capture: "off" }, FIXED);
  assert.equal(res.closed, true);
  assert.equal(res.emitted, 0);
});

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

test("an unpolled matter reads an empty cursor rather than throwing", () => {
  assert.deepEqual(readCursor(tmpdir(), "POS-99"), {
    issueId: "POS-99",
    emittedSourceIds: [],
  });
});

test("the cursor round-trips and records when it last ran", async () => {
  const dir = tmpdir();
  await pollMatter(sourceFor(snapshot()), dir, "POS-42", OPEN, FIXED);
  const c = readCursor(dir, "POS-42");
  assert.equal(c.emittedSourceIds.length, 3);
  assert.ok(c.emittedSourceIds.includes("wp-1") === false, "ids are namespaced by kind");
  assert.ok(c.emittedSourceIds.includes("wp:wp-1"));
  assert.ok(c.emittedSourceIds.includes("sub:sub-1"));
  assert.equal(c.lastPolledAt, "2026-07-27T12:00:00.000Z");
});

test("a work product and a sub-issue sharing an id do not collide", async () => {
  const dir = tmpdir();
  const s = snapshot({
    workProducts: [{ id: "x-1", agentId: "agent-a" }],
    subIssues: [{ id: "x-1", assigneeAgentId: "agent-b" }],
  });
  const res = await pollMatter(sourceFor(s), dir, "POS-42", OPEN, FIXED);
  assert.equal(res.emitted, 2, "namespacing keeps them distinct");
});

test("a corrupt cursor throws rather than silently re-emitting everything", () => {
  const dir = tmpdir();
  const file = cursorPath(dir, "POS-42");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "{not json", "utf8");
  assert.throws(() => readCursor(dir, "POS-42"), TraceStoreError);

  fs.writeFileSync(file, JSON.stringify({ emittedSourceIds: [1, 2] }), "utf8");
  assert.throws(() => readCursor(dir, "POS-42"), TraceStoreError);
});

test("cursor ids are traversal-safe", () => {
  for (const bad of ["../etc/passwd", "a/b", "POS 42", "", "x".repeat(65)]) {
    assert.throws(() => cursorPath("/d", bad), TraceStoreError, bad);
  }
});

test("no cursor is written when nothing was emitted", async () => {
  const dir = tmpdir();
  const s = snapshot({ workProducts: [], subIssues: [] });
  await pollMatter(sourceFor(s), dir, "POS-42", OPEN, FIXED);
  assert.equal(fs.existsSync(cursorPath(dir, "POS-42")), false);
});

test("writeCursor leaves no temp file behind", () => {
  const dir = tmpdir();
  writeCursor(dir, { issueId: "POS-42", emittedSourceIds: ["wp:1"] });
  const files = fs.readdirSync(path.join(dir, "cursors"));
  assert.deepEqual(files.filter((f) => f.includes(".tmp-")), []);
  assert.deepEqual(readCursor(dir, "POS-42").emittedSourceIds, ["wp:1"]);
});
