// gate-proxy/src/matter-classification.test.ts
// Unit tests for the receipt-derived per-matter confidentiality classification
// registry (raise-only floor) and the pure effective-confidentiality resolver.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReceiptChain, ReceiptChainCorruptError } from "./receipts.ts";
import {
  MatterClassificationRegistry,
  resolveEffectiveConfidentiality,
  isConfidentiality,
} from "./matter-classification.ts";

function tmpChain(): ReceiptChain {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-matter-class-test-"));
  return new ReceiptChain(path.join(dir, "r.jsonl"));
}

// ---------------------------------------------------------------------------
// isConfidentiality
// ---------------------------------------------------------------------------

describe("isConfidentiality", () => {
  it("accepts exactly the three tiers", () => {
    assert.equal(isConfidentiality("standard"), true);
    assert.equal(isConfidentiality("confidential"), true);
    assert.equal(isConfidentiality("privileged"), true);
  });

  it("rejects everything else (fail-closed)", () => {
    assert.equal(isConfidentiality(undefined), false);
    assert.equal(isConfidentiality(null), false);
    assert.equal(isConfidentiality(""), false);
    assert.equal(isConfidentiality("PRIVILEGED"), false);
    assert.equal(isConfidentiality("bogus"), false);
    assert.equal(isConfidentiality(2), false);
    assert.equal(isConfidentiality({}), false);
  });
});

// ---------------------------------------------------------------------------
// MatterClassificationRegistry
// ---------------------------------------------------------------------------

describe("MatterClassificationRegistry", () => {
  it("register + get: registered tier is readable", () => {
    const receipts = tmpChain();
    const reg = new MatterClassificationRegistry(receipts);
    const result = reg.register({ issueId: "POS-1", tier: "privileged" });
    assert.equal(result.ok, true);
    assert.equal(result.effectiveTier, "privileged");
    assert.equal(reg.get("POS-1"), "privileged");
    assert.equal(reg.get("POS-2"), undefined, "unregistered matter has no floor");
  });

  it("appends a performed quality receipt with ids/enums/hashes only", () => {
    const receipts = tmpChain();
    const reg = new MatterClassificationRegistry(receipts);
    reg.register({ issueId: "POS-1", tier: "confidential" });

    const entries = receipts.entries();
    assert.equal(entries.length, 1);
    const body = entries[0].body;
    assert.equal(body.kind, "quality");
    assert.equal(body.tool, "matter_classification");
    assert.equal(body.outcome, "performed");
    assert.equal(body.boundary, null);
    assert.equal(body.decision, null);
    assert.equal(body.issueId, "POS-1");
    assert.match(body.payloadSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(body.meta, { tier: "confidential", effectiveTier: "confidential" });
  });

  it("raise-only: a later lower registration does NOT lower the floor (downgrade attempt is receipted)", () => {
    const receipts = tmpChain();
    const reg = new MatterClassificationRegistry(receipts);
    reg.register({ issueId: "POS-1", tier: "privileged" });
    const second = reg.register({ issueId: "POS-1", tier: "standard" });

    assert.equal(second.effectiveTier, "privileged", "floor must not lower");
    assert.equal(reg.get("POS-1"), "privileged");

    // The downgrade attempt is still receipted (audit trail), with honest meta.
    const entries = receipts.entries();
    assert.equal(entries.length, 2);
    assert.deepEqual(entries[1].body.meta, { tier: "standard", effectiveTier: "privileged" });
  });

  it("raise-only: a later higher registration raises the floor", () => {
    const receipts = tmpChain();
    const reg = new MatterClassificationRegistry(receipts);
    reg.register({ issueId: "POS-1", tier: "standard" });
    const second = reg.register({ issueId: "POS-1", tier: "confidential" });
    assert.equal(second.effectiveTier, "confidential");
    assert.equal(reg.get("POS-1"), "confidential");
  });

  it("state derives from the receipt chain: a fresh registry over the same chain sees identical floors", () => {
    const receipts = tmpChain();
    const reg = new MatterClassificationRegistry(receipts);
    reg.register({ issueId: "POS-1", tier: "privileged" });
    reg.register({ issueId: "POS-1", tier: "standard" }); // downgrade attempt
    reg.register({ issueId: "POS-2", tier: "confidential" });

    const rebuilt = new MatterClassificationRegistry(receipts);
    assert.equal(rebuilt.get("POS-1"), "privileged", "raise-only merge must survive rebuild");
    assert.equal(rebuilt.get("POS-2"), "confidential");
    assert.equal(rebuilt.get("POS-3"), undefined);
  });

  it("rebuild ignores receipts with invalid tier or missing issueId (fail-closed)", () => {
    const receipts = tmpChain();
    // Handcraft receipts that a registry rebuild must ignore.
    receipts.append({
      kind: "quality",
      tool: "matter_classification",
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: "a".repeat(64),
      issueId: "POS-1",
      meta: { tier: "bogus_tier" },
    });
    receipts.append({
      kind: "quality",
      tool: "matter_classification",
      boundary: null,
      decision: null,
      outcome: "blocked", // not performed → ignored
      payloadSha256: "a".repeat(64),
      issueId: "POS-2",
      meta: { tier: "privileged" },
    });
    receipts.append({
      kind: "quality",
      tool: "citation_verification", // different tool → ignored
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: "a".repeat(64),
      issueId: "POS-3",
      meta: { tier: "privileged" },
    });
    const reg = new MatterClassificationRegistry(receipts);
    assert.equal(reg.get("POS-1"), undefined);
    assert.equal(reg.get("POS-2"), undefined);
    assert.equal(reg.get("POS-3"), undefined);
  });

  it("register rejects an invalid issueId or tier without appending a receipt", () => {
    const receipts = tmpChain();
    const reg = new MatterClassificationRegistry(receipts);
    assert.throws(() => reg.register({ issueId: "../etc", tier: "standard" }));
    assert.throws(() =>
      reg.register({ issueId: "POS-1", tier: "bogus" as unknown as "standard" }),
    );
    assert.equal(receipts.entries().length, 0, "no receipt on rejected registration");
  });

  it("fail-closed on a corrupt chain: get() returns undefined, register() throws", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-matter-class-test-"));
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    receipts.append({
      kind: "quality",
      tool: "matter_classification",
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: "a".repeat(64),
      issueId: "POS-1",
      meta: { tier: "privileged" },
    });
    // Corrupt the chain mid-file.
    fs.appendFileSync(filePath, "NOT_JSON\n", "utf8");

    const reg = new MatterClassificationRegistry(receipts);
    assert.equal(reg.get("POS-1"), undefined, "nothing registered over a corrupt chain");
    assert.throws(
      () => reg.register({ issueId: "POS-2", tier: "standard" }),
      ReceiptChainCorruptError,
    );
  });
});

// ---------------------------------------------------------------------------
// resolveEffectiveConfidentiality
// ---------------------------------------------------------------------------

describe("resolveEffectiveConfidentiality", () => {
  it("happy: registered privileged floor + claimed standard → effective privileged, floorApplied", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "privileged",
      unspecifiedDefault: null,
    });
    assert.deepEqual(r, { effective: "privileged", floorApplied: true, defaultApplied: false });
  });

  it("edge: claimed privileged on a standard-registered matter → raise allowed, no floor marker", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "privileged",
      registeredFloor: "standard",
      unspecifiedDefault: null,
    });
    assert.deepEqual(r, { effective: "privileged", floorApplied: false, defaultApplied: false });
  });

  it("claimed equals the floor → no floor marker", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "confidential",
      registeredFloor: "confidential",
      unspecifiedDefault: null,
    });
    assert.deepEqual(r, { effective: "confidential", floorApplied: false, defaultApplied: false });
  });

  it("claimed absent + registered floor → floor fills it in (floorApplied)", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: undefined,
      registeredFloor: "standard",
      unspecifiedDefault: "confidential",
    });
    assert.deepEqual(r, { effective: "standard", floorApplied: true, defaultApplied: false });
  });

  it("no floor + valid claimed → claimed wins, default not applied", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: undefined,
      unspecifiedDefault: "confidential",
    });
    assert.deepEqual(r, { effective: "standard", floorApplied: false, defaultApplied: false });
  });

  it("failure/security: no floor + no claimed + default confidential → fail-closed confidential", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: undefined,
      registeredFloor: undefined,
      unspecifiedDefault: "confidential",
    });
    assert.deepEqual(r, { effective: "confidential", floorApplied: false, defaultApplied: true });
  });

  it("failure/security: an unrecognized claimed value counts as unspecified (fail-closed)", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "totally-not-a-tier",
      registeredFloor: undefined,
      unspecifiedDefault: "confidential",
    });
    assert.deepEqual(r, { effective: "confidential", floorApplied: false, defaultApplied: true });
  });

  it("back-compat: no floor + no claimed + no default → effective undefined (legacy behavior)", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: undefined,
      registeredFloor: undefined,
      unspecifiedDefault: null,
    });
    assert.deepEqual(r, { effective: undefined, floorApplied: false, defaultApplied: false });
  });
});
