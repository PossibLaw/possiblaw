// gate-proxy/src/verify-tool.test.ts
//
// Cross-checks the standalone verifier (tools/verify-receipts.mjs) against the
// producer (ReceiptChain). The tool is a deliberately independent
// reimplementation — it shares no code with src/ — so these tests are what
// stop the two from drifting. If they ever disagree, either the spec in
// docs/receipt-verification.md is wrong or one side has a bug.
//
// The tool is also exercised as a SUBPROCESS with plain `node`, no tsx and no
// installed dependencies, because that is exactly how a recipient of a chain
// would run it.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { ReceiptChain } from "./receipts.ts";

const TOOL = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "tools", "verify-receipts.mjs");

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "verify-tool-"));
}

/** Run the verifier exactly as a recipient would. */
function runTool(file: string, extra: string[] = []): { code: number; out: string } {
  try {
    const out = execFileSync("node", [TOOL, file, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    return { code: e.status ?? -1, out: e.stdout ?? "" };
  }
}

function makeChain(dir: string, companyId?: string): ReceiptChain {
  const chain = new ReceiptChain(path.join(dir, "receipts.jsonl"), companyId);
  chain.append({
    kind: "egress",
    tool: "send_email",
    boundary: "THIRD_PARTY_EGRESS",
    decision: "human",
    outcome: "performed",
    payloadSha256: "a".repeat(64),
    agentId: "agent-1",
    issueId: "POS-42",
    meta: { zeta: 1, alpha: { nested: [3, 1, 2] }, mid: "x" },
  });
  chain.append({
    kind: "quality",
    tool: "citation",
    boundary: null,
    decision: null,
    outcome: "performed",
    payloadSha256: "b".repeat(64),
  });
  return chain;
}

describe("standalone verifier", () => {
  it("agrees with the producer on a valid chain", () => {
    const dir = tmpDir();
    const chain = makeChain(dir);
    const file = path.join(dir, "receipts.jsonl");

    const internal = chain.verify();
    assert.equal(internal.ok, true);

    const { code, out } = runTool(file);
    assert.equal(code, 0, out);
    assert.match(out, /OK: 2 receipt\(s\) verified/);
    // Both implementations must land on the same head hash.
    assert.ok(internal.ok === true);
    assert.match(out, new RegExp(`head: ${internal.head}`));
  });

  it("reports an empty chain as valid with the genesis head", () => {
    const dir = tmpDir();
    const file = path.join(dir, "receipts.jsonl");
    fs.writeFileSync(file, "", "utf8");
    const { code, out } = runTool(file);
    assert.equal(code, 0, out);
    assert.match(out, /OK: 0 receipt\(s\)/);
    assert.match(out, /head: GENESIS/);
  });

  it("detects an altered receipt body", () => {
    const dir = tmpDir();
    makeChain(dir);
    const file = path.join(dir, "receipts.jsonl");

    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    const tampered = JSON.parse(lines[0] as string);
    tampered.body.payloadSha256 = "c".repeat(64); // rewrite what was sent
    lines[0] = JSON.stringify(tampered);
    fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");

    const { code, out } = runTool(file);
    assert.equal(code, 1);
    assert.match(out, /FAILED: line 1/);
    assert.match(out, /hash mismatch/);
  });

  it("detects a removed line", () => {
    const dir = tmpDir();
    makeChain(dir);
    const file = path.join(dir, "receipts.jsonl");

    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    fs.writeFileSync(file, (lines[1] as string) + "\n", "utf8"); // drop the first
    const { code, out } = runTool(file);
    assert.equal(code, 1);
    assert.match(out, /FAILED: line 1/);
    assert.match(out, /seq out of order/);
  });

  it("detects a re-hashed entry whose prevHash no longer links", () => {
    const dir = tmpDir();
    makeChain(dir);
    const file = path.join(dir, "receipts.jsonl");

    // The subtle attack: alter an entry AND fix its own hash, leaving the
    // chain linkage broken at the next entry.
    const lines = fs.readFileSync(file, "utf8").trim().split("\n");
    const first = JSON.parse(lines[0] as string);
    first.body.agentId = "agent-impostor";
    // Recompute this entry's own hash the way the producer would.
    const canonical = (v: unknown): string => {
      if (v === null || typeof v !== "object") return JSON.stringify(v);
      if (Array.isArray(v)) return "[" + v.map(canonical).join(",") + "]";
      const o = v as Record<string, unknown>;
      return (
        "{" +
        Object.keys(o).sort().map((k) => JSON.stringify(k) + ":" + canonical(o[k])).join(",") +
        "}"
      );
    };
    first.hash = crypto
      .createHash("sha256")
      .update(first.prevHash + canonical({ seq: first.seq, ts: first.ts, body: first.body }), "utf8")
      .digest("hex");
    lines[0] = JSON.stringify(first);
    fs.writeFileSync(file, lines.join("\n") + "\n", "utf8");

    const { code, out } = runTool(file);
    assert.equal(code, 1);
    // Entry 1 now self-verifies, so the break surfaces at entry 2.
    assert.match(out, /FAILED: line 2/);
    assert.match(out, /prevHash mismatch/);
  });

  it("enforces expected company custody when asked", () => {
    const dir = tmpDir();
    makeChain(dir, "co-real");
    const file = path.join(dir, "receipts.jsonl");

    assert.equal(runTool(file, ["--company", "co-real"]).code, 0);
    const wrong = runTool(file, ["--company", "co-other"]);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /companyId does not match/);
  });

  it("says plainly when a chain has no external timestamp", () => {
    const dir = tmpDir();
    makeChain(dir);
    const { out } = runTool(path.join(dir, "receipts.jsonl"));
    assert.match(out, /No external timestamps in this chain/);
    assert.match(out, /nothing binds it to a time outside the operator's own systems/);
  });

  it("surfaces external timestamps and how to check them", () => {
    const dir = tmpDir();
    const chain = makeChain(dir);
    chain.append({
      kind: "anchor",
      tool: "anchor",
      boundary: null,
      decision: null,
      outcome: "performed",
      payloadSha256: "d".repeat(64),
      meta: {
        tsa: {
          url: "https://tsa.example/tsr",
          status: 0,
          tokenSha256: "e".repeat(64),
          anchorTextSha256: "f".repeat(64),
        },
      },
    });

    const { code, out } = runTool(path.join(dir, "receipts.jsonl"));
    assert.equal(code, 0, out);
    assert.match(out, /1 external timestamp\(s\) found/);
    assert.match(out, /openssl ts -verify/);
    assert.match(out, new RegExp("e".repeat(64)));
  });

  it("emits machine-readable output under --json", () => {
    const dir = tmpDir();
    const chain = makeChain(dir);
    const internal = chain.verify();
    assert.ok(internal.ok === true);

    const { code, out } = runTool(path.join(dir, "receipts.jsonl"), ["--json"]);
    assert.equal(code, 0);
    const parsed = JSON.parse(out) as Record<string, unknown>;
    assert.equal(parsed["ok"], true);
    assert.equal(parsed["length"], 2);
    assert.equal(parsed["head"], internal.head);
  });

  it("exits 2 on an unreadable file rather than reporting a verdict", () => {
    const { code, out } = runTool(path.join(tmpDir(), "missing.jsonl"));
    assert.equal(code, 2);
    assert.match(out, /cannot read/);
  });
});
