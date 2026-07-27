import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTraceConfig, closedTraceConfig, DEFAULT_RETENTION_DAYS } from "./config.ts";

function withPolicy(body: string, fn: (p: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "trace-cfg-"));
  const file = path.join(dir, "gate-policy.yaml");
  fs.writeFileSync(file, body, "utf8");
  try {
    fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function assertClosed(cfg: ReturnType<typeof loadTraceConfig>, label: string): void {
  assert.equal(cfg.enabled, false, `${label}: enabled`);
  assert.equal(cfg.capture, "off", `${label}: capture`);
  assert.deepEqual([...cfg.contentRoles], [], `${label}: contentRoles`);
}

// ---------------------------------------------------------------------------
// Open paths
// ---------------------------------------------------------------------------

test("opens on a well-formed full-capture section", () => {
  withPolicy(
    `version: 1
trace:
  enabled: true
  capture: full
  contentRoles: [admin, supervising-lawyer]
  retentionDays: 30
`,
    (p) => {
      const cfg = loadTraceConfig(p);
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.capture, "full");
      assert.deepEqual([...cfg.contentRoles], ["admin", "supervising-lawyer"]);
      assert.equal(cfg.retentionDays, 30);
    },
  );
});

test("hashes-only opens without any contentRoles", () => {
  withPolicy(
    `trace:
  enabled: true
  capture: hashes-only
`,
    (p) => {
      const cfg = loadTraceConfig(p);
      assert.equal(cfg.enabled, true);
      assert.equal(cfg.capture, "hashes-only");
      assert.deepEqual([...cfg.contentRoles], []);
      assert.equal(cfg.retentionDays, DEFAULT_RETENTION_DAYS);
    },
  );
});

test("duplicate roles are de-duplicated", () => {
  withPolicy(
    `trace:
  enabled: true
  capture: full
  contentRoles: [admin, admin, auditor]
`,
    (p) => {
      assert.deepEqual([...loadTraceConfig(p).contentRoles], ["admin", "auditor"]);
    },
  );
});

// ---------------------------------------------------------------------------
// Fail-closed paths
// ---------------------------------------------------------------------------

test("missing path and missing file are closed", () => {
  assertClosed(loadTraceConfig(""), "empty path");
  assertClosed(loadTraceConfig("/nonexistent/gate-policy.yaml"), "missing file");
});

test("unparseable yaml is closed", () => {
  withPolicy("trace: [oops\n  bad: :", (p) => assertClosed(loadTraceConfig(p), "bad yaml"));
});

test("missing trace section is closed", () => {
  withPolicy("version: 1\nboundaries:\n  SIGNATURE: human\n", (p) =>
    assertClosed(loadTraceConfig(p), "no section"),
  );
});

test("enabled must be the literal boolean true", () => {
  for (const v of ['"true"', "1", "yes", "null"]) {
    withPolicy(`trace:\n  enabled: ${v}\n  capture: full\n  contentRoles: [admin]\n`, (p) =>
      assertClosed(loadTraceConfig(p), `enabled: ${v}`),
    );
  }
});

test("capture off, absent, or unrecognised is closed", () => {
  for (const v of ["off", "FULL", "everything", '"full "']) {
    withPolicy(`trace:\n  enabled: true\n  capture: ${v}\n  contentRoles: [admin]\n`, (p) =>
      assertClosed(loadTraceConfig(p), `capture: ${v}`),
    );
  }
  withPolicy("trace:\n  enabled: true\n  contentRoles: [admin]\n", (p) =>
    assertClosed(loadTraceConfig(p), "capture absent"),
  );
});

test("an unrecognised role closes rather than narrowing silently", () => {
  withPolicy(
    `trace:
  enabled: true
  capture: full
  contentRoles: [admin, paralegal]
`,
    (p) => assertClosed(loadTraceConfig(p), "unknown role"),
  );
});

test("full capture with no readers is closed", () => {
  withPolicy("trace:\n  enabled: true\n  capture: full\n  contentRoles: []\n", (p) =>
    assertClosed(loadTraceConfig(p), "full, no roles"),
  );
  withPolicy("trace:\n  enabled: true\n  capture: full\n", (p) =>
    assertClosed(loadTraceConfig(p), "full, roles absent"),
  );
});

test("non-positive or non-integer retentionDays is closed", () => {
  for (const v of ["0", "-5", "30.5", '"30"']) {
    withPolicy(
      `trace:\n  enabled: true\n  capture: hashes-only\n  retentionDays: ${v}\n`,
      (p) => assertClosed(loadTraceConfig(p), `retentionDays: ${v}`),
    );
  }
});

test("an unknown key closes rather than taking a default", () => {
  withPolicy(
    `trace:
  enabled: true
  capture: hashes-only
  retentionDayz: 30
`,
    (p) => assertClosed(loadTraceConfig(p), "typo'd key"),
  );
});

test("closedTraceConfig is the closed sentinel", () => {
  assertClosed(closedTraceConfig(), "sentinel");
});
