import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { anonymize, deanonymize, checkCoverage } from "./anonymize.ts";

// ---------------------------------------------------------------------------
// Fixture path
// ---------------------------------------------------------------------------

const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/entities-labeled.jsonl", import.meta.url),
);

interface LabeledLine {
  text: string;
  entities: string[];
  labeled: {
    email: string[];
    phone: string[];
    ssn: string[];
    ein: string[];
    amount: string[];
    date: string[];
  };
}

function loadFixture(): LabeledLine[] {
  const raw = fs.readFileSync(FIXTURE_PATH, "utf8");
  return raw
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as LabeledLine);
}

// ---------------------------------------------------------------------------
// Test 1: Measured recall gate (the lq-ai requirement)
//
// For every fixture line, run anonymize(text, entities).
// Collect all labeled spans (across all classes + entities) and check:
//   - Each labeled span is absent from the masked output (recall = absent / total).
//   - recall >= 0.95
//   - For lines with entities.length > 0, confidence must be 1 (entity coverage).
// ---------------------------------------------------------------------------

describe("anonymize — measured recall gate", () => {
  it("recall >= 0.95 across all fixture lines and classes, zero entity leaks", () => {
    const lines = loadFixture();
    let total = 0;
    let absent = 0;
    let entityLeaks = 0;

    for (const line of lines) {
      const { text, entities, labeled } = line;
      const result = anonymize(text, entities);

      // Collect all labeled spans: entities + pattern classes
      const allSpans: string[] = [
        ...entities,
        ...labeled.email,
        ...labeled.phone,
        ...labeled.ssn,
        ...labeled.ein,
        ...labeled.amount,
        ...labeled.date,
      ];

      for (const span of allSpans) {
        total++;
        if (!result.masked.toLowerCase().includes(span.toLowerCase())) {
          absent++;
        }
      }

      // Entity leaks: specifically verify checkCoverage for lines with entities
      if (entities.length > 0) {
        const clean = checkCoverage(result.masked, entities);
        if (!clean) {
          entityLeaks++;
        }
      }
    }

    const recall = total === 0 ? 1 : absent / total;
    console.log(`[anonymize recall] total spans: ${total}, absent from masked: ${absent}, recall: ${(recall * 100).toFixed(1)}%`);

    assert.equal(entityLeaks, 0, `Expected 0 entity leaks, found ${entityLeaks}`);
    assert.ok(
      recall >= 0.95,
      `Recall ${(recall * 100).toFixed(2)}% is below the required 95% threshold`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 2: Single fixture-style case — every labeled span + entity absent from masked
// ---------------------------------------------------------------------------

describe("anonymize — single fixture-style case", () => {
  it("all labeled spans and entities absent from masked output", () => {
    const text =
      "Please forward the contract to alice@example.com. " +
      "Client: Redwood Partners LLC. Call 555-321-9876 if urgent. " +
      "SSN on file: 234-56-7890. Retainer: $25,000. Date: 2026-06-01.";
    const entities = ["Redwood Partners LLC"];
    const labeled = {
      email: ["alice@example.com"],
      phone: ["555-321-9876"],
      ssn: ["234-56-7890"],
      amount: ["$25,000"],
      date: ["2026-06-01"],
    };

    const result = anonymize(text, entities);
    const allSpans = [
      ...entities,
      ...labeled.email,
      ...labeled.phone,
      ...labeled.ssn,
      ...labeled.amount,
      ...labeled.date,
    ];

    for (const span of allSpans) {
      assert.ok(
        !result.masked.toLowerCase().includes(span.toLowerCase()),
        `Span "${span}" found in masked output: "${result.masked}"`,
      );
    }
    assert.equal(result.confidence, 1);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Special-chars entity "Acme (Delaware) L.L.C." masked correctly
// ---------------------------------------------------------------------------

describe("anonymize — special-chars entity", () => {
  it("entity with parentheses and dots is masked; confidence 1", () => {
    const entity = "Acme (Delaware) L.L.C.";
    const text = `The agreement was signed by ${entity} on 2026-01-01.`;
    const result = anonymize(text, [entity]);

    assert.ok(
      !result.masked.toLowerCase().includes("acme (delaware) l.l.c."),
      `Entity "${entity}" should be absent from masked: "${result.masked}"`,
    );
    assert.equal(result.confidence, 1);
  });
});

// ---------------------------------------------------------------------------
// Test 4: checkCoverage direct tests
// ---------------------------------------------------------------------------

describe("checkCoverage", () => {
  it("returns false when entity is still present (case-insensitive)", () => {
    const masked = "The agreement was signed by Acme Corp on 2026-01-01.";
    assert.equal(checkCoverage(masked, ["Acme Corp"]), false);
  });

  it("returns false when entity present in different case", () => {
    const masked = "The agreement was signed by ACME CORP on 2026-01-01.";
    assert.equal(checkCoverage(masked, ["Acme Corp"]), false);
  });

  it("returns true when entity is absent", () => {
    const masked = "The agreement was signed by ENTITY_A on 2026-01-01.";
    assert.equal(checkCoverage(masked, ["Acme Corp"]), true);
  });

  it("returns true for empty entities list", () => {
    assert.equal(checkCoverage("some text with no entity", []), true);
  });
});

// ---------------------------------------------------------------------------
// Test 5: Empty entities + privileged-style text → confidence 0
// ---------------------------------------------------------------------------

describe("anonymize — empty entities list", () => {
  it("confidence 0 when entities is empty (even if text contains pattern spans)", () => {
    const text =
      "The client emailed us at client@domain.com. SSN: 999-88-7777. Amount: $50,000.";
    const result = anonymize(text, []);
    assert.equal(result.confidence, 0, "confidence must be 0 when no entity list supplied");
  });
});

// ---------------------------------------------------------------------------
// Test 6: Round-trip deanonymize(anonymize(text, entities)) === original text
// ---------------------------------------------------------------------------

describe("anonymize — round-trip", () => {
  it("deanonymize restores the original text with entities + ≥3 pattern classes", () => {
    const text =
      "Summit Legal Group retained Jane Doe at jane.doe@summit.law for $120,000. " +
      "Her SSN is 555-44-3322. Engagement date: March 15, 2026. Call 212-555-0177.";
    const entities = ["Summit Legal Group", "Jane Doe"];

    const result = anonymize(text, entities);
    const restored = deanonymize(result.masked, result.map);

    assert.equal(restored, text, `Round-trip failed.\nOriginal: ${text}\nRestored: ${restored}`);
  });
});

// ---------------------------------------------------------------------------
// Test 7: Stable tokens
// ---------------------------------------------------------------------------

describe("anonymize — stable tokens", () => {
  it("same entity in two places → one token used for both occurrences", () => {
    const text = "Acme Corp filed a claim. Acme Corp denies liability.";
    const result = anonymize(text, ["Acme Corp"]);

    // There should be exactly one entity token (ENTITY_A) in the map
    const entityTokens = Object.keys(result.map).filter((k) => k.startsWith("ENTITY_"));
    assert.equal(entityTokens.length, 1, "Only one entity token should exist for the same entity");

    // Both occurrences replaced — "Acme Corp" should not appear in masked
    assert.ok(!result.masked.includes("Acme Corp"));

    // Both places should use ENTITY_A
    const count = (result.masked.match(/ENTITY_A/g) ?? []).length;
    assert.equal(count, 2, "ENTITY_A should appear twice");
  });

  it("two entities → ENTITY_A / ENTITY_B in input order", () => {
    const text = "Apex LLC and Bravo Inc. signed the contract.";
    const result = anonymize(text, ["Apex LLC", "Bravo Inc."]);

    assert.ok(result.map["ENTITY_A"] === "Apex LLC", `ENTITY_A should map to first entity; got ${result.map["ENTITY_A"]}`);
    assert.ok(result.map["ENTITY_B"] === "Bravo Inc.", `ENTITY_B should map to second entity; got ${result.map["ENTITY_B"]}`);
  });

  it("same email appearing twice → same EMAIL_1 token both times", () => {
    const text = "Contact info@example.com for billing. Also send to info@example.com.";
    const result = anonymize(text, []);

    // info@example.com should appear as EMAIL_1 twice, not EMAIL_1 and EMAIL_2
    const emailTokens = Object.keys(result.map).filter((k) => k.startsWith("EMAIL_"));
    assert.equal(emailTokens.length, 1, "Identical emails should share one token");

    const count = (result.masked.match(/EMAIL_1/g) ?? []).length;
    assert.equal(count, 2, "EMAIL_1 should appear twice for the same email");
  });
});

// ---------------------------------------------------------------------------
// Test 8: Overlap — longest-first entity wins
// ---------------------------------------------------------------------------

describe("anonymize — longest-first overlap", () => {
  it('"Acme Corp" (longer) wins over "Acme" (shorter) when text has "Acme Corp"', () => {
    const text = "Acme Corp signed the deal. Acme is a well-known brand.";
    // Entities supplied: Acme first (shorter), Acme Corp second (longer) in input order.
    const result = anonymize(text, ["Acme", "Acme Corp"]);

    // "Acme Corp" → ENTITY_A (first in input), "Acme" → ENTITY_B (second in input)
    // But longest-first masking means "Acme Corp" as a whole gets one token, not double-masked.
    assert.ok(
      !result.masked.includes("Acme Corp"),
      `"Acme Corp" should be fully replaced, not left in masked: "${result.masked}"`,
    );
    assert.ok(
      !result.masked.includes("Acme"),
      `"Acme" should also be replaced wherever it appears standalone: "${result.masked}"`,
    );

    // The masked text should NOT contain double-token artifacts like "ENTITY_A Corp"
    assert.ok(
      !result.masked.includes("Corp"),
      `"Corp" should not appear in masked (double-mask artifact): "${result.masked}"`,
    );
  });
});

// ---------------------------------------------------------------------------
// C1 — Unicode normalization bypass regression
// ---------------------------------------------------------------------------

describe("anonymize — C1 Unicode NFC normalization bypass regression", () => {
  it("NFD text with NFC entity: masked output contains neither NFC nor NFD form, confidence=1", () => {
    // "Café Müller" in NFC
    const nfcEntity = "Café Müller"; // NFC: é=é, ü=ü
    // Same string in NFD (decomposed: e + combining acute, u + combining umlaut)
    const nfdText = "Café Müller needs legal advice.";

    // Pre-condition: NFD and NFC forms are not equal as raw strings
    assert.notEqual(nfdText.normalize("NFD"), nfcEntity.normalize("NFC").normalize("NFD") === nfdText.normalize("NFD") ? "equal" : "not-equal", "test data setup");

    const result = anonymize(nfdText, [nfcEntity]);

    // Neither the NFC nor the NFD form of the entity should appear in masked
    assert.ok(
      !result.masked.normalize("NFC").toLowerCase().includes(nfcEntity.toLowerCase()),
      `NFC form of entity should be absent from masked; got: "${result.masked}"`,
    );
    assert.ok(
      !result.masked.normalize("NFD").toLowerCase().includes(nfdText.slice(0, 10).toLowerCase()),
      `NFD form of entity should be absent from masked; got: "${result.masked}"`,
    );
    assert.equal(result.confidence, 1, "confidence must be 1 when entity was masked");
  });

  it("checkCoverage catches NFD leak when given unnormalized masked text containing NFC entity", () => {
    // Simulate: masked text still has the NFD form, entity list has NFC form
    const nfcEntity = "Café Müller"; // NFC
    const nfdForm = "Café Müller"; // NFD, visually identical

    // If we pass NFD-form masked + NFC entity, checkCoverage must detect the leak
    const result = checkCoverage(nfdForm, [nfcEntity]);
    assert.equal(result, false, "checkCoverage must return false (leak detected) when NFD and NFC forms match after normalization");
  });
});

// ---------------------------------------------------------------------------
// I2 (b) — EMAIL ReDoS regression: 64KB adversarial string completes <500ms
// ---------------------------------------------------------------------------

describe("anonymize — I2(b) EMAIL ReDoS regression", () => {
  it("64KB adversarial 'a.a.a…!' string through anonymize() completes in under 500ms", () => {
    // Classic ReDoS trigger for naive email regex: long sequence of valid-looking
    // local-part chars followed by a non-matching char
    const adversarial = "a.".repeat(32_000) + "!"; // ~64KB
    const start = Date.now();
    anonymize(adversarial, []);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 500, `anonymize should complete in <500ms on adversarial input; took ${elapsed}ms`);
  });
});
