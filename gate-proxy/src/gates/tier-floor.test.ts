import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateTierFloor } from "./tier-floor.ts";
import type { TierFloorInput, TierFloorResult } from "./tier-floor.ts";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function input(overrides: Partial<TierFloorInput>): TierFloorInput {
  return {
    confidentiality: "standard",
    targetTier: "cloud",
    localAvailable: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rule 1: standard confidentiality → allow, useLocal: false (regardless of tier/local)
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — standard", () => {
  it("standard + cloud + no local → allow useLocal:false", () => {
    const result = evaluateTierFloor(input({ confidentiality: "standard", targetTier: "cloud", localAvailable: false }));
    assert.deepEqual(result, { action: "allow", useLocal: false } satisfies TierFloorResult);
  });

  it("standard + local + no local → allow useLocal:false", () => {
    const result = evaluateTierFloor(input({ confidentiality: "standard", targetTier: "local", localAvailable: false }));
    assert.deepEqual(result, { action: "allow", useLocal: false } satisfies TierFloorResult);
  });

  it("standard + cloud + localAvailable → allow useLocal:false", () => {
    const result = evaluateTierFloor(input({ confidentiality: "standard", targetTier: "cloud", localAvailable: true }));
    assert.deepEqual(result, { action: "allow", useLocal: false } satisfies TierFloorResult);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: confidential/privileged + targetTier=local → allow, useLocal: true
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — sensitive + local tier", () => {
  it("confidential + local tier → allow useLocal:true", () => {
    const result = evaluateTierFloor(input({ confidentiality: "confidential", targetTier: "local", localAvailable: false }));
    assert.deepEqual(result, { action: "allow", useLocal: true } satisfies TierFloorResult);
  });

  it("privileged + local tier → allow useLocal:true", () => {
    const result = evaluateTierFloor(input({ confidentiality: "privileged", targetTier: "local", localAvailable: false }));
    assert.deepEqual(result, { action: "allow", useLocal: true } satisfies TierFloorResult);
  });
});

// ---------------------------------------------------------------------------
// Rule 3: confidential/privileged + cloud + localAvailable → allow, useLocal: true (prefer local)
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — sensitive + cloud + local available", () => {
  it("confidential + cloud + localAvailable → allow useLocal:true", () => {
    const result = evaluateTierFloor(input({ confidentiality: "confidential", targetTier: "cloud", localAvailable: true }));
    assert.deepEqual(result, { action: "allow", useLocal: true } satisfies TierFloorResult);
  });

  it("privileged + cloud + localAvailable → allow useLocal:true", () => {
    const result = evaluateTierFloor(input({ confidentiality: "privileged", targetTier: "cloud", localAvailable: true }));
    assert.deepEqual(result, { action: "allow", useLocal: true } satisfies TierFloorResult);
  });
});

// ---------------------------------------------------------------------------
// Rule 4: confidential/privileged + cloud + no local → anonymize
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — sensitive + cloud + no local → anonymize", () => {
  it("confidential + cloud + no local → anonymize", () => {
    const result = evaluateTierFloor(input({ confidentiality: "confidential", targetTier: "cloud", localAvailable: false }));
    assert.deepEqual(result, { action: "anonymize" } satisfies TierFloorResult);
  });

  it("privileged + cloud + no local → anonymize", () => {
    const result = evaluateTierFloor(input({ confidentiality: "privileged", targetTier: "cloud", localAvailable: false }));
    assert.deepEqual(result, { action: "anonymize" } satisfies TierFloorResult);
  });
});

// ---------------------------------------------------------------------------
// Rule 5: undefined or garbage confidentiality → block (fail-closed)
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — undefined / garbage → block", () => {
  it("undefined confidentiality → block with reason", () => {
    const result = evaluateTierFloor(input({ confidentiality: undefined }));
    assert.equal(result.action, "block");
    assert.ok("reason" in result, "result should have a reason field");
  });

  it("garbage string 'super-secret' → block with reason naming the value", () => {
    // Cast to bypass TypeScript so we simulate a runtime HTTP caller sending unknown values.
    const result = evaluateTierFloor(input({ confidentiality: "super-secret" as never }));
    assert.equal(result.action, "block");
    assert.ok("reason" in result, "result should have a reason field");
    assert.ok(
      (result as Extract<TierFloorResult, { action: "block" }>).reason.includes("super-secret"),
      `reason should name the bad value; got: ${(result as Extract<TierFloorResult, { action: "block" }>).reason}`,
    );
  });

  it("garbage string 'CLASSIFIED' → block with reason", () => {
    const result = evaluateTierFloor(input({ confidentiality: "CLASSIFIED" as never }));
    assert.equal(result.action, "block");
    assert.ok(
      (result as Extract<TierFloorResult, { action: "block" }>).reason.includes("CLASSIFIED"),
    );
  });
});
