import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalJson,
  contentSha256,
  makeTraceRecord,
  withoutContent,
  EMPTY_CONTENT_SHA256,
} from "./record.ts";
import { closedTraceConfig, type TraceConfig } from "./config.ts";
import type { TraceInput } from "./types.ts";

const FULL: TraceConfig = {
  enabled: true,
  capture: "full",
  contentRoles: ["admin"],
  retentionDays: 90,
};
const HASHES: TraceConfig = { ...FULL, capture: "hashes-only", contentRoles: [] };

const INPUT: TraceInput = {
  agentId: "agent-1",
  agentSlug: "commercial-drafting",
  issueId: "POS-42",
  outcome: "ok",
  modelLane: "drafting",
  variant: "claude-api",
  model: "claude-opus-5",
  adapter: "claude_local",
  content: { prompt: "draft the indemnity clause", output: "1. Indemnity..." },
};

const FIXED = {
  now: () => new Date("2026-07-27T10:00:00.000Z"),
  newId: () => "trace-fixed-1",
};

// ---------------------------------------------------------------------------
// Canonical JSON + hashing
// ---------------------------------------------------------------------------

test("canonical json sorts keys and drops undefined", () => {
  assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
  assert.equal(canonicalJson([{ b: 1, a: 2 }]), '[{"a":2,"b":1}]');
});

test("content hash is order-independent", () => {
  const a = contentSha256({ prompt: "p", output: "o" });
  const b = contentSha256({ output: "o", prompt: "p" });
  assert.equal(a, b);
});

test("content hash distinguishes different content", () => {
  assert.notEqual(contentSha256({ prompt: "a" }), contentSha256({ prompt: "b" }));
});

test("absent and empty content share one stable hash", () => {
  assert.equal(contentSha256(undefined), EMPTY_CONTENT_SHA256);
  assert.equal(contentSha256({}), EMPTY_CONTENT_SHA256);
});

// ---------------------------------------------------------------------------
// Capture modes
// ---------------------------------------------------------------------------

test("full capture retains content", () => {
  const r = makeTraceRecord(INPUT, FULL, FIXED);
  assert.ok(r);
  assert.equal(r.content?.prompt, "draft the indemnity clause");
  assert.equal(r.model, "claude-opus-5");
  assert.equal(r.traceId, "trace-fixed-1");
  assert.equal(r.ts, "2026-07-27T10:00:00.000Z");
});

test("hashes-only drops content but keeps the hash of what was supplied", () => {
  const r = makeTraceRecord(INPUT, HASHES, FIXED);
  assert.ok(r);
  assert.equal(r.content, undefined);
  assert.equal(r.contentSha256, contentSha256(INPUT.content));
  assert.notEqual(r.contentSha256, EMPTY_CONTENT_SHA256);
  // The decision metadata still lands — that is the point of the mode.
  assert.equal(r.modelLane, "drafting");
  assert.equal(r.variant, "claude-api");
});

test("a closed config records nothing", () => {
  assert.equal(makeTraceRecord(INPUT, closedTraceConfig(), FIXED), null);
  assert.equal(makeTraceRecord(INPUT, { ...FULL, enabled: false }, FIXED), null);
  assert.equal(makeTraceRecord(INPUT, { ...FULL, capture: "off" }, FIXED), null);
});

test("optional fields are omitted rather than set undefined", () => {
  const r = makeTraceRecord({ agentId: "a", outcome: "ok" }, HASHES, FIXED);
  assert.ok(r);
  assert.ok(!("issueId" in r));
  assert.ok(!("model" in r));
  assert.equal(r.contentSha256, EMPTY_CONTENT_SHA256);
});

test("withoutContent preserves the hash and marks the purge when asked", () => {
  const r = makeTraceRecord(INPUT, FULL, FIXED);
  assert.ok(r);
  const stripped = withoutContent(r, "2026-10-27T00:00:00.000Z");
  assert.equal(stripped.content, undefined);
  assert.equal(stripped.contentSha256, r.contentSha256);
  assert.equal(stripped.contentPurgedAt, "2026-10-27T00:00:00.000Z");
  // Redaction (no timestamp) leaves no purge marker.
  assert.equal(withoutContent(r).contentPurgedAt, undefined);
});
