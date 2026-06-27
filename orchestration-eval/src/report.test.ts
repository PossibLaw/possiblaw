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
