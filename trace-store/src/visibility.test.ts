import { test } from "node:test";
import assert from "node:assert/strict";
import { canViewContent, redactForRole, redactManyForRole } from "./visibility.ts";
import { closedTraceConfig, type TraceConfig } from "./config.ts";
import { makeTraceRecord } from "./record.ts";
import type { TraceInput, TraceRecord } from "./types.ts";

const FULL: TraceConfig = {
  enabled: true,
  capture: "full",
  contentRoles: ["admin", "supervising-lawyer"],
  retentionDays: 90,
};

const INPUT: TraceInput = {
  agentId: "agent-1",
  issueId: "POS-42",
  outcome: "ok",
  content: { prompt: "privileged instruction", output: "privileged draft" },
};

function record(config: TraceConfig = FULL): TraceRecord {
  const r = makeTraceRecord(INPUT, config, {
    now: () => new Date("2026-07-27T10:00:00.000Z"),
    newId: () => "trace-1",
  });
  assert.ok(r);
  return r;
}

// ---------------------------------------------------------------------------
// canViewContent
// ---------------------------------------------------------------------------

test("listed roles may view; unlisted recognised roles may not", () => {
  assert.equal(canViewContent("admin", FULL), true);
  assert.equal(canViewContent("supervising-lawyer", FULL), true);
  assert.equal(canViewContent("auditor", FULL), false);
  assert.equal(canViewContent("agent", FULL), false);
});

test("unrecognised, empty, and missing roles are denied", () => {
  for (const role of ["paralegal", "", "ADMIN", "admin ", null, undefined]) {
    assert.equal(canViewContent(role as string | null | undefined, FULL), false, `role: ${role}`);
  }
});

test("a closed or hashes-only config denies every role", () => {
  assert.equal(canViewContent("admin", closedTraceConfig()), false);
  assert.equal(canViewContent("admin", { ...FULL, enabled: false }), false);
  assert.equal(canViewContent("admin", { ...FULL, capture: "hashes-only" }), false);
});

// ---------------------------------------------------------------------------
// redactForRole
// ---------------------------------------------------------------------------

test("an entitled role receives the content", () => {
  const out = redactForRole(record(), "admin", FULL);
  assert.equal(out.content?.prompt, "privileged instruction");
});

test("an unentitled role receives the record without content", () => {
  const r = record();
  const out = redactForRole(r, "auditor", FULL);
  assert.equal(out.content, undefined);
  // Everything non-privileged survives — this is still a useful audit row.
  assert.equal(out.contentSha256, r.contentSha256);
  assert.equal(out.agentId, "agent-1");
  assert.equal(out.issueId, "POS-42");
});

test("redaction does not mark the record purged", () => {
  assert.equal(redactForRole(record(), "auditor", FULL).contentPurgedAt, undefined);
});

test("redaction does not mutate the stored record", () => {
  const r = record();
  redactForRole(r, "auditor", FULL);
  assert.equal(r.content?.prompt, "privileged instruction");
});

test("redactMany applies the same decision across the batch", () => {
  const rs = [record(), record()];
  assert.equal(redactManyForRole(rs, "admin", FULL).every((r) => r.content !== undefined), true);
  assert.equal(redactManyForRole(rs, "agent", FULL).every((r) => r.content === undefined), true);
});
