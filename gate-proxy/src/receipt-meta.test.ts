// gate-proxy/src/receipt-meta.test.ts
//
// A3 — receipt `meta` carries ids, enums and hashes, never content.
//
// docs/receipt-verification.md tells third parties this is true. Before A3 it
// was enforced by a code comment. These tests make it an invariant of append().
// The check is structural, not semantic: it cannot tell a client name from an
// agent id and does not try. It defeats the realistic failure — a caller
// dropping a document, prompt, or email body into meta on an artifact that is
// designed to be handed to outsiders.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ReceiptChain,
  ReceiptMetaError,
  assertMetaSafe,
  assertMetaSize,
  META_MAX_BYTES,
  META_MAX_STRING,
  META_MAX_DEPTH,
} from "./receipts.ts";
import type { ReceiptBody } from "./receipts.ts";

function chain(): ReceiptChain {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-meta-"));
  return new ReceiptChain(path.join(dir, "receipts.jsonl"));
}

function body(meta?: Record<string, unknown>): ReceiptBody {
  return {
    kind: "egress",
    tool: "send_email",
    boundary: "THIRD_PARTY_EGRESS",
    decision: "human",
    outcome: "performed",
    payloadSha256: "a".repeat(64),
    ...(meta !== undefined ? { meta } : {}),
  };
}

describe("receipt meta validation", () => {
  it("accepts the shapes real writers actually use", () => {
    const c = chain();
    // Drawn from live call sites: reason codes, digests, flags, nested tsa block.
    assert.doesNotThrow(() =>
      c.append(
        body({
          reason: "citation_gate_unverified",
          enforcementDigest: "b".repeat(64),
          claimedConfidentiality: "privileged",
          dispatchReservation: true,
          unbackedCitations: 3,
          trustedFirmWorkspace: true,
          tsa: {
            url: "https://freetsa.org/tsr",
            status: 0,
            tokenSha256: "c".repeat(64),
            anchorTextSha256: "d".repeat(64),
          },
        }),
      ),
    );
  });

  it("accepts a receipt with no meta at all", () => {
    assert.doesNotThrow(() => chain().append(body()));
  });

  it("rejects a document body pasted into meta", () => {
    const c = chain();
    assert.throws(
      () => c.append(body({ draft: "The Seller shall indemnify ".repeat(100) })),
      ReceiptMetaError,
    );
  });

  it("names the offending path so the caller can find it", () => {
    try {
      chain().append(body({ outer: { inner: "x".repeat(META_MAX_STRING + 1) } }));
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err instanceof ReceiptMetaError);
      assert.match(err.message, /meta\.outer\.inner/);
      assert.match(err.message, /Store a sha256 instead/);
    }
  });

  it("allows a string exactly at the limit and rejects one byte more", () => {
    assert.doesNotThrow(() => assertMetaSafe({ k: "x".repeat(META_MAX_STRING) }));
    assert.throws(() => assertMetaSafe({ k: "x".repeat(META_MAX_STRING + 1) }), ReceiptMetaError);
  });

  it("rejects many short strings that together exceed the size cap", () => {
    // Each value passes the per-string rule; the aggregate must still fail, or
    // the cap is trivially evaded by chunking.
    const meta: Record<string, string> = {};
    for (let i = 0; i < 40; i += 1) meta[`k${i}`] = "y".repeat(200);
    assert.doesNotThrow(() => assertMetaSafe(meta), "per-string rule passes");
    assert.throws(() => assertMetaSize(meta), ReceiptMetaError, "aggregate rule catches it");
    assert.throws(() => chain().append(body(meta)), ReceiptMetaError);
  });

  it("rejects nesting beyond the depth bound", () => {
    let nested: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < META_MAX_DEPTH + 2; i += 1) nested = { down: nested };
    assert.throws(() => assertMetaSafe(nested), ReceiptMetaError);
  });

  it("walks into arrays", () => {
    assert.doesNotThrow(() => assertMetaSafe({ ids: ["POS-1", "POS-2"] }));
    assert.throws(
      () => assertMetaSafe({ blobs: ["ok", "z".repeat(META_MAX_STRING + 1)] }),
      ReceiptMetaError,
    );
  });

  it("nothing is written when meta is rejected", () => {
    const c = chain();
    c.append(body({ reason: "ok" }));
    const before = c.entries().length;
    assert.throws(() => c.append(body({ leak: "q".repeat(5000) })), ReceiptMetaError);
    assert.equal(c.entries().length, before, "the rejected receipt must not land");
    // And the chain is still valid — a rejected append leaves no partial entry.
    assert.equal(c.verify().ok, true);
  });

  it("the caps are the documented values", () => {
    assert.equal(META_MAX_BYTES, 4096);
    assert.equal(META_MAX_STRING, 512);
    assert.equal(META_MAX_DEPTH, 8);
  });
});
