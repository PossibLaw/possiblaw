// gate-proxy/src/quality/signoff.test.ts
// Tests for the Matter Trust Report bundle assembler.
// Follows the temp-file ReceiptChain pattern from receipts.test.ts /
// citation-registry.test.ts: build a real chain over a fresh temp file,
// append receipts via the same public API the server uses, then assemble.
//
// INVARIANT under test (reproduces the receipt invariant): the bundle — in
// BOTH its JSON form and its rendered Markdown — carries payloadSha256 only,
// never plaintext and never any meta payload fragment.
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ReceiptChain, ReceiptChainCorruptError, sha256hex, type ReceiptEntry } from "../receipts.ts";
import { assembleSignoffBundle, renderSignoffMarkdown } from "./signoff.ts";

function freshChainPath(): { chain: ReceiptChain; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-signoff-test-"));
  const filePath = path.join(dir, "receipts.jsonl");
  return { chain: new ReceiptChain(filePath), filePath };
}

// A plaintext "smoking gun" string that must never leak into any output.
const SECRET = "Acme Corp privileged settlement number 12345 quote-text";
const SECRET_SHA = sha256hex(SECRET);

// ---------------------------------------------------------------------------
// HAPPY: email-send (human-approved) + court-filing (citation-verified)
// ---------------------------------------------------------------------------

test("HAPPY: bundle lists email-send + court-filing, verify().ok, zero payloads", () => {
  const { chain } = freshChainPath();

  // An unrelated matter — must be filtered out.
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: sha256hex("other"),
    agentId: "agent-x", issueId: "POS-999",
  });

  // Human-approved email send for our matter.
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "human", outcome: "performed", payloadSha256: SECRET_SHA,
    agentId: "agent-1", issueId: "POS-123", approvalId: "approval-7",
    meta: { claimedConfidentiality: "standard" },
  });

  // Citation verification (quality receipt) for our matter.
  chain.append({
    kind: "quality", tool: "citation_verification", boundary: null,
    decision: null, outcome: "performed", payloadSha256: sha256hex("brief-doc"),
    agentId: "checker-1", issueId: "POS-123",
    meta: { citationCount: 3, rowCount: 3, quotedRowCount: 2 },
  });

  // Court filing for our matter (human-approved).
  chain.append({
    kind: "egress", tool: "file_court_document", boundary: "COURT_FILING",
    decision: "human", outcome: "performed", payloadSha256: sha256hex("brief-doc"),
    agentId: "agent-1", issueId: "POS-123", approvalId: "approval-8",
    meta: { claimedConfidentiality: "confidential", routedLocal: true },
  });

  const bundle = assembleSignoffBundle(chain, "POS-123");

  assert.equal(bundle.issueId, "POS-123");
  // Only this matter's receipts (4 total appended, 1 is POS-999 → 3 remain).
  assert.equal(bundle.receipts.length, 3);
  for (const r of bundle.receipts) assert.equal(r.issueId, "POS-123");

  // Chain integrity.
  assert.equal(bundle.chain.ok, true);
  assert.equal(typeof bundle.chain.length, "number");
  assert.equal(typeof bundle.chain.head, "string");

  // Citation-verification registrations present.
  assert.equal(bundle.citationVerifications.length, 1);
  assert.equal(bundle.citationVerifications[0].outcome, "performed");

  // Attestation block: both human approvals captured.
  const approvalIds = bundle.attestations.map((a) => a.approvalId).sort();
  assert.deepEqual(approvalIds, ["approval-7", "approval-8"]);
  for (const a of bundle.attestations) {
    assert.equal(typeof a.payloadSha256, "string");
    assert.equal(typeof a.agentId, "string");
    assert.equal(typeof a.ts, "string");
  }

  // Tier-floor: the court filing routed local.
  assert.equal(bundle.tierFloorDecisions.length, 1);
  assert.equal(bundle.tierFloorDecisions[0].routedLocal, true);

  // No blocked egress in the happy story.
  assert.equal(bundle.blockedEgress.length, 0);

  // INVARIANT: zero payloads in JSON or Markdown.
  const md = renderSignoffMarkdown(bundle);
  assertNoPlaintext(bundle, md);
  // The sha IS allowed to appear (it is the payload representative).
  assert.equal(JSON.stringify(bundle).includes(SECRET_SHA), true);
  assert.equal(md.includes(SECRET_SHA), true);
});

// ---------------------------------------------------------------------------
// EDGE: a matter with a blocked egress → bundle shows the block + reason
// ---------------------------------------------------------------------------

test("EDGE: blocked egress is surfaced with its reason (the good regulator story)", () => {
  const { chain } = freshChainPath();

  chain.append({
    kind: "egress", tool: "query_external_model", boundary: "CONFIDENTIAL_TO_CLOUD",
    decision: "anonymize", outcome: "blocked", payloadSha256: SECRET_SHA,
    agentId: "agent-2", issueId: "POS-200",
    meta: { reason: "anonymizer_cannot_vouch: confidence=0", claimedConfidentiality: "privileged" },
  });

  const bundle = assembleSignoffBundle(chain, "POS-200");

  assert.equal(bundle.receipts.length, 1);
  assert.equal(bundle.blockedEgress.length, 1);
  assert.equal(bundle.blockedEgress[0].outcome, "blocked");
  assert.equal(bundle.blockedEgress[0].reason, "anonymizer_cannot_vouch: confidence=0");
  assert.equal(bundle.chain.ok, true);

  const md = renderSignoffMarkdown(bundle);
  // The block + reason must appear in the human-readable report.
  assert.equal(md.includes("blocked"), true);
  assert.equal(md.includes("anonymizer_cannot_vouch"), true);

  assertNoPlaintext(bundle, md);
});

test("EDGE: anonymization events are surfaced", () => {
  const { chain } = freshChainPath();
  chain.append({
    kind: "egress", tool: "query_external_model", boundary: "CONFIDENTIAL_TO_CLOUD",
    decision: "anonymize", outcome: "anonymized_performed", payloadSha256: SECRET_SHA,
    agentId: "agent-3", issueId: "POS-201",
    meta: { claimedConfidentiality: "confidential", maskedTokenCount: 4 },
  });
  const bundle = assembleSignoffBundle(chain, "POS-201");
  assert.equal(bundle.anonymizationEvents.length, 1);
  assert.equal(bundle.anonymizationEvents[0].outcome, "anonymized_performed");
  assertNoPlaintext(bundle, renderSignoffMarkdown(bundle));
});

// ---------------------------------------------------------------------------
// FAILURE/SECURITY: tampered receipts.jsonl → fail-closed
// ---------------------------------------------------------------------------

test("FAILURE: tampered receipts chain surfaces ReceiptChainCorruptError, refuses clean report", () => {
  const { chain, filePath } = freshChainPath();

  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: SECRET_SHA,
    agentId: "agent-1", issueId: "POS-300",
  });
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: sha256hex("x"),
    agentId: "agent-1", issueId: "POS-300",
  });

  // Tamper line 1's body but leave the stored hash → verify() fails (hash mismatch).
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const entry0 = JSON.parse(lines[0]) as ReceiptEntry;
  entry0.body.outcome = "blocked";
  lines[0] = JSON.stringify(entry0);
  fs.writeFileSync(filePath, lines.join("\n") + "\n");

  assert.throws(
    () => assembleSignoffBundle(chain, "POS-300"),
    (err: unknown) => {
      assert.ok(
        err instanceof ReceiptChainCorruptError,
        `expected ReceiptChainCorruptError, got ${String(err)}`,
      );
      return true;
    },
  );
});

test("FAILURE: structurally corrupt tail line surfaces ReceiptChainCorruptError", () => {
  const { chain, filePath } = freshChainPath();
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: SECRET_SHA,
    agentId: "agent-1", issueId: "POS-301",
  });
  // Append a non-JSON corrupt line. verify() reports it as unparseable (fail-closed).
  fs.appendFileSync(filePath, "NOT_JSON_CORRUPT\n", "utf8");

  assert.throws(
    () => assembleSignoffBundle(chain, "POS-301"),
    (err: unknown) => {
      assert.ok(err instanceof ReceiptChainCorruptError, `got ${String(err)}`);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// path-based input + empty matter
// ---------------------------------------------------------------------------

test("accepts a receipts file path (not just a ReceiptChain instance)", () => {
  const { chain, filePath } = freshChainPath();
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: sha256hex("p"),
    agentId: "agent-1", issueId: "POS-400",
  });
  const bundle = assembleSignoffBundle(filePath, "POS-400");
  assert.equal(bundle.receipts.length, 1);
  assert.equal(bundle.chain.ok, true);
});

test("empty matter → empty sections, chain ok, valid Markdown", () => {
  const { chain } = freshChainPath();
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: sha256hex("p"),
    agentId: "agent-1", issueId: "POS-OTHER",
  });
  const bundle = assembleSignoffBundle(chain, "POS-EMPTY");
  assert.equal(bundle.receipts.length, 0);
  assert.equal(bundle.attestations.length, 0);
  const md = renderSignoffMarkdown(bundle);
  assert.equal(md.includes("POS-EMPTY"), true);
});

// ---------------------------------------------------------------------------
// shared invariant assertion
// ---------------------------------------------------------------------------

/** Reproduce the receipt invariant: no plaintext, no meta payload fragment. */
function assertNoPlaintext(bundle: unknown, md: string): void {
  const json = JSON.stringify(bundle);
  // The raw secret plaintext must never appear.
  assert.equal(json.includes(SECRET), false, "secret plaintext leaked into bundle JSON");
  assert.equal(md.includes(SECRET), false, "secret plaintext leaked into Markdown");
  // A distinctive fragment of the secret must not appear either.
  assert.equal(json.includes("Acme Corp"), false, "payload fragment leaked into bundle JSON");
  assert.equal(md.includes("Acme Corp"), false, "payload fragment leaked into Markdown");
  assert.equal(json.includes("quote-text"), false, "quote fragment leaked into bundle JSON");
  assert.equal(md.includes("quote-text"), false, "quote fragment leaked into Markdown");
}
