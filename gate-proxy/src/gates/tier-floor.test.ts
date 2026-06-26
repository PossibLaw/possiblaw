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

// ---------------------------------------------------------------------------
// Data-terms posture (docs/privilege-and-confidentiality.md): reason about a
// cloud lane's contracted data terms, not just binary cloud/local.
// ---------------------------------------------------------------------------

const zdrTerms = { zdr: true, trains: false, humanReview: false, tenantIsolated: true };

describe("evaluateTierFloor — dataTerms: happy (ZDR cloud)", () => {
  it("confidential + cloud lane with zdr/no-train/no-review/isolated → allow on cloud, dataTermsTier=zdr-cloud", () => {
    const result = evaluateTierFloor(
      input({ confidentiality: "confidential", targetTier: "cloud", localAvailable: false, dataTerms: { ...zdrTerms } }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: false,
      dataTermsTier: "zdr-cloud",
    } satisfies TierFloorResult);
  });

  it("standard + cloud lane (any terms) → allow on cloud, dataTermsTier=standard-cloud", () => {
    const result = evaluateTierFloor(
      input({ confidentiality: "standard", targetTier: "cloud", localAvailable: false, dataTerms: { ...zdrTerms } }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: false,
      dataTermsTier: "standard-cloud",
    } satisfies TierFloorResult);
  });
});

describe("evaluateTierFloor — dataTerms: edge (no ZDR → prefer local)", () => {
  it("confidential + cloud lane lacking ZDR but local available → useLocal:true, dataTermsTier=local", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "confidential",
        targetTier: "cloud",
        localAvailable: true,
        dataTerms: { zdr: false, trains: false, humanReview: false, tenantIsolated: true },
      }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: true,
      dataTermsTier: "local",
    } satisfies TierFloorResult);
  });

  it("confidential + cloud lane with humanReview (fails strict terms) + local available → useLocal:true, dataTermsTier=local", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "confidential",
        targetTier: "cloud",
        localAvailable: true,
        dataTerms: { zdr: true, trains: false, humanReview: true, tenantIsolated: true },
      }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: true,
      dataTermsTier: "local",
    } satisfies TierFloorResult);
  });

  it("confidential + cloud lane lacking ZDR + no local → anonymize, dataTermsTier=anonymize", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "confidential",
        targetTier: "cloud",
        localAvailable: false,
        dataTerms: { zdr: false, trains: false, humanReview: false, tenantIsolated: true },
      }),
    );
    assert.deepEqual(result, {
      action: "anonymize",
      dataTermsTier: "anonymize",
    } satisfies TierFloorResult);
  });
});

describe("evaluateTierFloor — dataTerms: privileged (local or ZDR-cloud-under-counsel-direction)", () => {
  it("privileged + ZDR cloud WITHOUT counselDirected + local available → prefer local (useLocal:true)", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "privileged",
        targetTier: "cloud",
        localAvailable: true,
        dataTerms: { ...zdrTerms },
      }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: true,
      dataTermsTier: "local",
    } satisfies TierFloorResult);
  });

  it("privileged + ZDR cloud WITHOUT counselDirected + no local → anonymize (do not silently send to cloud)", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "privileged",
        targetTier: "cloud",
        localAvailable: false,
        dataTerms: { ...zdrTerms },
      }),
    );
    assert.deepEqual(result, {
      action: "anonymize",
      dataTermsTier: "anonymize",
    } satisfies TierFloorResult);
  });

  it("privileged + ZDR cloud WITH counselDirected → allow on cloud, dataTermsTier=zdr-cloud-counsel-directed", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "privileged",
        targetTier: "cloud",
        localAvailable: false,
        counselDirected: true,
        dataTerms: { ...zdrTerms },
      }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: false,
      dataTermsTier: "zdr-cloud-counsel-directed",
    } satisfies TierFloorResult);
  });

  it("privileged + counselDirected BUT lane lacks ZDR → NOT allowed on cloud; prefer local", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "privileged",
        targetTier: "cloud",
        localAvailable: true,
        counselDirected: true,
        dataTerms: { zdr: false, trains: false, humanReview: false, tenantIsolated: true },
      }),
    );
    assert.deepEqual(result, {
      action: "allow",
      useLocal: true,
      dataTermsTier: "local",
    } satisfies TierFloorResult);
  });
});

// ---------------------------------------------------------------------------
// FAILURE / SECURITY: a training lane (trains:true) is a HARD BLOCK for ANY
// tier. This is the only configuration the case law condemns
// (docs/privilege-and-confidentiality.md). No tier, no counsel direction, and
// no fallback (local/anonymize) may override it — matter data must never reach
// a training endpoint.
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — dataTerms: training lane is a hard block", () => {
  it("standard + trains:true → BLOCK (cannot be downgraded by low tier)", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "standard",
        targetTier: "cloud",
        localAvailable: true,
        dataTerms: { zdr: true, trains: true, humanReview: false, tenantIsolated: true },
      }),
    );
    assert.equal(result.action, "block");
    assert.ok("reason" in result);
    assert.equal((result as Extract<TierFloorResult, { action: "block" }>).dataTermsTier, "blocked-trains");
  });

  it("confidential + trains:true + local available → BLOCK (no local fallback may rescue a training lane decision)", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "confidential",
        targetTier: "cloud",
        localAvailable: true,
        dataTerms: { zdr: true, trains: true, humanReview: false, tenantIsolated: true },
      }),
    );
    assert.equal(result.action, "block");
    assert.equal((result as Extract<TierFloorResult, { action: "block" }>).dataTermsTier, "blocked-trains");
  });

  it("privileged + counselDirected + trains:true → BLOCK (counsel direction cannot authorize a training endpoint)", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "privileged",
        targetTier: "cloud",
        localAvailable: false,
        counselDirected: true,
        dataTerms: { zdr: true, trains: true, humanReview: false, tenantIsolated: true },
      }),
    );
    assert.equal(result.action, "block");
    assert.equal((result as Extract<TierFloorResult, { action: "block" }>).dataTermsTier, "blocked-trains");
  });

  it("consumer endpoint (consumerEndpoint:true) → BLOCK regardless of tier", () => {
    const result = evaluateTierFloor(
      input({
        confidentiality: "standard",
        targetTier: "cloud",
        localAvailable: true,
        dataTerms: { zdr: false, trains: false, humanReview: true, tenantIsolated: false, consumerEndpoint: true },
      }),
    );
    assert.equal(result.action, "block");
    assert.equal((result as Extract<TierFloorResult, { action: "block" }>).dataTermsTier, "blocked-trains");
  });
});

// ---------------------------------------------------------------------------
// BACKWARD COMPAT: when dataTerms is absent, the binary cloud/local behaviour
// is unchanged and no dataTermsTier is asserted differently. A local targetTier
// without dataTerms still records the "local" posture.
// ---------------------------------------------------------------------------

describe("evaluateTierFloor — dataTerms: backward-compat shape", () => {
  it("confidential + cloud + local available, NO dataTerms → useLocal:true (legacy shape preserved)", () => {
    const result = evaluateTierFloor(
      input({ confidentiality: "confidential", targetTier: "cloud", localAvailable: true }),
    );
    assert.equal(result.action, "allow");
    assert.equal((result as Extract<TierFloorResult, { action: "allow" }>).useLocal, true);
  });

  it("standard + cloud, NO dataTerms → allow useLocal:false (legacy shape preserved)", () => {
    const result = evaluateTierFloor(input({ confidentiality: "standard", targetTier: "cloud" }));
    assert.equal(result.action, "allow");
    assert.equal((result as Extract<TierFloorResult, { action: "allow" }>).useLocal, false);
  });
});
