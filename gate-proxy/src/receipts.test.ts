import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ReceiptChain,
  ReceiptChainCorruptError,
  canonicalJson,
  sha256hex,
  GENESIS,
  type ReceiptBody,
  type ReceiptEntry,
} from "./receipts.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mkBody(overrides: Partial<ReceiptBody> = {}): ReceiptBody {
  return {
    kind: "egress",
    tool: "send_email",
    boundary: "THIRD_PARTY_EGRESS",
    decision: "allow",
    outcome: "performed",
    payloadSha256: sha256hex("test-payload"),
    ...overrides,
  };
}

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "receipts-"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("receipts", () => {
  // 1. Append 5 → verify ok, length 5, head matches last entry
  it("appends 5 entries and verifies the chain", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "receipts.jsonl"));

    const entries: ReceiptEntry[] = [];
    for (let i = 0; i < 5; i++) {
      entries.push(chain.append(mkBody({ outcome: "performed" })));
    }

    const result = chain.verify();
    assert.deepEqual(result, { ok: true, length: 5, head: entries[4].hash });
    assert.equal(chain.head(), entries[4].hash);

    // File must have exactly 5 lines of valid JSON
    const lines = fs.readFileSync(path.join(dir, "receipts.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.trim() !== "");
    assert.equal(lines.length, 5);
    for (const line of lines) {
      const parsed = JSON.parse(line) as ReceiptEntry;
      assert.ok(typeof parsed.seq === "number");
      assert.ok(typeof parsed.hash === "string");
    }
  });

  // 2. Tamper-evidence: change body but leave hash → verify fails at seq 3
  it("detects tampered body via hash mismatch at seq 3", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);

    for (let i = 0; i < 5; i++) {
      chain.append(mkBody({ outcome: i === 2 ? "blocked" : "performed" }));
    }

    // Tamper: change line 3's body outcome but leave hash intact
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const entry3 = JSON.parse(lines[2]) as ReceiptEntry;
    entry3.body.outcome = "performed"; // was "blocked"
    lines[2] = JSON.stringify(entry3);
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const result = chain.verify();
    assert.equal(result.ok, false);
    if (!result.ok) {
      // badSeq is the 1-based LINE INDEX (3 = third line)
      assert.equal(result.badSeq, 3);
      assert.match(result.reason, /hash/i);
    }
  });

  // 3. Linkage: change line 4's prevHash → verify fails at line index 4
  it("detects broken prevHash linkage at seq 4", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);

    for (let i = 0; i < 5; i++) {
      chain.append(mkBody());
    }

    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const entry4 = JSON.parse(lines[3]) as ReceiptEntry;
    entry4.prevHash = "deadbeef".repeat(8); // corrupt prevHash
    lines[3] = JSON.stringify(entry4);
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const result = chain.verify();
    assert.equal(result.ok, false);
    if (!result.ok) {
      // badSeq is the 1-based LINE INDEX (4 = fourth line)
      assert.equal(result.badSeq, 4);
    }
  });

  // 4. Rechain attack + anchor catch: rewrite seqs 3-5 with correct hashes →
  //    verify PASSES (documenting the limit of in-file integrity alone), but
  //    head() differs from anchorBefore — external anchoring is what catches
  //    wholesale rewrites that recompute the chain from scratch.
  it("rechain attack passes verify but head diverges from prior anchor", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);

    for (let i = 0; i < 5; i++) {
      chain.append(mkBody({ outcome: "performed" }));
    }

    // Capture the anchor BEFORE tampering
    const anchorBefore = chain.head();

    // Read existing lines
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const kept = lines.slice(0, 2); // keep seqs 1 and 2

    // Rebuild seqs 3-5 with modified body and correctly recomputed hashes
    let prevEntry = JSON.parse(kept[1]) as ReceiptEntry;
    const rebuilt: string[] = [];
    for (let i = 3; i <= 5; i++) {
      const body = mkBody({ outcome: "blocked" }); // modified outcome
      const ts = new Date().toISOString();
      const hashInput = prevEntry.hash + canonicalJson({ seq: i, ts, body });
      const hash = sha256hex(hashInput);
      const entry: ReceiptEntry = {
        seq: i,
        ts,
        prevHash: prevEntry.hash,
        hash,
        body,
      };
      rebuilt.push(JSON.stringify(entry));
      prevEntry = entry;
    }

    fs.writeFileSync(filePath, [...kept, ...rebuilt].join("\n") + "\n");

    // Rechain passes verify — this documents the limit of in-file integrity
    const result = chain.verify();
    assert.equal(result.ok, true, "rechain must pass verify — this is the known limit");

    // But the head differs from the original anchor — external anchoring catches it
    const newHead = chain.head();
    assert.notEqual(
      newHead,
      anchorBefore,
      "head must diverge: external anchor is what makes rechain detectable",
    );
  });

  // 5. Durability/restart: chain A appends 2, new ReceiptChain appends 1 → length 3, seqs 1,2,3
  it("resumes correctly after restart with correct seq numbering", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");

    const chainA = new ReceiptChain(filePath);
    chainA.append(mkBody());
    chainA.append(mkBody());

    const chainB = new ReceiptChain(filePath);
    chainB.append(mkBody());

    const result = chainB.verify();
    assert.deepEqual(result, { ok: true, length: 3, head: chainB.head() });

    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const seqs = lines.map((l) => (JSON.parse(l) as ReceiptEntry).seq);
    assert.deepEqual(seqs, [1, 2, 3]);
  });

  // 6. canonicalJson: sorted keys recursively; arrays preserve order
  it("canonicalJson sorts object keys recursively and preserves array order", () => {
    const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
    const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
    assert.equal(a, b);

    // Arrays preserve insertion order
    const arr = canonicalJson([3, 1, 2]);
    assert.equal(arr, "[3,1,2]");
  });

  // 7. Constructor creates nested parent dirs; missing file verify → ok, length 0
  it("creates nested parent dirs and verifies empty/missing file as ok length 0", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "nested", "deep", "receipts.jsonl");

    const chain = new ReceiptChain(filePath);
    const result = chain.verify();
    assert.deepEqual(result, { ok: true, length: 0, head: GENESIS });
    assert.equal(chain.head(), GENESIS);
    // File not yet created (lazy)
    assert.equal(fs.existsSync(filePath), false);
  });

  // 8. anchorText contains head hash and length=<n> token (M1)
  it("anchorText contains head hash and chain length", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "receipts.jsonl"));
    chain.append(mkBody());
    chain.append(mkBody());

    const text = chain.anchorText();
    const h = chain.head();
    assert.ok(text.includes(h), "anchorText must contain the head hash");
    assert.ok(text.includes("length=2"), "anchorText must contain the literal token length=2");
  });

  // C1(a): append with meta containing a Date value → verify ok (hash/persist parity)
  it("append with meta: {when: new Date()} → verify ok", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "receipts.jsonl"));
    const body = mkBody({ meta: { when: new Date("2025-01-01T00:00:00.000Z") } });
    chain.append(body);
    const result = chain.verify();
    assert.equal(result.ok, true, `verify must pass but got: ${JSON.stringify(result)}`);
  });

  // C1(b): append with agentId: undefined → verify ok (undefined dropped by JSON normalize)
  it("append with agentId: undefined → verify ok", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "receipts.jsonl"));
    const body = mkBody({ agentId: undefined });
    chain.append(body);
    const result = chain.verify();
    assert.equal(result.ok, true, `verify must pass but got: ${JSON.stringify(result)}`);
  });

  // I1(a): last line is {} → append throws ReceiptChainCorruptError and does NOT write
  it("last line is {} → append throws ReceiptChainCorruptError and does not write", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    // Seed one valid entry then append a corrupt tail line
    const chain = new ReceiptChain(filePath);
    chain.append(mkBody());
    fs.appendFileSync(filePath, "{}\n", "utf8");

    const linesBefore = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).length;

    assert.throws(
      () => chain.append(mkBody()),
      (err: unknown) => {
        assert.ok(err instanceof ReceiptChainCorruptError, `expected ReceiptChainCorruptError, got ${err}`);
        return true;
      },
    );

    // File must NOT have grown (bad write was not performed)
    const linesAfter = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean).length;
    assert.equal(linesAfter, linesBefore, "file must not grow when append throws");
  });

  // I1(b): last line is a partial JSON fragment → append throws ReceiptChainCorruptError
  it("last line is partial JSON fragment → append throws ReceiptChainCorruptError", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);
    chain.append(mkBody());
    fs.appendFileSync(filePath, '{"seq":2,"ts":"2025\n', "utf8"); // truncated mid-write

    assert.throws(
      () => chain.append(mkBody()),
      (err: unknown) => {
        assert.ok(err instanceof ReceiptChainCorruptError, `expected ReceiptChainCorruptError, got ${err}`);
        return true;
      },
    );
  });

  // I2: head() throws ReceiptChainCorruptError on corrupt tail (not valid JSON)
  it("head() throws ReceiptChainCorruptError when last line is unparseable", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);
    chain.append(mkBody());
    fs.appendFileSync(filePath, "NOT_JSON\n", "utf8");

    assert.throws(
      () => chain.head(),
      (err: unknown) => {
        assert.ok(err instanceof ReceiptChainCorruptError, `expected ReceiptChainCorruptError, got ${err}`);
        return true;
      },
    );
  });

  // anchorText: corrupt last line → ReceiptChainCorruptError instead of SyntaxError
  it("anchorText() throws ReceiptChainCorruptError when last line is corrupt", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);
    chain.append(mkBody());
    fs.appendFileSync(filePath, "NOT_JSON_CORRUPT\n", "utf8");

    assert.throws(
      () => chain.anchorText(),
      (err: unknown) => {
        assert.ok(
          err instanceof ReceiptChainCorruptError,
          `expected ReceiptChainCorruptError, got ${String(err)}`,
        );
        return true;
      },
    );
  });

  // entries(): parses all lines into ReceiptEntry array
  it("entries() returns all entries in the chain", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "receipts.jsonl"));
    chain.append(mkBody({ outcome: "performed" }));
    chain.append(mkBody({ outcome: "blocked" }));
    chain.append(mkBody({ outcome: "pending", approvalId: "A1" }));

    const all = chain.entries();
    assert.equal(all.length, 3);
    assert.equal(all[0].body.outcome, "performed");
    assert.equal(all[1].body.outcome, "blocked");
    assert.equal(all[2].body.outcome, "pending");
    assert.equal(all[2].body.approvalId, "A1");
  });

  // entries(): corrupt line → ReceiptChainCorruptError
  it("entries() throws ReceiptChainCorruptError on corrupt line", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);
    chain.append(mkBody());
    fs.appendFileSync(filePath, "CORRUPT_LINE\n", "utf8");

    assert.throws(
      () => chain.entries(),
      (err: unknown) => {
        assert.ok(err instanceof ReceiptChainCorruptError, `expected ReceiptChainCorruptError, got ${String(err)}`);
        return true;
      },
    );
  });

  // M2: verify() reports 1-based line index for a tampered entry claiming a wrong seq
  it("verify() reports 1-based line index for all failure kinds (not entry-claimed seq)", () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "receipts.jsonl");
    const chain = new ReceiptChain(filePath);
    for (let i = 0; i < 3; i++) chain.append(mkBody());

    // Tamper line 2: claim seq=999 (far from actual position)
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const entry2 = JSON.parse(lines[1]) as ReceiptEntry;
    entry2.seq = 999;
    lines[1] = JSON.stringify(entry2);
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const result = chain.verify();
    assert.equal(result.ok, false);
    if (!result.ok) {
      // Must report line index 2 (actual position), not 999 (claimed seq)
      assert.equal(result.badSeq, 2, `badSeq should be line index 2, got ${result.badSeq}`);
    }
  });
});
