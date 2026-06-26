import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { ReceiptChain, ReceiptChainCorruptError } from "../receipts.ts";
import { AuthorityRegistry } from "./authority-registry.ts";
import { comparableCitation, documentSha256, extractCitations } from "../citations.ts";

function freshChain(): { chain: ReceiptChain; filePath: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-authority-test-"));
  const filePath = path.join(dir, "receipts.jsonl");
  return { chain: new ReceiptChain(filePath), filePath };
}

const ROE_BODY = "We therefore conclude that the right of personal privacy includes the abortion decision.";
const ROE_SHA = documentSha256(ROE_BODY);

// ---------------------------------------------------------------------------
// register -> hasCitation
// ---------------------------------------------------------------------------

test("register a retrieved authority -> hasCitation returns true (normalized)", () => {
  const { chain } = freshChain();
  const reg = new AuthorityRegistry(chain);
  const r = reg.register({
    citation: "Roe v. Wade, 410 U.S. 113 (1973)",
    sha256: ROE_SHA,
    source: "courtlistener",
    sourceUrl: "https://www.courtlistener.com/opinion/108713/roe-v-wade/",
    retrievedAt: "2026-06-26T12:00:00.000Z",
  });
  assert.equal(r.ok, true);
  // The registration string is a full reference; the registry indexes by the
  // EXTRACTED citation token (what the gate sees in an outbound filing).
  assert.equal(r.normalizedCitation, comparableCitation(extractCitations("Roe v. Wade, 410 U.S. 113 (1973)")[0]));
  assert.equal(reg.hasCitation("410 U.S. 113"), true);

  // a performed authority_provenance quality receipt was appended; no body text
  const last = chain.entries().at(-1)!;
  assert.equal(last.body.kind, "quality");
  assert.equal(last.body.tool, "authority_provenance");
  assert.equal(last.body.outcome, "performed");
  assert.equal(last.body.payloadSha256, ROE_SHA);
  assert.equal(JSON.stringify(last.body).includes("personal privacy"), false);
});

test("hasCitation is spacing-insensitive (register compact, query spaced)", () => {
  const { chain } = freshChain();
  const reg = new AuthorityRegistry(chain);
  reg.register({ citation: "410 U.S. 113", sha256: ROE_SHA, source: "courtlistener" });
  // the gate extractor returns the as-matched spaced form "410 U. S. 113"
  assert.equal(reg.hasCitation("410 U. S. 113"), true);
});

// ---------------------------------------------------------------------------
// verifyDocument — partition cited into backed / unbacked
// ---------------------------------------------------------------------------

test("verifyDocument flags an un-retrieved cite as unbacked while a retrieved one is backed", () => {
  const { chain } = freshChain();
  const reg = new AuthorityRegistry(chain);
  // Only Roe was retrieved.
  reg.register({ citation: "Roe v. Wade, 410 U.S. 113 (1973)", sha256: ROE_SHA, source: "courtlistener" });

  const doc = "We rely on 410 U.S. 113 and also on 384 U.S. 436, which was never fetched.";
  const result = reg.verifyDocument(doc);

  assert.deepEqual(result.citations, ["410 U.S. 113", "384 U.S. 436"]);
  assert.deepEqual(result.backed, ["410 U.S. 113"]);
  assert.deepEqual(result.unbacked, ["384 U.S. 436"]);
});

test("verifyDocument: a document with no citations has nothing backed or unbacked", () => {
  const { chain } = freshChain();
  const reg = new AuthorityRegistry(chain);
  const result = reg.verifyDocument("No legal citations here at all.");
  assert.deepEqual(result.citations, []);
  assert.deepEqual(result.backed, []);
  assert.deepEqual(result.unbacked, []);
});

test("verifyDocument: all cites retrieved -> zero unbacked", () => {
  const { chain } = freshChain();
  const reg = new AuthorityRegistry(chain);
  reg.register({ citation: "410 U.S. 113", sha256: ROE_SHA, source: "courtlistener" });
  reg.register({ citation: "384 U.S. 436", sha256: documentSha256("Miranda body"), source: "courtlistener" });
  const result = reg.verifyDocument("See 410 U.S. 113 and 384 U.S. 436.");
  assert.deepEqual(result.unbacked, []);
  assert.equal(result.backed.length, 2);
});

// ---------------------------------------------------------------------------
// rebuild-from-chain
// ---------------------------------------------------------------------------

test("rebuild from chain: a fresh registry over the same chain still hasCitation()", () => {
  const { chain } = freshChain();
  new AuthorityRegistry(chain).register({
    citation: "Roe v. Wade, 410 U.S. 113 (1973)",
    sha256: ROE_SHA,
    source: "courtlistener",
  });
  const rebuilt = new AuthorityRegistry(chain);
  assert.equal(rebuilt.hasCitation("410 U.S. 113"), true);
});

// ---------------------------------------------------------------------------
// corrupt chain — fail-closed
// ---------------------------------------------------------------------------

test("corrupt chain: constructor succeeds, hasCitation false, register throws ReceiptChainCorruptError", () => {
  const { chain, filePath } = freshChain();

  // Build a valid chain with one registration.
  new AuthorityRegistry(chain).register({
    citation: "Roe v. Wade, 410 U.S. 113 (1973)",
    sha256: ROE_SHA,
    source: "courtlistener",
  });

  // Tamper the first line's body but leave the stored hash intact → verify() fails.
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const entry = JSON.parse(lines[0]) as import("../receipts.ts").ReceiptEntry;
  entry.body.outcome = entry.body.outcome === "performed" ? "blocked" : "performed";
  lines[0] = JSON.stringify(entry);
  fs.writeFileSync(filePath, lines.join("\n") + "\n");

  // Phase 1 posture: constructor must NOT throw.
  const reg = new AuthorityRegistry(chain);

  // fail-closed: nothing is retrieved over a corrupt chain.
  assert.equal(reg.hasCitation("410 U.S. 113"), false);
  // verifyDocument marks everything unbacked over a corrupt chain.
  const v = reg.verifyDocument("See 410 U.S. 113.");
  assert.deepEqual(v.unbacked, ["410 U.S. 113"]);

  // register() must throw ReceiptChainCorruptError.
  assert.throws(
    () => reg.register({ citation: "410 U.S. 113", sha256: ROE_SHA, source: "courtlistener" }),
    (err: unknown) => {
      assert.ok(err instanceof ReceiptChainCorruptError, `expected ReceiptChainCorruptError, got ${String(err)}`);
      return true;
    },
  );
});
