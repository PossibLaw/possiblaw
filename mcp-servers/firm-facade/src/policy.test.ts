// mcp-servers/firm-facade/src/policy.test.ts
//
// Zero-network tests for loadFirmFacadePolicy (Task 3.7 — policy.ts).
// Uses OS temp files for fixture YAML; no network I/O.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadFirmFacadePolicy } from "./policy.ts";

// ---------------------------------------------------------------------------
// Helper — write a temp YAML file and return its path
// ---------------------------------------------------------------------------

function writeTempPolicy(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "firm-facade-policy-test-"));
  const filePath = path.join(dir, "gate-policy.yaml");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadFirmFacadePolicy", () => {
  it("returns {allowWorkProductText:false} for non-existent file (fail-closed)", () => {
    const result = loadFirmFacadePolicy("/nonexistent/path/gate-policy-no-such-file.yaml");
    assert.deepEqual(result, { allowWorkProductText: false });
  });

  it("returns {allowWorkProductText:false} for malformed YAML (fail-closed)", () => {
    const filePath = writeTempPolicy("this: is: : : invalid: yaml: {{{");
    const result = loadFirmFacadePolicy(filePath);
    assert.deepEqual(result, { allowWorkProductText: false });
  });

  it("returns {allowWorkProductText:false} when firmFacade section is absent", () => {
    const filePath = writeTempPolicy(`
version: 1
boundaries:
  THIRD_PARTY_EGRESS: allow
`);
    const result = loadFirmFacadePolicy(filePath);
    assert.deepEqual(result, { allowWorkProductText: false });
  });

  it("returns {allowWorkProductText:true} when firmFacade.allowWorkProductText is literal boolean true", () => {
    const filePath = writeTempPolicy(`
version: 1
firmFacade:
  allowWorkProductText: true
`);
    const result = loadFirmFacadePolicy(filePath);
    assert.deepEqual(result, { allowWorkProductText: true });
  });

  it("returns {allowWorkProductText:false} when firmFacade.allowWorkProductText is the string 'true' (non-boolean, fail-closed)", () => {
    const filePath = writeTempPolicy(`
version: 1
firmFacade:
  allowWorkProductText: "true"
`);
    const result = loadFirmFacadePolicy(filePath);
    assert.deepEqual(result, { allowWorkProductText: false });
  });

  it("returns {allowWorkProductText:false} when firmFacade.allowWorkProductText is integer 1 (non-boolean, fail-closed)", () => {
    const filePath = writeTempPolicy(`
version: 1
firmFacade:
  allowWorkProductText: 1
`);
    const result = loadFirmFacadePolicy(filePath);
    assert.deepEqual(result, { allowWorkProductText: false });
  });

  it("returns {allowWorkProductText:false} when firmFacade.allowWorkProductText is false (default closed)", () => {
    const filePath = writeTempPolicy(`
version: 1
firmFacade:
  allowWorkProductText: false
`);
    const result = loadFirmFacadePolicy(filePath);
    assert.deepEqual(result, { allowWorkProductText: false });
  });

  it("returns {allowWorkProductText:false} when no path arg and GATE_POLICY_PATH env is unset (fail-closed)", () => {
    const orig = process.env["GATE_POLICY_PATH"];
    delete process.env["GATE_POLICY_PATH"];
    try {
      const result = loadFirmFacadePolicy();
      assert.deepEqual(result, { allowWorkProductText: false });
    } finally {
      if (orig !== undefined) process.env["GATE_POLICY_PATH"] = orig;
    }
  });
});
