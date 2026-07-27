// trace-store/src/evals.test.ts
//
// The three eval cases declared in .agent/PLAN.md, end to end over the public
// surface. These are the acceptance criteria for M1, written as the plan words
// them — happy path, retention edge, and the fail-closed security case.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendTrace,
  canViewContent,
  contentSha256,
  loadTraceConfig,
  makeTraceRecord,
  purgeExpiredContent,
  readTraces,
  redactForRole,
  type TraceInput,
} from "./index.ts";

function tmpdir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trace-eval-"));
}

function policy(body: string): string {
  const dir = tmpdir();
  const file = path.join(dir, "gate-policy.yaml");
  fs.writeFileSync(file, body, "utf8");
  return file;
}

const DRAFTING_STEP: TraceInput = {
  agentId: "agent-commercial-drafting",
  agentSlug: "commercial-drafting",
  issueId: "POS-42",
  companyId: "co-1",
  step: 3,
  outcome: "ok",
  modelLane: "drafting",
  variant: "claude-api",
  model: "claude-opus-5",
  adapter: "claude_local",
  contextRefs: [
    { kind: "skill", ref: "commercial-drafting-indemnity" },
    { kind: "document", ref: "doc-77", sha256: "a".repeat(64) },
    { kind: "connector", ref: "gdrive" },
  ],
  costCents: 12,
  durationMs: 4310,
  content: {
    systemPrompt: "You are drafting for a commercial matter.",
    prompt: "Draft the indemnity clause for the Acme SPA.",
    output: "1. Indemnity. Seller shall indemnify...",
  },
};

// ---------------------------------------------------------------------------
// HAPPY PATH
//
// Given an admin has enabled trace capture with content capture on, when an
// agent runs a drafting step, then the trace store holds one record carrying
// the prompt, the resolved model, the context refs and the output — and a
// receipt can bind to it by hash.
// ---------------------------------------------------------------------------

test("eval/happy: an enabled full capture records the whole decision", () => {
  const config = loadTraceConfig(
    policy(`version: 1
trace:
  enabled: true
  capture: full
  contentRoles: [admin, supervising-lawyer]
  retentionDays: 90
`),
  );
  assert.equal(config.enabled, true);

  const dir = tmpdir();
  const record = makeTraceRecord(DRAFTING_STEP, config, {
    now: () => new Date("2026-07-27T10:00:00.000Z"),
    newId: () => "trace-happy",
  });
  appendTrace(dir, record);

  const [stored] = readTraces(dir, "POS-42");
  assert.ok(stored);

  // Which model, and why that lane.
  assert.equal(stored.model, "claude-opus-5");
  assert.equal(stored.modelLane, "drafting");
  assert.equal(stored.variant, "claude-api");
  assert.equal(stored.adapter, "claude_local");
  // When.
  assert.equal(stored.ts, "2026-07-27T10:00:00.000Z");
  // What went in, and what came out.
  assert.equal(stored.content?.prompt, "Draft the indemnity clause for the Acme SPA.");
  assert.equal(stored.content?.systemPrompt, "You are drafting for a commercial matter.");
  assert.ok(stored.content?.output?.startsWith("1. Indemnity."));
  // What context and which connector was pulled.
  assert.deepEqual(stored.contextRefs?.map((c) => c.kind), ["skill", "document", "connector"]);
  assert.equal(stored.contextRefs?.[2]?.ref, "gdrive");
  // What it cost and how long it took.
  assert.equal(stored.costCents, 12);
  assert.equal(stored.durationMs, 4310);

  // The binding a receipt would carry — traceId plus a hash of the content,
  // computable by anyone holding the content and by nobody who is not.
  assert.equal(stored.traceId, "trace-happy");
  assert.equal(stored.contentSha256, contentSha256(DRAFTING_STEP.content));
});

// ---------------------------------------------------------------------------
// EDGE CASE
//
// Given a trace record whose content has passed the retention window, when the
// purge runs, then the content is removed but the record, its contentSha256,
// and the receipt binding all survive and still verify.
// ---------------------------------------------------------------------------

test("eval/edge: a retention purge drops content without breaking attestation", () => {
  const config = loadTraceConfig(
    policy(`trace:
  enabled: true
  capture: full
  contentRoles: [admin]
  retentionDays: 30
`),
  );

  const dir = tmpdir();
  const record = makeTraceRecord(DRAFTING_STEP, config, {
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    newId: () => "trace-edge",
  });
  appendTrace(dir, record);

  // A receipt written at the time would have captured these two values.
  const boundTraceId = record?.traceId;
  const boundSha = record?.contentSha256;

  const res = purgeExpiredContent(dir, "POS-42", config, {
    now: () => new Date("2026-07-27T00:00:00.000Z"),
  });
  assert.deepEqual(res, { purged: 1, scanned: 1 });

  const [after] = readTraces(dir, "POS-42");
  assert.ok(after);
  assert.equal(after.content, undefined, "privileged text is gone");
  assert.ok(after.contentPurgedAt, "the purge is itself on the record");

  // The receipt binding still resolves and still matches.
  assert.equal(after.traceId, boundTraceId);
  assert.equal(after.contentSha256, boundSha);
  // And the non-privileged audit row is fully intact.
  assert.equal(after.model, "claude-opus-5");
  assert.equal(after.agentSlug, "commercial-drafting");
  assert.equal(after.contextRefs?.length, 3);
});

// ---------------------------------------------------------------------------
// FAILURE / SECURITY CASE
//
// Given trace capture is not configured, or is configured with an unrecognised
// value, or a caller presents a role not on the visibility list, then no
// content is captured and no content is returned — in every one of those
// cases, without an error path that leaks it.
// ---------------------------------------------------------------------------

test("eval/security: an unconfigured or malformed policy captures nothing", () => {
  const closedPolicies = [
    "version: 1\n", // no trace section
    "trace:\n  enabled: false\n  capture: full\n  contentRoles: [admin]\n",
    'trace:\n  enabled: "true"\n  capture: full\n  contentRoles: [admin]\n', // string, not boolean
    "trace:\n  enabled: true\n  capture: everything\n  contentRoles: [admin]\n", // bad mode
    "trace:\n  enabled: true\n  capture: full\n  contentRoles: [paralegal]\n", // unknown role
    "trace:\n  enabled: true\n  capture: full\n  contentRoles: []\n", // nobody could read it
    "trace:\n  enabled: true\n  capture: hashes-only\n  retentionDays: -1\n", // bad window
  ];

  for (const body of closedPolicies) {
    const config = loadTraceConfig(policy(body));
    assert.equal(config.enabled, false, `policy should be closed:\n${body}`);

    const dir = tmpdir();
    appendTrace(dir, makeTraceRecord(DRAFTING_STEP, config, { newId: () => "x" }));
    assert.deepEqual(readTraces(dir, "POS-42"), [], `nothing recorded for:\n${body}`);
    assert.equal(canViewContent("admin", config), false, `no reader for:\n${body}`);
  }
});

test("eval/security: hashes-only proves the prompt without storing it", () => {
  const config = loadTraceConfig(
    policy("trace:\n  enabled: true\n  capture: hashes-only\n"),
  );
  const dir = tmpdir();
  appendTrace(
    dir,
    makeTraceRecord(DRAFTING_STEP, config, {
      now: () => new Date("2026-07-27T10:00:00.000Z"),
      newId: () => "trace-hashed",
    }),
  );

  const [stored] = readTraces(dir, "POS-42");
  assert.ok(stored);
  assert.equal(stored.content, undefined, "no prompt text on disk");
  // The hash still identifies exactly which prompt ran.
  assert.equal(stored.contentSha256, contentSha256(DRAFTING_STEP.content));
  assert.equal(stored.model, "claude-opus-5");
  // No role can read content that was never captured.
  assert.equal(canViewContent("admin", config), false);
});

test("eval/security: an unentitled role never receives content", () => {
  const config = loadTraceConfig(
    policy(`trace:
  enabled: true
  capture: full
  contentRoles: [admin]
`),
  );
  const record = makeTraceRecord(DRAFTING_STEP, config, { newId: () => "trace-role" });
  assert.ok(record);

  // Entitled.
  assert.ok(redactForRole(record, "admin", config).content);

  // Everyone else — recognised-but-unlisted, unknown, malformed, absent.
  for (const role of ["supervising-lawyer", "auditor", "agent", "paralegal", "Admin", "", null, undefined]) {
    const out = redactForRole(record, role as string | null | undefined, config);
    assert.equal(out.content, undefined, `role must not see content: ${String(role)}`);
    // Denial is not an error path — the audit row still comes back.
    assert.equal(out.contentSha256, record.contentSha256);
    assert.equal(out.model, "claude-opus-5");
  }
});
