// mcp-servers/firm-facade/src/hash.ts
//
// Pure hash utilities for the firm-facade MCP server.
//
// sha256hex mirrors mcp-servers/legal-data/src/hash.ts verbatim so the two
// packages use one hashing scheme. canonicalArgs is added here for deterministic
// receipt payload descriptors — it is NOT in legal-data (it has no receipts).
//
// Both functions are pure and allocation-light; safe to call on every handler invocation.
import crypto from "node:crypto";

/**
 * sha256hex: SHA-256 of a UTF-8 string, returned as lowercase hex.
 * Verbatim copy of mcp-servers/legal-data/src/hash.ts:sha256hex.
 * If legal-data's hashing changes, update this file to match.
 */
export function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * canonicalArgs: deterministic JSON of an object with top-level keys sorted
 * alphabetically. Used to produce a stable, non-privileged action descriptor
 * for receipt payloadSha256 values.
 *
 * CONSTRAINT: the caller MUST pass only ids, flags, and tool names — never
 * privileged text (titles, descriptions, document bodies). Enforced by callers;
 * this function has no way to detect violations.
 */
export function canonicalArgs(obj: Record<string, unknown>): string {
  const sorted = Object.fromEntries(
    Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)),
  );
  return JSON.stringify(sorted);
}
