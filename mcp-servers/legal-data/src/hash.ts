// mcp-servers/legal-data/src/hash.ts
//
// SOURCE OF TRUTH: gate-proxy/src/citations.ts (normalizeText, documentSha256)
// and gate-proxy/src/receipts.ts (sha256hex).
//
// These two pure functions are COPIED here verbatim (not forked) so a fetched
// authority's fingerprint is the SAME sha the citation gate computes over agent
// output. Keeping them byte-identical closes the provenance loop: data-provenance
// in (this MCP) -> output-provenance out (gate-proxy citation gate), one hashing
// scheme. If gate-proxy's normalization changes, update this file to match —
// gate-proxy is authoritative.
//
// We copy rather than import to avoid a cross-package dependency on gate-proxy's
// internal module graph (it pulls in types.ts, receipts.ts, etc.); these two
// functions are tiny and pure.
import crypto from "node:crypto";

/** sha256hex: SHA-256 of a UTF-8 string, returned as lowercase hex. */
export function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

/**
 * S1: NFKC -> whitespace-collapse -> strip Cf/Mn/Me/Cc(non-WS)/Default_Ignorable -> trim.
 * Verbatim copy of gate-proxy/src/citations.ts:normalizeText.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .replace(/[\p{Cf}\p{Mn}\p{Me}\p{Cc}]|\p{Default_Ignorable_Code_Point}/gu, "")
    .trim();
}

/**
 * documentSha256: fingerprint of a document's normalized text.
 * Verbatim copy of gate-proxy/src/citations.ts:documentSha256.
 */
export function documentSha256(text: string): string {
  return sha256hex(normalizeText(text));
}
