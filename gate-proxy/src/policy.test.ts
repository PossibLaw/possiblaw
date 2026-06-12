import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPolicy, decide, DEFAULT_POLICY, PolicyError } from "./policy.ts";
import type { Policy } from "./policy.ts";
import type { BoundaryType, Decision } from "./types.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeTmp(dir: string, name: string, content: string): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, "utf8");
  return p;
}

// ---------------------------------------------------------------------------
// Test 1: Defaults — each of the 6 boundaries maps to exact default decision
// ---------------------------------------------------------------------------

describe("DEFAULT_POLICY defaults", () => {
  const cases: Array<[BoundaryType, Decision]> = [
    ["THIRD_PARTY_EGRESS", "allow"],
    ["CONFIDENTIAL_TO_CLOUD", "anonymize"],
    ["COURT_FILING", "human"],
    ["SIGNATURE", "human"],
    ["MONEY_MOVEMENT", "human"],
    ["IRREVERSIBLE_EXTERNAL_OP", "human"],
  ];

  for (const [boundary, expected] of cases) {
    it(`${boundary} → "${expected}"`, () => {
      assert.equal(DEFAULT_POLICY.boundaries[boundary], expected);
    });
  }
});

// ---------------------------------------------------------------------------
// Test 2: decide(null, ...) → "allow"
// ---------------------------------------------------------------------------

describe("decide(null)", () => {
  it("returns allow when boundary is null", () => {
    const policy = loadPolicy(undefined);
    assert.equal(decide(null, policy), "allow");
  });
});

// ---------------------------------------------------------------------------
// Test 3: Missing path / undefined → defaults; mutation isolation
// ---------------------------------------------------------------------------

describe("loadPolicy with no file", () => {
  it("undefined path returns defaults", () => {
    const policy = loadPolicy(undefined);
    assert.equal(policy.version, 1);
    assert.equal(policy.boundaries.THIRD_PARTY_EGRESS, "allow");
    assert.equal(policy.boundaries.CONFIDENTIAL_TO_CLOUD, "anonymize");
  });

  it("non-existent path returns defaults", () => {
    const policy = loadPolicy("/tmp/__no_such_gate_policy_xyz__.yaml");
    assert.equal(policy.boundaries.SIGNATURE, "human");
  });

  it("mutating returned object does not corrupt next loadPolicy() call", () => {
    const p1 = loadPolicy(undefined);
    (p1.boundaries as Record<string, string>)["THIRD_PARTY_EGRESS"] = "block";
    const p2 = loadPolicy(undefined);
    assert.equal(
      p2.boundaries.THIRD_PARTY_EGRESS,
      "allow",
      "mutation of first result must not bleed into second call",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 4: Partial override — THIRD_PARTY_EGRESS → human; others keep defaults
// ---------------------------------------------------------------------------

describe("loadPolicy partial override", () => {
  let tmpDir: string;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-policy-test-"));
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("THIRD_PARTY_EGRESS promoted to human; others remain at defaults", () => {
    const filePath = writeTmp(
      tmpDir,
      "partial.yaml",
      `version: 1\nboundaries:\n  THIRD_PARTY_EGRESS: human\n`,
    );
    const policy = loadPolicy(filePath);
    assert.equal(policy.boundaries.THIRD_PARTY_EGRESS, "human");
    assert.equal(policy.boundaries.CONFIDENTIAL_TO_CLOUD, "anonymize");
    assert.equal(policy.boundaries.COURT_FILING, "human");
    assert.equal(policy.boundaries.SIGNATURE, "human");
    assert.equal(policy.boundaries.MONEY_MOVEMENT, "human");
    assert.equal(policy.boundaries.IRREVERSIBLE_EXTERNAL_OP, "human");
  });
});

// ---------------------------------------------------------------------------
// Test 5: Malformed YAML → PolicyError
// ---------------------------------------------------------------------------

describe("loadPolicy malformed YAML", () => {
  let tmpDir: string;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-policy-test-"));
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws PolicyError on unparseable YAML", () => {
    const filePath = writeTmp(tmpDir, "bad.yaml", "boundaries: [unclosed\n");
    assert.throws(
      () => loadPolicy(filePath),
      (err: unknown) => {
        assert.ok(err instanceof PolicyError, `expected PolicyError, got ${err}`);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Test 6: Unknown boundary key → PolicyError naming the bad key
// ---------------------------------------------------------------------------

describe("loadPolicy unknown boundary key", () => {
  let tmpDir: string;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-policy-test-"));
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws PolicyError naming the bad key", () => {
    const filePath = writeTmp(
      tmpDir,
      "bad-key.yaml",
      `version: 1\nboundaries:\n  TOTALLY_FAKE: allow\n`,
    );
    assert.throws(
      () => loadPolicy(filePath),
      (err: unknown) => {
        assert.ok(err instanceof PolicyError, `expected PolicyError, got ${err}`);
        assert.ok(
          (err as PolicyError).message.includes("TOTALLY_FAKE"),
          `message should name the bad key; got: ${(err as PolicyError).message}`,
        );
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Test 7: Invalid decision value → PolicyError naming the bad value
// ---------------------------------------------------------------------------

describe("loadPolicy invalid decision value", () => {
  let tmpDir: string;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-policy-test-"));
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws PolicyError naming the bad value", () => {
    const filePath = writeTmp(
      tmpDir,
      "bad-val.yaml",
      `version: 1\nboundaries:\n  COURT_FILING: shrug\n`,
    );
    assert.throws(
      () => loadPolicy(filePath),
      (err: unknown) => {
        assert.ok(err instanceof PolicyError, `expected PolicyError, got ${err}`);
        assert.ok(
          (err as PolicyError).message.includes("shrug"),
          `message should name the bad value; got: ${(err as PolicyError).message}`,
        );
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Test 8: version: 2 → PolicyError
// ---------------------------------------------------------------------------

describe("loadPolicy version mismatch", () => {
  let tmpDir: string;
  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-policy-test-"));
  });
  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws PolicyError when version is not 1", () => {
    const filePath = writeTmp(tmpDir, "v2.yaml", `version: 2\nboundaries: {}\n`);
    assert.throws(
      () => loadPolicy(filePath),
      (err: unknown) => {
        assert.ok(err instanceof PolicyError, `expected PolicyError, got ${err}`);
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Test 9: Shipped gate-policy.yaml loads cleanly and equals defaults
// ---------------------------------------------------------------------------

describe("shipped gate-policy.yaml", () => {
  it("loads and equals DEFAULT_POLICY boundaries", () => {
    const shippedPath = new URL(
      "../../../companies/legal-operations/gate-policy.yaml",
      import.meta.url,
    ).pathname;
    const policy = loadPolicy(shippedPath);
    const expected: Policy = {
      version: 1,
      boundaries: { ...DEFAULT_POLICY.boundaries },
    };
    assert.deepEqual(policy, expected);
  });
});
