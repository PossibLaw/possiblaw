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
// Authority provenance: registered authorities + unbacked citations
// ---------------------------------------------------------------------------

test("authority provenance: bundle lists retrieved-authority registrations + unbacked citations", () => {
  const { chain } = freshChainPath();

  // A firm-wide authority registration (matter-agnostic — no issueId).
  chain.append({
    kind: "quality", tool: "authority_provenance", boundary: null,
    decision: null, outcome: "performed", payloadSha256: sha256hex("roe-body"),
    meta: {
      normalizedCitation: "410 U.S.113",
      indexedCitations: ["410 U.S.113"],
      authoritySha256: sha256hex("roe-body"),
      source: "courtlistener",
      sourceUrl: "https://www.courtlistener.com/opinion/108713/roe-v-wade/",
      retrievedAt: "2026-06-26T12:00:00.000Z",
    },
  });

  // An egress for our matter that recorded an unbacked citation (flag-only).
  chain.append({
    kind: "egress", tool: "share_external", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: sha256hex("brief-doc"),
    agentId: "agent-1", issueId: "POS-300",
    meta: { claimedConfidentiality: "standard", unbackedCitations: ["384 U.S. 436"], backedCitationCount: 1 },
  });

  const bundle = assembleSignoffBundle(chain, "POS-300");

  // Registrations are surfaced (matter-agnostic, so this one shows up).
  assert.equal(bundle.authorityProvenance.registrations.length, 1);
  assert.equal(bundle.authorityProvenance.registrations[0].normalizedCitation, "410 U.S.113");
  assert.equal(bundle.authorityProvenance.registrations[0].source, "courtlistener");
  assert.equal(bundle.authorityProvenance.registrations[0].authoritySha256, sha256hex("roe-body"));

  // The unbacked citation recorded on this matter's egress receipt is surfaced.
  assert.equal(bundle.authorityProvenance.unbacked.length, 1);
  assert.deepEqual(bundle.authorityProvenance.unbacked[0].unbackedCitations, ["384 U.S. 436"]);
  assert.equal(bundle.authorityProvenance.unbacked[0].tool, "share_external");

  // authority_provenance receipts must NOT pollute the citation-verifications section.
  assert.equal(bundle.citationVerifications.length, 0);

  // Rendered markdown shows the Authority Provenance section + both rows.
  const md = renderSignoffMarkdown(bundle);
  assert.ok(md.includes("## Authority Provenance"));
  assert.ok(md.includes("Retrieved Authorities"));
  assert.ok(md.includes("410 U.S.113"));
  assert.ok(md.includes("384 U.S. 436"));
});

test("authority provenance: empty matter shows no registrations and no unbacked citations", () => {
  const { chain } = freshChainPath();
  chain.append({
    kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
    decision: "allow", outcome: "performed", payloadSha256: sha256hex("p"),
    agentId: "agent-1", issueId: "POS-CLEAN",
  });
  const bundle = assembleSignoffBundle(chain, "POS-CLEAN");
  assert.deepEqual(bundle.authorityProvenance.registrations, []);
  assert.deepEqual(bundle.authorityProvenance.unbacked, []);
  const md = renderSignoffMarkdown(bundle);
  assert.ok(md.includes("_None registered._"));
  assert.ok(md.includes("every cited authority"));
});

// ---------------------------------------------------------------------------
// Follow-up #2 — facade receipts in Matter Trust Report
// ---------------------------------------------------------------------------

test("SECURITY TRAP regression: pending firm_facade request_approval with approvalId is NOT in attestations", () => {
  // This is the TRAP the brief warns about: a firm_facade pending receipt has
  // an approvalId. The old filter (approvalId !== undefined) would include it in
  // attestations, making it appear as a board-attested event. Fixed by excluding
  // kind:"firm_facade" from attestations.
  const { chain } = freshChainPath();
  chain.append({
    kind: "firm_facade",
    tool: "request_approval",
    boundary: null,
    decision: null,
    outcome: "pending",
    payloadSha256: sha256hex("facade-approval-payload"),
    issueId: "POS-500",
    approvalId: "approval-facade-1",
  });

  const bundle = assembleSignoffBundle(chain, "POS-500");

  // MUST be empty — pending firm_facade receipt is NOT a board attestation
  assert.equal(
    bundle.attestations.length,
    0,
    "pending firm_facade request_approval MUST NOT appear in attestations",
  );

  // MUST appear in firmFacadeActivity
  assert.equal(bundle.firmFacadeActivity.length, 1);
  assert.equal(bundle.firmFacadeActivity[0].tool, "request_approval");
  assert.equal(bundle.firmFacadeActivity[0].outcome, "pending");
  assert.ok(
    bundle.firmFacadeActivity[0].displayStatus.includes("pending human approval"),
    `displayStatus must say "pending human approval"; got: ${bundle.firmFacadeActivity[0].displayStatus}`,
  );
  assert.equal(bundle.firmFacadeActivity[0].approvalId, "approval-facade-1");
});

test("firmFacadeActivity: facade actions appear in own section; pending request_approval renders as pending not attested", () => {
  const { chain } = freshChainPath();

  // create_matter facade receipt
  chain.append({
    kind: "firm_facade",
    tool: "create_matter",
    boundary: null,
    decision: null,
    outcome: "performed",
    payloadSha256: sha256hex("create-payload"),
    issueId: "POS-501",
  });

  // request_approval facade receipt — pending (the TRAP case)
  chain.append({
    kind: "firm_facade",
    tool: "request_approval",
    boundary: null,
    decision: null,
    outcome: "pending",
    payloadSha256: sha256hex("approval-payload"),
    issueId: "POS-501",
    approvalId: "approval-facade-2",
  });

  // fetch_work_product receipt with workProductId in meta
  chain.append({
    kind: "firm_facade",
    tool: "fetch_work_product",
    boundary: null,
    decision: null,
    outcome: "performed",
    payloadSha256: sha256hex("fetch-payload"),
    issueId: "POS-501",
    meta: { workProductId: "wp-001", textDisclosed: false },
  });

  // Unrelated matter receipt — must be excluded
  chain.append({
    kind: "egress",
    tool: "send_email",
    boundary: "THIRD_PARTY_EGRESS",
    decision: "allow",
    outcome: "performed",
    payloadSha256: sha256hex("other"),
    issueId: "POS-OTHER",
  });

  const bundle = assembleSignoffBundle(chain, "POS-501");

  // 3 facade receipts in firmFacadeActivity
  assert.equal(bundle.firmFacadeActivity.length, 3);
  const createRow = bundle.firmFacadeActivity.find((r) => r.tool === "create_matter");
  const approvalRow = bundle.firmFacadeActivity.find((r) => r.tool === "request_approval");
  const fetchRow = bundle.firmFacadeActivity.find((r) => r.tool === "fetch_work_product");

  assert.ok(createRow !== undefined, "create_matter must appear in firmFacadeActivity");
  assert.equal(createRow!.outcome, "performed");

  assert.ok(approvalRow !== undefined, "request_approval must appear in firmFacadeActivity");
  assert.equal(approvalRow!.outcome, "pending");
  assert.ok(
    approvalRow!.displayStatus.includes("pending human approval"),
    `pending request_approval displayStatus must say "pending human approval"; got: ${approvalRow!.displayStatus}`,
  );
  assert.equal(approvalRow!.approvalId, "approval-facade-2");

  assert.ok(fetchRow !== undefined, "fetch_work_product must appear in firmFacadeActivity");
  assert.equal(fetchRow!.workProductId, "wp-001");
  assert.equal(fetchRow!.textDisclosed, false);

  // attestations: ZERO — no firm_facade receipt carries a board attestation
  assert.equal(
    bundle.attestations.length,
    0,
    "attestations must be empty — firm_facade receipts are never board attestations",
  );

  // firmFacadeActivity does NOT appear in receipts count
  // (facade receipts DO appear in bundle.receipts since they share issueId)
  assert.equal(bundle.receipts.length, 3); // 3 facade receipts in this matter

  // Markdown checks
  const md = renderSignoffMarkdown(bundle);
  assert.ok(md.includes("## Firm Facade Activity"), "Markdown must include Firm Facade Activity section");
  assert.ok(
    md.includes("pending human approval"),
    "Markdown must show pending status for request_approval",
  );
  assert.ok(md.includes("_No approvals recorded for this matter._"), "attestations section must show no approvals");
});

test("firmFacadeActivity: a non-facade approvalId receipt (egress/board) DOES still appear in attestations", () => {
  // Sanity check: the kind !== "firm_facade" filter must not over-exclude.
  // A human-approved egress receipt still belongs in attestations.
  const { chain } = freshChainPath();
  chain.append({
    kind: "egress",
    tool: "file_court_document",
    boundary: "COURT_FILING",
    decision: "human",
    outcome: "performed",
    payloadSha256: sha256hex("court-doc"),
    agentId: "agent-1",
    issueId: "POS-502",
    approvalId: "approval-board-3",
  });

  const bundle = assembleSignoffBundle(chain, "POS-502");

  // Egress attestation must appear
  assert.equal(bundle.attestations.length, 1);
  assert.equal(bundle.attestations[0].approvalId, "approval-board-3");

  // firmFacadeActivity must be empty
  assert.equal(bundle.firmFacadeActivity.length, 0);
});

test("firmFacadeActivity: facade create_matter receipt has issueId via matterId defaulting (integration)", () => {
  // Verifies that after the server.ts issueId fix, the receipt chain entry has
  // top-level issueId set from matterId — so assembleSignoffBundle picks it up.
  const { chain } = freshChainPath();

  // Simulate what the server does after the fix: top-level issueId = matterId
  chain.append({
    kind: "firm_facade",
    tool: "create_matter",
    boundary: null,
    decision: null,
    outcome: "performed",
    payloadSha256: sha256hex("create-xyz"),
    issueId: "matter-XYZ",               // defaulted from matterId in server.ts
    meta: { matterId: "matter-XYZ" },
  });

  const bundle = assembleSignoffBundle(chain, "matter-XYZ");

  // Receipt must appear in the per-matter bundle
  assert.equal(bundle.receipts.length, 1);
  assert.equal(bundle.firmFacadeActivity.length, 1);
  assert.equal(bundle.firmFacadeActivity[0].tool, "create_matter");
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
