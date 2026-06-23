// eval-harness/src/benchmarks.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBenchmark, knownBenchmarks } from "./benchmarks.ts";

// src/ → eval-harness/ → repo root
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("knownBenchmarks includes cuad", () => {
  assert.ok(knownBenchmarks().includes("cuad"));
});

test("loadBenchmark('cuad') returns benchmark-sourced cases from the real fixtures", () => {
  const cases = loadBenchmark("cuad", REPO_ROOT);
  assert.ok(cases.length > 0);
  assert.equal(cases[0].source.kind, "benchmark");
  assert.equal(cases[0].source.name, "cuad");
  assert.equal(cases[0].grading.mode, "deterministic");
});

test("loadBenchmark throws a clear error on an unknown benchmark", () => {
  assert.throws(() => loadBenchmark("bogus", REPO_ROOT), /Unknown benchmark: bogus/);
});
