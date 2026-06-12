import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { BoundaryType, Decision } from "./types.ts";

// ---------------------------------------------------------------------------
// Re-exported types from types.ts used in ReceiptBody
// ---------------------------------------------------------------------------

export type { BoundaryType, Decision };

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ReceiptOutcome =
  | "performed"
  | "anonymized_performed"
  | "pending"
  | "blocked"
  | "error";

export interface ReceiptBody {
  kind: "egress" | "anchor";
  tool: string;
  boundary: BoundaryType | null;
  decision: Decision | null;
  outcome: ReceiptOutcome;
  agentId?: string;
  issueId?: string;
  approvalId?: string;
  payloadSha256: string;
  meta?: Record<string, unknown>;
}

export interface ReceiptEntry {
  seq: number;
  ts: string;
  prevHash: string;
  hash: string;
  body: ReceiptBody;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const GENESIS = "GENESIS";

// ---------------------------------------------------------------------------
// canonicalJson: deterministic JSON with sorted keys (recursive); arrays keep order
// ---------------------------------------------------------------------------

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const sorted = Object.keys(obj)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k]))
    .join(",");
  return "{" + sorted + "}";
}

// ---------------------------------------------------------------------------
// sha256hex: SHA-256 of a UTF-8 string, returned as lowercase hex
// ---------------------------------------------------------------------------

export function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Read the last non-empty line from a file. Returns null if file is absent or empty. */
function readLastLine(filePath: string): string | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

/** Read all non-empty lines from a file. Returns [] if absent or empty. */
function readAllLines(filePath: string): string[] {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  return raw.split("\n").filter((l) => l.trim() !== "");
}

/** Compute the hash for a receipt entry. */
function computeHash(prevHash: string, seq: number, ts: string, body: ReceiptBody): string {
  const content = canonicalJson({ seq, ts, body });
  return sha256hex(prevHash + content);
}

// ---------------------------------------------------------------------------
// ReceiptChain
// ---------------------------------------------------------------------------

export class ReceiptChain {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    // Eagerly create parent directories; file itself is created lazily on first append
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Append a new receipt. Derives seq and prevHash from the LAST LINE OF THE FILE
   * so the chain survives restarts without any in-memory state.
   */
  append(body: ReceiptBody): ReceiptEntry {
    const lastLine = readLastLine(this.filePath);

    let seq: number;
    let prevHash: string;

    if (lastLine === null) {
      seq = 1;
      prevHash = GENESIS;
    } else {
      const last = JSON.parse(lastLine) as ReceiptEntry;
      seq = last.seq + 1;
      prevHash = last.hash;
    }

    const ts = new Date().toISOString();
    const hash = computeHash(prevHash, seq, ts, body);

    const entry: ReceiptEntry = { seq, ts, prevHash, hash, body };
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + "\n", "utf8");
    return entry;
  }

  /**
   * Verify the full chain from genesis.
   * - Empty / missing file → { ok: true, length: 0, head: GENESIS }
   * - Malformed line → { ok: false, badSeq: lineNumber, reason: "unparseable" }
   * - Seq not monotonic from 1 → { ok: false, badSeq: <seq>, reason: "..." }
   * - Hash mismatch → { ok: false, badSeq: <seq>, reason: "hash mismatch" }
   * - prevHash linkage break → { ok: false, badSeq: <seq>, reason: "prevHash mismatch" }
   */
  verify():
    | { ok: true; length: number; head: string }
    | { ok: false; badSeq: number; reason: string } {
    const lines = readAllLines(this.filePath);

    if (lines.length === 0) {
      return { ok: true, length: 0, head: GENESIS };
    }

    let prevHash = GENESIS;
    let expectedSeq = 1;

    for (let i = 0; i < lines.length; i++) {
      let entry: ReceiptEntry;
      try {
        entry = JSON.parse(lines[i]) as ReceiptEntry;
      } catch {
        return { ok: false, badSeq: i + 1, reason: "unparseable" };
      }

      if (entry.seq !== expectedSeq) {
        return {
          ok: false,
          badSeq: entry.seq,
          reason: `seq out of order: expected ${expectedSeq}, got ${entry.seq}`,
        };
      }

      if (entry.prevHash !== prevHash) {
        return {
          ok: false,
          badSeq: entry.seq,
          reason: `prevHash mismatch at seq ${entry.seq}`,
        };
      }

      const expected = computeHash(prevHash, entry.seq, entry.ts, entry.body);
      if (entry.hash !== expected) {
        return {
          ok: false,
          badSeq: entry.seq,
          reason: `hash mismatch at seq ${entry.seq}`,
        };
      }

      prevHash = entry.hash;
      expectedSeq++;
    }

    return { ok: true, length: lines.length, head: prevHash };
  }

  /** Returns the hash of the last entry, or GENESIS if the chain is empty. */
  head(): string {
    const lastLine = readLastLine(this.filePath);
    if (lastLine === null) return GENESIS;
    try {
      const entry = JSON.parse(lastLine) as ReceiptEntry;
      return entry.hash;
    } catch {
      return GENESIS;
    }
  }

  /**
   * Human-readable anchor text for a paperclip comment.
   * Contains: head hash, chain length, ts of last entry, file path.
   */
  anchorText(): string {
    const lines = readAllLines(this.filePath);
    if (lines.length === 0) {
      return `Receipt chain anchor: head=${GENESIS} length=0 file=${this.filePath}`;
    }
    const last = JSON.parse(lines[lines.length - 1]) as ReceiptEntry;
    return (
      `Receipt chain anchor: head=${last.hash} length=${lines.length} ` +
      `lastTs=${last.ts} file=${this.filePath}`
    );
  }
}
