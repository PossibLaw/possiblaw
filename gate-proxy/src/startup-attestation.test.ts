import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  StartupAttestationConfigError,
  createStartupProof,
  resolveStartupAttestationEnvironment,
} from "./startup-attestation.ts";

describe("startup attestation configuration", () => {
  it("uses an ephemeral UUID without a proof in unconfigured local mode", () => {
    const result = resolveStartupAttestationEnvironment({}, () => "e51ffba8-7d22-4f9a-8cc4-06d20e127e11");
    assert.deepEqual(result, { instanceId: "e51ffba8-7d22-4f9a-8cc4-06d20e127e11" });
  });

  it("accepts a complete launcher-provided UUIDv4 and strong secret", () => {
    const result = resolveStartupAttestationEnvironment({
      GATE_INSTANCE_ID: "39b9e369-ed73-4a95-ad44-20de7039a3a7",
      GATE_STARTUP_SECRET: "a".repeat(64),
    });
    assert.deepEqual(result, {
      instanceId: "39b9e369-ed73-4a95-ad44-20de7039a3a7",
      startupSecret: "a".repeat(64),
    });
  });

  for (const env of [
    { GATE_INSTANCE_ID: "39b9e369-ed73-4a95-ad44-20de7039a3a7" },
    { GATE_STARTUP_SECRET: "a".repeat(64) },
    { GATE_INSTANCE_ID: "", GATE_STARTUP_SECRET: "a".repeat(64) },
    { GATE_INSTANCE_ID: "not-a-uuid", GATE_STARTUP_SECRET: "a".repeat(64) },
    { GATE_INSTANCE_ID: "39b9e369-ed73-4a95-ad44-20de7039a3a7", GATE_STARTUP_SECRET: "short" },
    { GATE_INSTANCE_ID: "39b9e369-ed73-4a95-ad44-20de7039a3a7", GATE_STARTUP_SECRET: `${"a".repeat(32)}\n` },
  ]) {
    it(`fails closed for partial or invalid env: ${JSON.stringify(Object.keys(env))}`, () => {
      assert.throws(
        () => resolveStartupAttestationEnvironment(env),
        StartupAttestationConfigError,
      );
    });
  }
});

describe("startup attestation proof", () => {
  it("is HMAC-SHA256 hex over instanceId, companyId, and policyDigest separated by newlines", () => {
    const startupSecret = "s".repeat(32);
    const instanceId = "39b9e369-ed73-4a95-ad44-20de7039a3a7";
    const companyId = "CO1";
    const policyDigest = "d".repeat(64);
    const expected = crypto
      .createHmac("sha256", startupSecret)
      .update(instanceId + "\n" + companyId + "\n" + policyDigest)
      .digest("hex");

    assert.equal(
      createStartupProof(startupSecret, instanceId, companyId, policyDigest),
      expected,
    );
  });
});
