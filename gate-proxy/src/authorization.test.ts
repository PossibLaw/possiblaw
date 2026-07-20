import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_GATE_AUTHORIZATION,
  GateAuthorizationError,
  loadGateAuthorization,
  resolveGateRoute,
  resolveTrustedDestination,
  isGateRequestAuthorized,
  parseGateAuthorization,
} from "./authorization.ts";

describe("gate authorization policy", () => {
  it("defaults to deny with no grants", () => {
    assert.deepEqual(DEFAULT_GATE_AUTHORIZATION, {
      version: 1,
      companyId: null,
      default: "deny",
      grants: {},
      destinations: {},
      destinationGrants: {},
    });
    assert.equal(
      isGateRequestAuthorized(DEFAULT_GATE_AUTHORIZATION, "agent-immutable-1", "egress:upload_document"),
      false,
    );
  });

  it("grants only an exact immutable agent ID and target", () => {
    const policy = parseGateAuthorization({
      version: 1,
      companyId: "company-1",
      default: "deny",
      grants: {
        "agent-immutable-1": ["egress:upload_document"],
      },
      destinations: {
        "firm-review-google": { provider: "gdrive", folderId: "folder-server-1" },
      },
      destinationGrants: {
        "agent-immutable-1": ["firm-review-google"],
      },
    });
    assert.equal(
      isGateRequestAuthorized(policy, "agent-immutable-1", "egress:upload_document"),
      true,
    );
    assert.equal(
      isGateRequestAuthorized(policy, "agent-immutable-1", "egress:send_email"),
      false,
    );
    assert.equal(
      isGateRequestAuthorized(policy, "agent-immutable-2", "egress:upload_document"),
      false,
    );
    assert.deepEqual(
      resolveTrustedDestination(policy, "agent-immutable-1", "firm-review-google"),
      { provider: "gdrive", folderId: "folder-server-1" },
    );
    assert.equal(resolveTrustedDestination(policy, "agent-immutable-2", "firm-review-google"), null);
  });

  it("rejects unsafe IDs, unknown targets, duplicates, wildcards, and allow defaults", () => {
    for (const raw of [
      { version: 1, companyId: "company-1", default: "allow", grants: {}, destinations: {}, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: { "../agent": ["egress:upload_document"] }, destinations: {}, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: { "agent-1": ["egress:*"] }, destinations: {}, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: { "agent-1": ["egress:upload_document", "egress:upload_document"] }, destinations: {}, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: { "agent-1": "egress:upload_document" }, destinations: {}, destinationGrants: {} },
      { version: 1, default: "deny", grants: {}, destinations: {}, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: {}, destinations: { "../root": { provider: "gdrive", folderId: "x" } }, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: {}, destinations: { root: { provider: "gdrive", folderId: "a/b" } }, destinationGrants: {} },
      { version: 1, companyId: "company-1", default: "deny", grants: {}, destinations: {}, destinationGrants: { "agent-1": ["missing"] } },
    ]) {
      assert.throws(() => parseGateAuthorization(raw), GateAuthorizationError);
    }
    assert.throws(
      () => parseGateAuthorization(Object.assign(Object.create({ inherited: true }), {
        version: 1,
        companyId: "company-1",
        default: "deny",
        grants: {},
        destinations: {},
        destinationGrants: {},
      })),
      GateAuthorizationError,
    );
  });
});

describe("gate authorization target routing", () => {
  const cases: Array<[string, string, unknown]> = [
    ["GET", "/health", { kind: "public" }],
    ["GET", "/ready", { kind: "public" }],
    ["GET", "/health?probe=1", { kind: "unmapped" }],
    ["GET", "/receipts/verify", { kind: "protected", target: "receipts:verify" }],
    ["GET", "/receipts/bundle?issueId=POS-1", { kind: "protected", target: "receipts:bundle" }],
    ["POST", "/receipts/anchor", { kind: "protected", target: "receipts:anchor" }],
    ["POST", "/quality/citation", { kind: "protected", target: "quality:citation" }],
    ["POST", "/quality/authority", { kind: "protected", target: "quality:authority" }],
    ["POST", "/receipts/facade", { kind: "protected", target: "receipts:facade" }],
    ["POST", "/receipts/deadline", { kind: "protected", target: "receipts:deadline" }],
    ["POST", "/matters/classification", { kind: "protected", target: "matters:classification:write" }],
    ["GET", "/matters/classification?issueId=POS-1", { kind: "protected", target: "matters:classification:read" }],
    ["POST", "/egress/upload_document", { kind: "protected", target: "egress:upload_document" }],
    ["POST", "/egress/send_email?retry=1", { kind: "protected", target: "egress:send_email" }],
    ["POST", "/egress/%ZZ", { kind: "invalid", error: "invalid_tool" }],
    ["GET", "/not-a-route", { kind: "unmapped" }],
  ];

  for (const [method, url, expected] of cases) {
    it(`${method} ${url} maps to ${String(expected)}`, () => {
      assert.deepEqual(resolveGateRoute(method, url), expected);
    });
  }
});

it("loads a company-bound runtime map and rejects a company mismatch", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-authorization-load-"));
  const file = path.join(dir, "authorization.json");
  fs.writeFileSync(file, JSON.stringify({
    version: 1,
    companyId: "company-1",
    default: "deny",
    grants: { "agent-1": ["quality:citation"] },
    destinations: {},
    destinationGrants: {},
  }));
  try {
    assert.equal(loadGateAuthorization(file, "company-1").companyId, "company-1");
    assert.throws(() => loadGateAuthorization(file, "company-2"), GateAuthorizationError);
    assert.throws(() => loadGateAuthorization(undefined, "company-1"), GateAuthorizationError);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
