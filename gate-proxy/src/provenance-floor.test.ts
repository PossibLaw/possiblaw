// gate-proxy/src/provenance-floor.test.ts
//
// C2 — confidentiality derived from what went INTO the work, not from where it
// was filed.
//
// Before C2 the gate reasoned only about the matter an egress was filed under.
// An agent working a standard matter could draw on a privileged one and the
// payload inherited the standard floor while carrying privileged facts — the
// contamination case, invisible to the gate. These tests pin the new rule and,
// just as importantly, pin that it is still RAISE-ONLY.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  maxConfidentiality,
  resolveEffectiveConfidentiality,
} from "./matter-classification.ts";

describe("maxConfidentiality", () => {
  it("picks the highest tier and ignores gaps", () => {
    assert.equal(maxConfidentiality(["standard", "privileged", "confidential"]), "privileged");
    assert.equal(maxConfidentiality([undefined, "confidential", undefined]), "confidential");
    assert.equal(maxConfidentiality(["standard"]), "standard");
  });

  it("returns undefined when nothing is known, rather than a default", () => {
    assert.equal(maxConfidentiality([]), undefined);
    assert.equal(maxConfidentiality([undefined, undefined]), undefined);
  });
});

describe("provenance-derived confidentiality floor", () => {
  it("a privileged contributor raises a standard filed matter", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "standard",
      unspecifiedDefault: null,
      contributingFloors: ["privileged"],
    });
    assert.equal(r.effective, "privileged", "contamination raises the tier");
    assert.equal(r.provenanceApplied, true, "and is flagged as such");
    assert.equal(r.floorApplied, true);
  });

  it("raises even when the filed matter has no registered floor at all", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: undefined,
      unspecifiedDefault: null,
      contributingFloors: ["confidential"],
    });
    assert.equal(r.effective, "confidential");
    assert.equal(r.provenanceApplied, true);
  });

  it("takes the highest across several contributors", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "standard",
      unspecifiedDefault: null,
      contributingFloors: ["standard", "privileged", "confidential", undefined],
    });
    assert.equal(r.effective, "privileged");
    assert.equal(r.provenanceApplied, true);
  });

  it("does not flag provenance when the filed matter was already that high", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "privileged",
      unspecifiedDefault: null,
      contributingFloors: ["privileged"],
    });
    assert.equal(r.effective, "privileged");
    // The floor did the work; the contributor added nothing. Reporting
    // contamination here would cry wolf on every same-tier reference.
    assert.equal(r.provenanceApplied, false);
  });

  it("a contributor can never LOWER the tier", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "privileged",
      registeredFloor: "privileged",
      unspecifiedDefault: null,
      contributingFloors: ["standard"],
    });
    assert.equal(r.effective, "privileged", "raise-only is preserved");
    assert.equal(r.provenanceApplied, false);
  });

  it("a claim above every floor still wins, and is not contamination", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "privileged",
      registeredFloor: "standard",
      unspecifiedDefault: null,
      contributingFloors: ["confidential"],
    });
    assert.equal(r.effective, "privileged", "a caller may always raise");
    assert.equal(r.floorApplied, false);
    assert.equal(r.provenanceApplied, false);
  });

  it("a crafted claim cannot dodge a contributor's floor", () => {
    const r = resolveEffectiveConfidentiality({
      claimed: "not-a-tier",
      registeredFloor: undefined,
      unspecifiedDefault: null,
      contributingFloors: ["privileged"],
    });
    assert.equal(r.effective, "privileged");
  });

  it("behaves exactly as before when no context is declared", () => {
    const withoutField = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "confidential",
      unspecifiedDefault: null,
    });
    const withEmpty = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "confidential",
      unspecifiedDefault: null,
      contributingFloors: [],
    });
    assert.equal(withoutField.effective, "confidential");
    assert.deepEqual(withEmpty, withoutField, "empty contributors is a no-op");
    assert.equal(withoutField.provenanceApplied, false);
  });

  it("unregistered contributors are ignored rather than assumed dangerous", () => {
    // An unknown matter yields undefined from the registry. Treating that as
    // privileged would make every unclassified reference block an egress.
    const r = resolveEffectiveConfidentiality({
      claimed: "standard",
      registeredFloor: "standard",
      unspecifiedDefault: null,
      contributingFloors: [undefined, undefined],
    });
    assert.equal(r.effective, "standard");
    assert.equal(r.provenanceApplied, false);
  });
});
