#!/usr/bin/env node
//
// verify-receipts.mjs — independent verifier for a PossibLaw receipt chain.
//
// This file is deliberately standalone: plain ES modules, Node's bundled
// crypto, no imports from the gate proxy and no packages to install. Anyone
// handed a receipts.jsonl can check it without running, trusting, or even
// possessing our code. That is the point — a chain you can only verify with
// the producer's software is still the producer's word.
//
// The algorithm it implements is specified in docs/receipt-verification.md.
// If the two ever disagree, the spec is wrong: this file and the gate proxy
// are checked against each other by gate-proxy/src/verify-tool.test.ts.
//
// Usage:
//   node verify-receipts.mjs <receipts.jsonl> [--company <id>] [--json]
//
// Exit codes:
//   0  chain verified
//   1  chain invalid (details on stdout)
//   2  usage or I/O error

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const GENESIS = "GENESIS";

// ---------------------------------------------------------------------------
// Canonical JSON — keys sorted recursively, array order preserved.
//
// Must match the producer byte for byte. Note that entries on disk have
// already been through a JSON round trip, so `undefined` can never appear
// here; every value is a JSON value.
// ---------------------------------------------------------------------------

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  return (
    "{" +
    Object.keys(value)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k]))
      .join(",") +
    "}"
  );
}

const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

/** hash = SHA-256( prevHash || canonicalJson({seq, ts, body}) ), lowercase hex. */
function computeHash(prevHash, seq, ts, body) {
  return sha256hex(prevHash + canonicalJson({ seq, ts, body }));
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function verifyChain(text, opts = {}) {
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) return { ok: true, length: 0, head: GENESIS, anchors: [], traceBound: 0 };

  let prevHash = GENESIS;
  let expectedSeq = 1;
  const anchors = [];
  let traceBound = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = i + 1;
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      return { ok: false, badLine: line, reason: "unparseable JSON" };
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, badLine: line, reason: "entry is not an object" };
    }
    if (!Number.isInteger(entry.seq) || entry.seq !== expectedSeq) {
      return {
        ok: false,
        badLine: line,
        reason: `seq out of order: expected ${expectedSeq}, got ${String(entry.seq)}`,
      };
    }
    if (typeof entry.hash !== "string" || !/^[0-9a-f]{64}$/.test(entry.hash)) {
      return { ok: false, badLine: line, reason: "hash is not 64-char lowercase hex" };
    }
    if (entry.prevHash !== prevHash) {
      return {
        ok: false,
        badLine: line,
        reason: `prevHash mismatch at seq ${entry.seq} (chain is broken or a line was removed)`,
      };
    }
    if (opts.companyId !== undefined && entry.body?.companyId !== opts.companyId) {
      return {
        ok: false,
        badLine: line,
        reason: `companyId does not match expected custody '${opts.companyId}'`,
      };
    }
    const expected = computeHash(prevHash, entry.seq, entry.ts, entry.body);
    if (entry.hash !== expected) {
      return {
        ok: false,
        badLine: line,
        reason: `hash mismatch at seq ${entry.seq} (this entry was altered)`,
      };
    }

    if (typeof entry.body?.traceId === "string" && entry.body.traceId !== "") traceBound += 1;

    // Surface external timestamps so the operator knows what else to check.
    if (entry.body?.kind === "anchor" && entry.body?.meta?.tsa) {
      anchors.push({ seq: entry.seq, ts: entry.ts, ...entry.body.meta.tsa });
    }

    prevHash = entry.hash;
    expectedSeq += 1;
  }

  return { ok: true, length: lines.length, head: prevHash, anchors, traceBound };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const asJson = args.includes("--json");
  const companyIdx = args.indexOf("--company");
  const companyId = companyIdx !== -1 ? args[companyIdx + 1] : undefined;

  if (!file || args.includes("--help") || args.includes("-h")) {
    process.stdout.write(
      "Usage: node verify-receipts.mjs <receipts.jsonl> [--company <id>] [--json]\n",
    );
    return file ? 0 : 2;
  }

  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    process.stdout.write(`cannot read ${file}: ${err.code ?? "error"}\n`);
    return 2;
  }

  const result = verifyChain(text, companyId !== undefined ? { companyId } : {});

  if (asJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return result.ok ? 0 : 1;
  }

  if (!result.ok) {
    process.stdout.write(
      `FAILED: line ${result.badLine}: ${result.reason}\n\n` +
        "A break means the file was altered or truncated after it was written.\n" +
        "Everything BEFORE this line still verifies on its own terms.\n",
    );
    return 1;
  }

  process.stdout.write(
    `OK: ${result.length} receipt(s) verified\nhead: ${result.head}\n`,
  );

  if (result.traceBound > 0) {
    process.stdout.write(
      `\n${result.traceBound} receipt(s) reference an execution trace.\n` +
        "Those traces are NOT in this file — they are content-bearing and stay\n" +
        "inside the firm. Each traceSha256 here commits to one, so a trace\n" +
        "produced later can be checked against this chain, but their absence is\n" +
        "expected and is not a gap in what you were given.\n",
    );
  }

  if (result.anchors.length > 0) {
    process.stdout.write(
      `\n${result.anchors.length} external timestamp(s) found. The chain above is\n` +
        "internally consistent; these prove it also existed at a given time.\n" +
        "Verify each token against a trusted TSA certificate:\n\n",
    );
    for (const a of result.anchors) {
      process.stdout.write(
        `  seq ${a.seq} (${a.ts}) via ${a.url}\n` +
          `    openssl ts -verify -in ${a.tokenSha256}.tsr \\\n` +
          `      -queryfile ${a.tokenSha256}.tsr.tsq -CAfile <tsa-ca>.pem\n`,
      );
    }
  } else {
    process.stdout.write(
      "\nNo external timestamps in this chain. It is internally consistent,\n" +
        "but nothing binds it to a time outside the operator's own systems.\n",
    );
  }
  return 0;
}

// Run only when invoked directly, so the verifier can also be imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv));
}
