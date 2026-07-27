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
  | "reserved"
  | "performed"
  | "anonymized_performed"
  | "pending"
  | "blocked"
  | "error";

export interface ReceiptBody {
  kind: "egress" | "anchor" | "quality" | "firm_facade" | "deadline" | "authorization";
  companyId?: string;
  tool: string;
  boundary: BoundaryType | null;
  decision: Decision | null;
  outcome: ReceiptOutcome;
  agentId?: string;
  issueId?: string;
  approvalId?: string;
  /** Stable digest correlating a dispatch reservation with its terminal receipt. */
  operationId?: string;
  /**
   * M2 — binding to the execution trace for this action.
   *
   * `traceId` locates the record in the trace store; `traceSha256` is the hash
   * of that record's captured content. Together they prove a trace exists and
   * has not been altered, while the receipt itself carries none of it — the
   * receipt travels, the privileged text does not.
   *
   * The binding survives a retention purge: purging strips the content but
   * keeps the record and its `contentSha256`, so `traceSha256` still resolves
   * for the life of the matter.
   */
  traceId?: string;
  traceSha256?: string;
  payloadSha256: string;
  /**
   * Caller-supplied audit metadata. Receipts persist meta verbatim via
   * JSON round-trip normalization (Dates → ISO strings, undefined fields
   * dropped). Callers MUST NOT place payload fragments or privileged text
   * here; payload is represented by payloadSha256 only.
   */
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
// ReceiptChainCorruptError: thrown when the persisted tail is unreadable or
// has an invalid shape. Recovery procedure: inspect the file at the reported
// path, truncate or remove the corrupt tail line, and re-anchor the chain
// from the last valid entry (or from GENESIS if the file is empty).
// ---------------------------------------------------------------------------

export class ReceiptChainCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptChainCorruptError";
  }
}

/**
 * A caller tried to put something payload-shaped into receipt `meta`.
 *
 * A2 published docs/receipt-verification.md, which tells third parties that a
 * receipt carries identifiers, enumerations and hashes only. That promise was
 * a convention enforced by code comments; this error makes it an invariant.
 * Receipts are designed to travel, so the cost of a leak here is a privileged
 * fragment in an artifact handed to opposing counsel.
 */
export class ReceiptMetaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptMetaError";
  }
}

/** The receipt ledger could not be opened or synchronously flushed. */
export class ReceiptStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptStoreUnavailableError";
  }
}

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

/** Read the ledger, treating only ENOENT as a new/empty chain. */
function readLedgerIfPresent(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new ReceiptStoreUnavailableError("Receipt store read failed");
  }
}

/** Read the last non-empty line. Returns null only for ENOENT or an empty file. */
function readLastLine(filePath: string): string | null {
  const raw = readLedgerIfPresent(filePath);
  if (raw === null) return null;
  const lines = raw.split("\n").filter((l) => l.trim() !== "");
  return lines.length > 0 ? lines[lines.length - 1] : null;
}

/** Read all non-empty lines. Returns [] only for ENOENT or an empty file. */
function readAllLines(filePath: string): string[] {
  const raw = readLedgerIfPresent(filePath);
  if (raw === null) return [];
  return raw.split("\n").filter((l) => l.trim() !== "");
}

/** Validate the shape of a parsed last-line entry. Throws ReceiptChainCorruptError on bad shape. */
function validateLastEntry(entry: unknown, filePath: string): ReceiptEntry {
  if (
    entry === null ||
    typeof entry !== "object" ||
    Array.isArray(entry)
  ) {
    throw new ReceiptChainCorruptError(
      `Receipt chain corrupt in ${filePath}: last line has invalid shape (not an object). ` +
        `Recovery: inspect the file, truncate the corrupt tail line, and re-anchor.`,
    );
  }
  const e = entry as Record<string, unknown>;
  if (
    typeof e["seq"] !== "number" ||
    !Number.isInteger(e["seq"]) ||
    (e["seq"] as number) < 1
  ) {
    throw new ReceiptChainCorruptError(
      `Receipt chain corrupt in ${filePath}: last line has invalid seq (must be positive integer, got ${String(e["seq"])}). ` +
        `Recovery: inspect the file, truncate the corrupt tail line, and re-anchor.`,
    );
  }
  if (
    typeof e["hash"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(e["hash"] as string)
  ) {
    throw new ReceiptChainCorruptError(
      `Receipt chain corrupt in ${filePath}: last line has invalid hash (must be 64-char lowercase hex, got ${String(e["hash"])}). ` +
        `Recovery: inspect the file, truncate the corrupt tail line, and re-anchor.`,
    );
  }
  return e as unknown as ReceiptEntry;
}

// ---------------------------------------------------------------------------
// Receipt meta validation (A3)
// ---------------------------------------------------------------------------

/** Matches the facade's existing FACADE_META_MAX_BYTES so one rule governs all receipts. */
export const META_MAX_BYTES = 4096;
/**
 * Longest permitted string value. A SHA-256 hex digest is 64, an agent or
 * matter id is short, a structured reason code is short. Anything materially
 * longer is prose, and prose in a receipt is either a payload fragment or an
 * error message that should have been a code.
 */
export const META_MAX_STRING = 512;
/** Depth bound; receipt meta is flat records of scalars, not documents. */
export const META_MAX_DEPTH = 8;

/**
 * Reject payload-shaped values in receipt meta. Structural only — it cannot
 * tell a client name from an agent id, and does not try. It enforces the
 * shape the published spec promises: short scalars, bounded nesting, bounded
 * total size. That defeats the realistic failure (a caller dropping a
 * document, prompt, or email body into meta) without pretending to classify
 * content.
 */
export function assertMetaSafe(meta: unknown, path = "meta", depth = 0): void {
  if (depth > META_MAX_DEPTH) {
    throw new ReceiptMetaError(`receipt meta too deeply nested at ${path} (max ${META_MAX_DEPTH})`);
  }
  if (meta === null || meta === undefined) return;
  if (typeof meta === "string") {
    if (meta.length > META_MAX_STRING) {
      throw new ReceiptMetaError(
        `receipt meta string at ${path} is ${meta.length} chars (max ${META_MAX_STRING}). ` +
          `Receipts carry ids, enums and hashes — not content. Store a sha256 instead.`,
      );
    }
    return;
  }
  if (typeof meta === "number" || typeof meta === "boolean") return;
  if (Array.isArray(meta)) {
    meta.forEach((v, i) => assertMetaSafe(v, `${path}[${i}]`, depth + 1));
    return;
  }
  if (typeof meta === "object") {
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      assertMetaSafe(v, `${path}.${k}`, depth + 1);
    }
    return;
  }
  throw new ReceiptMetaError(`receipt meta at ${path} has unsupported type ${typeof meta}`);
}

/** Total-size guard, applied after normalization so it measures what is stored. */
export function assertMetaSize(meta: unknown): void {
  if (meta === undefined) return;
  const bytes = Buffer.byteLength(canonicalJson(meta), "utf8");
  if (bytes > META_MAX_BYTES) {
    throw new ReceiptMetaError(
      `receipt meta is ${bytes} bytes (max ${META_MAX_BYTES}). ` +
        `Receipts are designed to travel; keep them to ids, enums and hashes.`,
    );
  }
}

/** Compute the hash for a receipt entry over the JSON-normalized body. */
function computeHash(prevHash: string, seq: number, ts: string, normalizedBody: ReceiptBody): string {
  const content = canonicalJson({ seq, ts, body: normalizedBody });
  return sha256hex(prevHash + content);
}

// ---------------------------------------------------------------------------
// ReceiptChain
// ---------------------------------------------------------------------------

/**
 * Append-only, hash-linked receipt chain persisted to a JSONL file.
 *
 * The gate-proxy process acquires an atomic single-writer lease for this file
 * before serving traffic. ReceiptChain callers outside that process must obey
 * the same one-writer contract by acquiring the corresponding lease.
 */
export class ReceiptChain {
  private readonly filePath: string;

  /** Ledger location. Read-only; used to site sibling artifacts such as anchor tokens. */
  get path(): string {
    return this.filePath;
  }

  constructor(filePath: string, private readonly defaultCompanyId?: string) {
    this.filePath = filePath;
    // Eagerly create parent directories; file itself is created lazily on first append
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });
  }

  /**
   * Append a new receipt. Derives seq and prevHash from the LAST LINE OF THE FILE
   * so the chain survives restarts without any in-memory state.
   *
   * The body is JSON-round-tripped before hashing (Date values → ISO strings,
   * undefined optional fields dropped) so the hash matches exactly what is
   * persisted. This means append() followed by verify() is always consistent.
   *
   * Throws ReceiptChainCorruptError if the last line is unparseable or has an
   * invalid shape (e.g. crash mid-write), and ReceiptStoreUnavailableError for
   * any read/open/write/sync failure other than an ENOENT ledger. Recovery:
   * inspect the file, truncate the corrupt tail line, and re-anchor from the
   * last valid entry.
   *
   * v1: re-reads file per append; fine at gate volumes.
   */
  append(body: ReceiptBody): ReceiptEntry {
    const lastLine = readLastLine(this.filePath);

    let seq: number;
    let prevHash: string;

    if (lastLine === null) {
      seq = 1;
      prevHash = GENESIS;
    } else {
      let parsed: unknown;
      try {
        parsed = JSON.parse(lastLine);
      } catch {
        throw new ReceiptChainCorruptError(
          `Receipt chain corrupt in ${this.filePath}: last line is not valid JSON. ` +
            `Recovery: inspect the file, truncate the corrupt tail line, and re-anchor.`,
        );
      }
      const last = validateLastEntry(parsed, this.filePath);
      seq = last.seq + 1;
      prevHash = last.hash;
    }

    const ts = new Date().toISOString();

    // JSON-round-trip normalizes Date→ISO, drops undefined fields.
    // Use this normalized body for BOTH the hash and the persisted entry
    // so the two are always identical — one source of truth.
    if (
      this.defaultCompanyId !== undefined &&
      body.companyId !== undefined &&
      body.companyId !== this.defaultCompanyId
    ) {
      throw new ReceiptChainCorruptError("Receipt companyId does not match configured custody");
    }
    const bodyWithDefaults =
      this.defaultCompanyId !== undefined && body.companyId === undefined
        ? { ...body, companyId: this.defaultCompanyId }
        : body;
    const normalizedBody = JSON.parse(JSON.stringify(bodyWithDefaults)) as ReceiptBody;

    // A3: enforce the published "ids, enums and hashes only" promise. Checked
    // AFTER normalization so it measures exactly the bytes that get stored.
    assertMetaSafe(normalizedBody.meta);
    assertMetaSize(normalizedBody.meta);

    const hash = computeHash(prevHash, seq, ts, normalizedBody);

    const entry: ReceiptEntry = { seq, ts, prevHash, hash, body: normalizedBody };
    // A receipt is a safety boundary, not a best-effort application log. Keep
    // the append and fsync in the same file descriptor so returning from this
    // method means the reservation/result reached the configured store.
    let fd: number | undefined;
    try {
      fd = fs.openSync(this.filePath, "a");
      fs.writeSync(fd, JSON.stringify(entry) + "\n", undefined, "utf8");
      fs.fsyncSync(fd);
    } catch {
      throw new ReceiptStoreUnavailableError("Receipt store append or sync failed");
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* preserve the append/sync result */ }
      }
    }
    return entry;
  }

  /**
   * Verify the complete hash chain and prove the backing file can be opened and
   * synchronously flushed. The zero-byte probe never adds a receipt or mutates
   * an existing chain (an empty file may be created for a new chain).
   */
  assertAppendable(): void {
    const verified = this.verify();
    if (!verified.ok) {
      throw new ReceiptChainCorruptError(
        `Receipt chain corrupt: ${verified.reason} at line ${verified.badSeq}`,
      );
    }

    let fd: number | undefined;
    try {
      fd = fs.openSync(this.filePath, "a");
      fs.fsyncSync(fd);
    } catch {
      throw new ReceiptStoreUnavailableError("Receipt store is not appendable");
    } finally {
      if (fd !== undefined) {
        try { fs.closeSync(fd); } catch { /* readiness already determined */ }
      }
    }
  }

  /**
   * Verify the full chain from genesis.
   * - Empty / ENOENT file → { ok: true, length: 0, head: GENESIS }
   * - Any other read failure → throws ReceiptStoreUnavailableError
   * - Malformed line → { ok: false, badSeq: lineIndex (1-based), reason: "unparseable" }
   * - Seq not monotonic from 1 → { ok: false, badSeq: lineIndex (1-based), reason: "..." }
   * - Hash mismatch → { ok: false, badSeq: lineIndex (1-based), reason: "hash mismatch" }
   * - prevHash linkage break → { ok: false, badSeq: lineIndex (1-based), reason: "prevHash mismatch" }
   *
   * Note: badSeq is the 1-based LINE INDEX, not the entry-claimed seq value,
   * so corrupt entries claiming arbitrary seq numbers are always reported at
   * their actual position in the file.
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
      const lineIndex = i + 1; // 1-based line index, reported consistently for all failure kinds
      let entry: ReceiptEntry;
      try {
        entry = JSON.parse(lines[i]) as ReceiptEntry;
      } catch {
        return { ok: false, badSeq: lineIndex, reason: "unparseable" };
      }

      if (entry.seq !== expectedSeq) {
        return {
          ok: false,
          badSeq: lineIndex,
          reason: `seq out of order: expected ${expectedSeq}, got ${entry.seq}`,
        };
      }

      if (
        this.defaultCompanyId !== undefined &&
        entry.body?.companyId !== this.defaultCompanyId
      ) {
        return {
          ok: false,
          badSeq: lineIndex,
          reason: "companyId does not match configured custody",
        };
      }

      if (entry.prevHash !== prevHash) {
        return {
          ok: false,
          badSeq: lineIndex,
          reason: `prevHash mismatch at seq ${entry.seq}`,
        };
      }

      const expected = computeHash(prevHash, entry.seq, entry.ts, entry.body);
      if (entry.hash !== expected) {
        return {
          ok: false,
          badSeq: lineIndex,
          reason: `hash mismatch at seq ${entry.seq}`,
        };
      }

      prevHash = entry.hash;
      expectedSeq++;
    }

    return { ok: true, length: lines.length, head: prevHash };
  }

  /**
   * Returns the hash of the last entry, or GENESIS if the chain is empty/ENOENT.
   * Any other read failure throws ReceiptStoreUnavailableError.
   * Throws ReceiptChainCorruptError if the last line is unparseable or has an
   * invalid shape — corrupt tail must not silently masquerade as GENESIS and
   * feed an incorrect anchor to external systems.
   */
  head(): string {
    const lastLine = readLastLine(this.filePath);
    if (lastLine === null) return GENESIS;
    let parsed: unknown;
    try {
      parsed = JSON.parse(lastLine);
    } catch {
      throw new ReceiptChainCorruptError(
        `Receipt chain corrupt in ${this.filePath}: last line is not valid JSON. ` +
          `Recovery: inspect the file, truncate the corrupt tail line, and re-anchor.`,
      );
    }
    const entry = validateLastEntry(parsed, this.filePath);
    return entry.hash;
  }
  /**
   * Human-readable anchor text for a paperclip comment.
   * Contains: head hash, chain length (as length=<n> token), ts of last entry, file path.
   * Routes through the same validated last-entry path so a corrupt tail throws
   * ReceiptChainCorruptError instead of an untyped SyntaxError.
   */
  anchorText(): string {
    const lines = readAllLines(this.filePath);
    if (lines.length === 0) {
      return `Receipt chain anchor: head=${GENESIS} length=0 file=${this.filePath}`;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[lines.length - 1]);
    } catch {
      throw new ReceiptChainCorruptError(
        `Receipt chain corrupt in ${this.filePath}: last line is not valid JSON. ` +
          `Recovery: inspect the file, truncate the corrupt tail line, and re-anchor.`,
      );
    }
    const last = validateLastEntry(parsed, this.filePath);
    return (
      `Receipt chain anchor: head=${last.hash} length=${lines.length} ` +
      `lastTs=${last.ts} file=${this.filePath}`
    );
  }

  /**
   * Return all entries in the chain as an array, parsed and validated.
   * Each line is JSON-parsed; a corrupt or malformed line throws ReceiptChainCorruptError.
   */
  entries(): ReceiptEntry[] {
    const lines = readAllLines(this.filePath);
    const result: ReceiptEntry[] = [];
    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        throw new ReceiptChainCorruptError(
          `Receipt chain corrupt in ${this.filePath}: a line is not valid JSON. ` +
            `Recovery: inspect the file, truncate the corrupt line, and re-anchor.`,
        );
      }
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new ReceiptChainCorruptError(
          `Receipt chain corrupt in ${this.filePath}: a line has invalid shape (not an object). ` +
            `Recovery: inspect the file, truncate the corrupt line, and re-anchor.`,
        );
      }
      result.push(parsed as ReceiptEntry);
    }
    return result;
  }
}
