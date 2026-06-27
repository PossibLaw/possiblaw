import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, renderReport } from "./report.ts";

test("aggregate computes all-pass rate + mean cost per (task,arm,config) cell", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: false, costCents: 100 },
    { task: "t1", arm: "A", config: "sota", allPass: true, costCents: 200 },
    { task: "t1", arm: "B", config: "sota", allPass: true, costCents: 300 },
    { task: "t1", arm: "B", config: "sota", allPass: true, costCents: 500 },
  ]);
  const a = cells.find(c => c.arm === "A")!;
  const b = cells.find(c => c.arm === "B")!;
  assert.equal(a.allPassRate, 0.5);
  assert.equal(a.meanCostCents, 150);
  assert.equal(b.allPassRate, 1.0);
  assert.equal(b.meanCostCents, 400);
});

test("renderReport surfaces the A-vs-B delta and the skipped list", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: false },
    { task: "t1", arm: "B", config: "sota", allPass: true },
  ]);
  const md = renderReport(cells, { runsPerCell: 1, skipped: [{ task: "t9", reason: "multi-step sandbox" }] });
  assert.match(md, /Arm A/);
  assert.match(md, /Arm B/);
  assert.match(md, /SKIPPED/i);
  assert.match(md, /t9/);
});

test("I2: renderReport header includes skipped count", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: true },
    { task: "t1", arm: "B", config: "sota", allPass: true },
  ]);
  const md = renderReport(cells, {
    runsPerCell: 3,
    skipped: [{ task: "t9", reason: "excluded" }, { task: "t10", reason: "errored" }],
  });
  assert.match(md, /2 task\(s\) skipped\/dropped/, "header should show skipped count");
});

test("I2: renderReport shows per-cell passed/total fraction", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: false },
    { task: "t1", arm: "A", config: "sota", allPass: true },
    { task: "t1", arm: "B", config: "sota", allPass: true },
    { task: "t1", arm: "B", config: "sota", allPass: true },
  ]);
  const md = renderReport(cells, { runsPerCell: 2, skipped: [] });
  // Arm A: 1/2 pass. Arm B: 2/2 pass. Both should show (passed/total).
  assert.match(md, /\(1\/2\)/, "should show Arm A 1/2 fraction");
  assert.match(md, /\(2\/2\)/, "should show Arm B 2/2 fraction");
});

test("I3: renderReport emits Arm A decomposition warning when armADecomposed is provided", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: true },
    { task: "t1", arm: "B", config: "sota", allPass: true },
  ]);
  const md = renderReport(cells, {
    runsPerCell: 1,
    skipped: [],
    armADecomposed: [{ task: "t1", childCount: 3 }],
  });
  assert.match(md, /Arm A Decomposition/i, "should include decomposition warning section");
  assert.match(md, /t1/, "should name the offending task");
  assert.match(md, /3 child issue/, "should state the child count");
  assert.match(md, /monolithic assumption/, "should reference the monolithic assumption");
});

test("I3: renderReport omits decomposition section when armADecomposed is empty or absent", () => {
  const cells = aggregate([
    { task: "t1", arm: "A", config: "sota", allPass: true },
  ]);
  const md = renderReport(cells, { runsPerCell: 1, skipped: [] });
  assert.doesNotMatch(md, /Arm A Decomposition/i, "should not show decomposition section when none occurred");
});
