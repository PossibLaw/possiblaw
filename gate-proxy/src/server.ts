// ---------------------------------------------------------------------------
// server.ts — Gate-proxy HTTP server wiring the full egress pipeline.
//
// SECURITY INVARIANTS:
//   - A receipt is written on EVERY code path including errors.
//   - Receipts never contain payload text, anonymization maps, or credentials.
//   - Payload is represented only by its sha256.
//   - Unknown tools, corrupt chain, null client for human gate, and anonymizer
//     confidence 0 all FAIL CLOSED (403/503 + blocked receipt).
//   - Log lines NEVER include payload text.
// ---------------------------------------------------------------------------

import http from "node:http";
import crypto from "node:crypto";
import type { Policy } from "./policy.ts";
import type { ReceiptChain, ReceiptBody, ReceiptOutcome } from "./receipts.ts";
import { ReceiptChainCorruptError, sha256hex, canonicalJson } from "./receipts.ts";
import type { PaperclipClient } from "./paperclip-client.ts";
import type { PerformerRegistry } from "./connectors.ts";
import { PerformerError } from "./connectors.ts";
import { classify, UnknownToolError } from "./boundary.ts";
import { decide } from "./policy.ts";
import { evaluateTierFloor } from "./gates/tier-floor.ts";
import { anonymize, deanonymize } from "./anonymize.ts";
import { humanGate } from "./gates/human.ts";
import type { EgressMeta, EgressRequest } from "./types.ts";
import type { CitationRegistry } from "./quality/citation-registry.ts";
import type { AuthorityRegistry } from "./quality/authority-registry.ts";
import {
  MatterClassificationRegistry,
  resolveEffectiveConfidentiality,
  isConfidentiality,
} from "./matter-classification.ts";
import { assembleSignoffBundle, renderSignoffMarkdown } from "./quality/signoff.ts";
import { documentSha256, extractCitations } from "./citations.ts";
import { extractDocumentText } from "./document-text.ts";
import { buildProvenance } from "./provenance/provenance.ts";
import { DEFAULT_MAX_UPLOAD_BYTES, decodeBase64Strict, isValidMimeType, resolveUploadMimeType } from "./upload.ts";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface GateServerDeps {
  policy: Policy;
  receipts: ReceiptChain;
  client: PaperclipClient | null; // null = paperclip unconfigured → human gates FAIL CLOSED (503)
  performers: PerformerRegistry;
  localModelAvailable: boolean;
  citationRegistry: CitationRegistry;
  authorityRegistry: AuthorityRegistry;
  /**
   * Task H: receipt-derived per-matter confidentiality floors. Optional —
   * createGateServer constructs one from `receipts` when omitted, so every
   * server has a working registry (safe built-in default).
   */
  matterClassifications?: MatterClassificationRegistry;
  log?: (line: string) => void; // NEVER log payload text
  /**
   * Task 4.1: decoded-size cap (bytes) for contentBase64 binary uploads.
   * Defaults to DEFAULT_MAX_UPLOAD_BYTES (25 MB); index.ts wires the
   * GATE_MAX_UPLOAD_BYTES env override. Invalid values fall back to the default.
   */
  maxUploadBytes?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** I2 (a): max body size in bytes before we reply 413. */
const MAX_BODY_BYTES = 1_000_000;

/** I1 (a): safe ID pattern — only alphanumeric + hyphen, 1–64 chars. */
/** Receipts carry enums only: clamp the caller-supplied confidentiality
 * string so arbitrary (attacker-steered) text never enters the hash chain. */
function sanitizeClaimedConfidentiality(v: unknown): string {
  if (v === undefined || v === null) return "unspecified";
  return isConfidentiality(v) ? (v as string) : "invalid";
}

const SAFE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** I2 (c): entity list / per-entity caps — mirrored from anonymize.ts for server-level 400 guard. */
const MAX_ENTITIES = 256;
const MAX_ENTITY_LENGTH = 256;
// Cap the per-segment provenance detail recorded in a receipt's meta so a
// pathological document cannot bloat the hash-chained ledger. The summary counts
// always reflect the FULL document; only the per-segment array is capped, and a
// segmentsTruncated flag is set so truncation is never silent.
const MAX_PROVENANCE_SEGMENTS = 500;

/**
 * Task H (problem 2): tools whose performers genuinely honor
 * PerformOptions.useLocal (see connectors.ts — only makeQueryExternalModel
 * routes to LOCAL_MODEL_URL). Only these may proceed under a tier-floor
 * useLocal decision; every other performer IGNORES useLocal and would ship the
 * UNMASKED payload to its real vendor while the receipt claimed
 * routedLocal:true. For those tools a useLocal decision falls through to the
 * anonymize path (mask then perform, else block) so the receipt records what
 * ACTUALLY happened.
 */
const LOCAL_ROUTABLE_TOOLS: ReadonlySet<string> = new Set(["query_external_model"]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function noop(_line: string): void { /* intentional no-op */ }

/**
 * Bounded, single-line audit string (no payload text) — citation/source/url/
 * delivery fields. Hoisted to module scope (shared by createGateServer's
 * /quality/authority validation and performAndReceipt's delivery gating below)
 * so both call sites enforce the same bounded-length + no-CR/LF contract.
 */
function isSafeAuthorityString(v: unknown, max: number): boolean {
  return typeof v === "string" && v.length >= 1 && v.length <= max && !/[\r\n]/.test(v);
}

/**
 * C2: readBody with:
 *   - body-size cap (I2 a): resolves with null + sets the limitExceeded flag when
 *     > maxBytes are received (caller responds 413). Defaults to MAX_BODY_BYTES;
 *     upload_document egress passes a larger cap sized for base64 binary uploads
 *     (Task 4.1) — every other endpoint keeps the 1 MB cap.
 *   - 'error' event handler for client aborts (C2 c).
 */
function readBody(
  req: http.IncomingMessage,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<{ body: string; limitExceeded: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let limitExceeded = false;

    req.on("data", (chunk: Buffer) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        limitExceeded = true;
        // Drain remaining data but don't accumulate it
        chunks.length = 0;
        resolve({ body: "", limitExceeded: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!limitExceeded) {
        resolve({ body: Buffer.concat(chunks).toString("utf8"), limitExceeded: false });
      }
    });
    // C2 (c): client abort → reject, caught by outer try/catch
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload, "utf8"),
  });
  res.end(payload);
}

/**
 * I1 (a): validate that an agent-supplied ID matches the safe pattern.
 * Returns true if valid (or absent); false if present but invalid.
 */
function isValidId(id: unknown): boolean {
  if (id === undefined) return true;
  if (typeof id !== "string") return false;
  return SAFE_ID_RE.test(id);
}

// ---------------------------------------------------------------------------
// performAndReceipt — shared helper for the four near-identical perform blocks
// ---------------------------------------------------------------------------

interface PerformAndReceiptInput {
  performers: PerformerRegistry;
  receipts: ReceiptChain;
  tool: string;
  boundary: ReturnType<typeof classify>;
  decision: ReturnType<typeof decide>;
  payloadSha256: string;
  meta: EgressMeta;
  approvalId?: string; // may differ from meta.approvalId (e.g. gate result)
  useLocal: boolean;
  /** Which data-terms posture the tier-floor relied on; recorded into receipt meta. */
  dataTermsTier?: string;
  egressReq: EgressRequest;
  /** For the anonymize path: de-token the model response string before sending. */
  deanonymizeMap?: Record<string, string>;
  res: http.ServerResponse;
  log: (line: string) => void;
  /** The decision label to return in the JSON response (allow | anonymize | human). */
  responseDecisionLabel: string;
  /**
   * Extra non-payload audit fields merged into the egress receipt meta — e.g.
   * the citation gate's unbackedCitations (anti-hallucination flag). Recorded
   * verbatim per the ReceiptBody contract; callers must not place payload text
   * here (citation strings are public legal identifiers, not payloads).
   */
  extraReceiptMeta?: Record<string, unknown>;
}

async function performAndReceipt(opts: PerformAndReceiptInput): Promise<void> {
  const {
    performers, receipts, tool, boundary, decision, payloadSha256,
    meta, approvalId, useLocal, dataTermsTier, egressReq, deanonymizeMap, res,
    log: _log, responseDecisionLabel, extraReceiptMeta,
  } = opts;

  // I5: claimedConfidentiality in every egress receipt meta
  const claimedConfidentiality = sanitizeClaimedConfidentiality(meta.confidentiality);

  const performer = performers[tool];
  try {
    const result = await performer(egressReq, { useLocal });

    // Build extra receipt meta
    const receiptMeta: Record<string, unknown> = { claimedConfidentiality, ...(extraReceiptMeta ?? {}) };
    if (useLocal) receiptMeta["routedLocal"] = true;
    // Record which data-terms posture the tier-floor relied on (the field the
    // sign-off bundle reads) so a regulator can see *why* a cloud lane was
    // acceptable for a sensitive matter. See docs/privilege-and-confidentiality.md.
    if (dataTermsTier !== undefined) receiptMeta["dataTermsTier"] = dataTermsTier;
    if (deanonymizeMap) receiptMeta["maskedTokenCount"] = Object.keys(deanonymizeMap).length;

    // Task 4.5: thread the delivered-artifact link onto the egress receipt so the
    // Matter Trust Report can point at WHERE the work product landed. Only on a
    // performed upload_document, and only an explicit whitelist of result fields
    // (vendor file id + webUrl) — these are delivery METADATA, never payload text
    // (per the ReceiptBody contract). Never set on blocked/pending/error (those
    // paths never reach this success branch).
    //
    // Each field is additionally gated through isSafeAuthorityString (bounded
    // length + no CR/LF) before entering the hash-chained receipt — an
    // unbounded or CRLF-carrying vendor response must not bloat or corrupt the
    // ledger. A field that fails the check is silently omitted from delivery;
    // this NEVER fails the egress itself (the upload already happened), it
    // just means the receipt carries less delivery metadata.
    if (tool === "upload_document") {
      const delivery: Record<string, unknown> = {};
      const vendor = egressReq.payload["destination"];
      if (typeof vendor === "string" && isSafeAuthorityString(vendor, 64)) delivery["vendor"] = vendor;
      if (typeof result["id"] === "string" && isSafeAuthorityString(result["id"], 512)) delivery["fileId"] = result["id"];
      if (typeof result["webUrl"] === "string" && isSafeAuthorityString(result["webUrl"], 2048)) delivery["webUrl"] = result["webUrl"];
      if (Object.keys(delivery).length > 0) receiptMeta["delivery"] = delivery;
    }

    receipts.append({
      kind: "egress",
      tool,
      boundary,
      decision,
      outcome: deanonymizeMap ? "anonymized_performed" : "performed",
      payloadSha256,
      agentId: meta.agentId,
      issueId: meta.issueId,
      approvalId: approvalId ?? meta.approvalId,
      meta: receiptMeta,
    });

    // NEW FUNCTIONAL: deanonymize model response if a map was supplied
    let finalResult = result;
    if (deanonymizeMap && typeof result["content"] === "string") {
      finalResult = { ...result, content: deanonymize(result["content"] as string, deanonymizeMap) };
    }

    sendJson(res, 200, { decision: responseDecisionLabel, result: finalResult });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const errorReceiptMeta: Record<string, unknown> = { error: msg, claimedConfidentiality, ...(extraReceiptMeta ?? {}) };
    receipts.append({
      kind: "egress",
      tool,
      boundary,
      decision,
      outcome: "error",
      payloadSha256,
      agentId: meta.agentId,
      issueId: meta.issueId,
      approvalId: approvalId ?? meta.approvalId,
      meta: errorReceiptMeta,
    });
    sendJson(res, 502, { error: msg });
  }
}

// ---------------------------------------------------------------------------
// createGateServer
// ---------------------------------------------------------------------------

export function createGateServer(deps: GateServerDeps): http.Server {
  const { policy, receipts, client, performers, localModelAvailable } = deps;
  const log = deps.log ?? noop;
  // Task H: matter-classification floors. Auto-constructed from the same
  // receipt chain when not supplied so the safe default always exists.
  const matterClassifications =
    deps.matterClassifications ?? new MatterClassificationRegistry(receipts);
  // Task 4.1: decoded-size cap for binary uploads. Fail closed to the default
  // on any invalid override (NaN, non-finite, <= 0) rather than disabling the cap.
  const maxUploadBytes =
    typeof deps.maxUploadBytes === "number" &&
    Number.isFinite(deps.maxUploadBytes) &&
    deps.maxUploadBytes > 0
      ? Math.floor(deps.maxUploadBytes)
      : DEFAULT_MAX_UPLOAD_BYTES;
  const SAFE_SHA_RE = /^[0-9a-f]{64}$/;
  // isSafeAuthorityString is hoisted to module scope above (shared with
  // performAndReceipt's delivery-field gating).

  // POST /receipts/facade (firm-facade audit channel) — hoisted to closure scope
  // so they are allocated once per server, not per request.
  /** Fixed allowlist of facade nouns; anything else is rejected (the security property). */
  const FACADE_TOOL_ALLOWLIST = new Set<string>([
    "create_matter",
    "get_matter_status",
    "list_work_products",
    "fetch_work_product",
    "request_approval",
  ]);
  /** Valid ReceiptOutcome values accepted on a facade receipt. */
  const FACADE_VALID_OUTCOMES = new Set<string>([
    "performed",
    "anonymized_performed",
    "pending",
    "blocked",
    "error",
  ]);
  /** Serialized-size cap for caller-supplied facade receipt meta. */
  const FACADE_META_MAX_BYTES = 4096;

  const server = http.createServer(async (req, res) => {
    const url = req.url ?? "/";
    const method = req.method ?? "GET";

    // ------------------------------------------------------------------
    // GET /health
    // ------------------------------------------------------------------
    if (method === "GET" && url === "/health") {
      try {
        receipts.head(); // throws ReceiptChainCorruptError if corrupt
        sendJson(res, 200, { ok: true });
      } catch (err) {
        if (err instanceof ReceiptChainCorruptError) {
          sendJson(res, 503, { ok: false, error: "receipts_corrupt" });
        } else {
          sendJson(res, 503, { ok: false, error: "receipts_corrupt" });
        }
      }
      return;
    }

    // ------------------------------------------------------------------
    // GET /receipts/verify
    // ------------------------------------------------------------------
    if (method === "GET" && url === "/receipts/verify") {
      const result = receipts.verify();
      sendJson(res, 200, result);
      return;
    }

    // ------------------------------------------------------------------
    // GET /receipts/bundle?issueId=POS-123[&format=md]
    // Assembles a per-matter "Matter Trust Report" from EXISTING receipts —
    // hashes only, never payloads. JSON by default; Markdown if format=md.
    // Reuses the server's ReceiptChain. Fail-closed: a corrupt chain throws
    // ReceiptChainCorruptError and we return 503 receipts_corrupt rather than
    // a falsely-clean report.
    // ------------------------------------------------------------------
    if (method === "GET" && url.startsWith("/receipts/bundle")) {
      try {
        const parsedUrl = new URL(url, "http://localhost");
        const issueId = parsedUrl.searchParams.get("issueId");
        const format = parsedUrl.searchParams.get("format");
        if (issueId === null || !SAFE_ID_RE.test(issueId)) {
          sendJson(res, 400, { error: "invalid_issueId: required query param issueId must match [A-Za-z0-9-]{1,64}" });
          return;
        }
        let bundle;
        try {
          bundle = assembleSignoffBundle(receipts, issueId);
        } catch (err) {
          if (err instanceof ReceiptChainCorruptError) {
            sendJson(res, 503, { error: "receipts_corrupt" });
            return;
          }
          throw err;
        }
        if (format === "md") {
          const md = renderSignoffMarkdown(bundle);
          if (!res.headersSent) {
            res.writeHead(200, {
              "content-type": "text/markdown; charset=utf-8",
              "content-length": Buffer.byteLength(md, "utf8"),
            });
            res.end(md);
          }
          return;
        }
        sendJson(res, 200, bundle);
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /receipts/anchor — body {issueId}
    // ------------------------------------------------------------------
    if (method === "POST" && url === "/receipts/anchor") {
      // C2 (b): wrap /receipts/anchor body in try/catch
      try {
        if (client === null) {
          sendJson(res, 503, { error: "paperclip_client_unavailable" });
          return;
        }
        const { body: rawBody, limitExceeded } = await readBody(req);
        if (limitExceeded) {
          sendJson(res, 413, { error: "request_too_large" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const { issueId } = parsed as Record<string, unknown>;
        // Compute anchorText ONCE then reuse for both the comment and the receipt hash
        const anchorText = receipts.anchorText();
        await client.postIssueComment(issueId as string, anchorText);
        const anchorReceiptBody: ReceiptBody = {
          kind: "anchor",
          tool: "anchor",
          boundary: null,
          decision: null,
          outcome: "performed",
          payloadSha256: sha256hex(anchorText),
        };
        const entry = receipts.append(anchorReceiptBody);
        sendJson(res, 200, { anchored: true, head: entry.hash });
      } catch {
        // C2 (b): best-effort error response; don't re-throw
        if (!res.headersSent) {
          sendJson(res, 500, { error: "internal_error" });
        }
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /quality/citation — register a citation verification
    // (deterministic re-checks happen in CitationRegistry; receipts carry
    // counts + shas only — citation text goes back to the caller, never
    // into receipts or logs)
    // ------------------------------------------------------------------
    if (method === "POST" && url === "/quality/citation") {
      try {
        const { body: rawBody, limitExceeded } = await readBody(req);
        if (limitExceeded) {
          sendJson(res, 413, { error: "request_too_large" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          deps.receipts.append({
            kind: "quality",
            tool: "citation_verification",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const b = parsed as Record<string, unknown>;
        const rawMeta = (b["meta"] ?? {}) as Record<string, unknown>;
        const rows = b["rows"];
        const rowsOk = Array.isArray(rows) && rows.length <= 500 && rows.every((r) =>
          r !== null && typeof r === "object" && !Array.isArray(r) &&
          typeof (r as Record<string, unknown>)["citation"] === "string" &&
          typeof (r as Record<string, unknown>)["match"] === "string" &&
          ["quoted", "sourcePassage"].every(
            (k) => (r as Record<string, unknown>)[k] === undefined || typeof (r as Record<string, unknown>)[k] === "string",
          ));
        if (typeof b["document"] !== "string" || !rowsOk ||
            rawMeta === null || typeof rawMeta !== "object" || Array.isArray(rawMeta) ||
            !isValidId(rawMeta["agentId"]) || !isValidId(rawMeta["issueId"])) {
          deps.receipts.append({
            kind: "quality",
            tool: "citation_verification",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_registration: requires string 'document', rows[] of {citation, match[, quoted, sourcePassage]} (max 500), valid meta ids" });
          return;
        }
        let result;
        try {
          result = deps.citationRegistry.register({
            document: b["document"] as string,
            rows: rows as { citation: string; match: string; quoted?: string; sourcePassage?: string }[],
            meta: { agentId: rawMeta["agentId"] as string | undefined, issueId: rawMeta["issueId"] as string | undefined },
          });
        } catch (err) {
          deps.receipts.append({
            kind: "quality",
            tool: "citation_verification",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: `registration_rejected: ${err instanceof Error ? err.message : "invalid input"}` });
          return;
        }
        if (result.ok) {
          sendJson(res, 200, { registered: true, documentSha256: result.documentSha256, citationCount: result.citationCount });
        } else {
          sendJson(res, 422, { registered: false, reason: result.reason, details: result.details });
        }
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /quality/authority — register a RETRIEVED legal authority.
    // The legal-data MCP posts one of these per fetched authority. We index the
    // NORMALIZED citation and append a hash-chained quality receipt
    // (tool=authority_provenance). Later, an outbound filing that CITES an
    // authority never registered here is flagged (and, if
    // requireAuthorityProvenance is on, blocked) as a hallucination signal.
    // Receipts carry the normalized citation + content sha + source only —
    // never authority text, and never caller-supplied meta (reporterMeta was
    // dropped in FIX 3: it stored arbitrary caller JSON in the hash-chained
    // ledger and is never read back by verifyDocument or the sign-off bundle).
    // ------------------------------------------------------------------
    if (method === "POST" && url === "/quality/authority") {
      try {
        const { body: rawBody, limitExceeded } = await readBody(req);
        if (limitExceeded) {
          sendJson(res, 413, { error: "request_too_large" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          deps.receipts.append({
            kind: "quality",
            tool: "authority_provenance",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const b = parsed as Record<string, unknown>;
        const metaOk =
          b["meta"] === undefined ||
          (b["meta"] !== null && typeof b["meta"] === "object" && !Array.isArray(b["meta"]));
        if (
          !isSafeAuthorityString(b["citation"], 512) ||
          typeof b["sha256"] !== "string" ||
          !SAFE_SHA_RE.test(b["sha256"] as string) ||
          !isSafeAuthorityString(b["source"], 128) ||
          (b["sourceUrl"] !== undefined && !isSafeAuthorityString(b["sourceUrl"], 2048)) ||
          (b["retrievedAt"] !== undefined && !isSafeAuthorityString(b["retrievedAt"], 64)) ||
          !metaOk
        ) {
          deps.receipts.append({
            kind: "quality",
            tool: "authority_provenance",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_authority: requires non-empty 'citation', 64-hex 'sha256', 'source'[, 'sourceUrl', 'retrievedAt', 'meta']" });
          return;
        }
        // FIX 2 (S1): validate that citation actually contains a recognized
        // legal citation — reject arbitrary prose strings that could contaminate
        // the regulator-facing sign-off bundle. Mirror the error-receipt pattern.
        if (extractCitations(b["citation"] as string).length === 0) {
          deps.receipts.append({
            kind: "quality",
            tool: "authority_provenance",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_authority: citation does not contain a recognized legal citation" });
          return;
        }
        let result;
        try {
          result = deps.authorityRegistry.register({
            citation: b["citation"] as string,
            sha256: b["sha256"] as string,
            source: b["source"] as string,
            sourceUrl: b["sourceUrl"] as string | undefined,
            retrievedAt: b["retrievedAt"] as string | undefined,
          });
        } catch (err) {
          deps.receipts.append({
            kind: "quality",
            tool: "authority_provenance",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: `authority_rejected: ${err instanceof Error ? err.message : "invalid input"}` });
          return;
        }
        sendJson(res, 200, { ok: true, normalizedCitation: result.normalizedCitation });
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /receipts/facade — firm-facade audit receipt channel (S6).
    //
    // SECURITY INVARIANTS:
    //   - kind is ALWAYS hard-coded to "firm_facade" server-side.
    //     The caller cannot forge a "quality"/"egress" receipt by
    //     putting kind:"quality" in the body — this prevents contamination
    //     of CitationRegistry.verified and the egress audit spine.
    //   - tool is validated against a fixed allowlist (facade nouns only).
    //   - The gate proxy is the sole ReceiptChain writer (S6 contract).
    // ------------------------------------------------------------------
    if (method === "POST" && url === "/receipts/facade") {
      // FACADE_TOOL_ALLOWLIST / FACADE_VALID_OUTCOMES / FACADE_META_MAX_BYTES
      // are hoisted to the createGateServer() closure scope above.
      //
      // Sentinel tool values used ONLY on error receipts where no valid facade
      // noun is known yet — they are not in the allowlist and are never accepted
      // as a success: "facade_parse_error" (body is not JSON) and
      // "facade_unknown_tool" (tool absent or not allowlisted).
      try {
        const { body: rawBody, limitExceeded } = await readBody(req);
        if (limitExceeded) {
          sendJson(res, 413, { error: "request_too_large" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          // Sentinel tool: body did not parse, so no facade noun is known.
          // kind is always firm_facade.
          deps.receipts.append({
            kind: "firm_facade",
            tool: "facade_parse_error",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const b = parsed as Record<string, unknown>;

        // SECURITY: NEVER read `kind` from body — always hard-code firm_facade.
        // Validate `tool` against the fixed facade-noun allowlist
        const toolRaw = b["tool"];
        if (typeof toolRaw !== "string" || !FACADE_TOOL_ALLOWLIST.has(toolRaw)) {
          // Sentinel tool: no valid facade noun supplied.
          deps.receipts.append({
            kind: "firm_facade",
            tool: "facade_unknown_tool",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_tool: must be one of create_matter, get_matter_status, list_work_products, fetch_work_product, request_approval" });
          return;
        }
        const tool = toolRaw as string;

        // Validate outcome
        const outcomeRaw = b["outcome"];
        if (typeof outcomeRaw !== "string" || !FACADE_VALID_OUTCOMES.has(outcomeRaw)) {
          deps.receipts.append({
            kind: "firm_facade",
            tool,
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_outcome: must be one of performed, anonymized_performed, pending, blocked, error" });
          return;
        }
        const outcome = outcomeRaw as ReceiptOutcome;

        // Validate payloadSha256 (format: 64-char lowercase hex)
        const payloadSha256Raw = b["payloadSha256"];
        if (typeof payloadSha256Raw !== "string" || !SAFE_SHA_RE.test(payloadSha256Raw)) {
          deps.receipts.append({
            kind: "firm_facade",
            tool,
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_payloadSha256: must be 64-char lowercase hex" });
          return;
        }
        const payloadSha256 = payloadSha256Raw as string;

        // Validate optional ID fields (safe-ID pattern if present)
        const matterId = b["matterId"];
        const workProductId = b["workProductId"];
        const approvalId = b["approvalId"];
        const agentId = b["agentId"];
        const issueId = b["issueId"];
        if (
          !isValidId(matterId) || !isValidId(workProductId) || !isValidId(approvalId) ||
          !isValidId(agentId) || !isValidId(issueId)
        ) {
          deps.receipts.append({
            kind: "firm_facade",
            tool,
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_id: optional id fields must match [A-Za-z0-9-]{1,64} if present" });
          return;
        }

        // Validate optional meta (must be plain object; serialized size cap)
        const metaRaw = b["meta"];
        if (metaRaw !== undefined) {
          if (metaRaw === null || typeof metaRaw !== "object" || Array.isArray(metaRaw)) {
            deps.receipts.append({
              kind: "firm_facade",
              tool,
              boundary: null,
              decision: null,
              outcome: "error",
              payloadSha256: sha256hex(rawBody),
            });
            sendJson(res, 400, { error: "invalid_meta: must be a plain object if present" });
            return;
          }
          if (JSON.stringify(metaRaw).length > FACADE_META_MAX_BYTES) {
            deps.receipts.append({
              kind: "firm_facade",
              tool,
              boundary: null,
              decision: null,
              outcome: "error",
              payloadSha256: sha256hex(rawBody),
            });
            sendJson(res, 400, { error: `invalid_meta: serialized meta must be <= ${FACADE_META_MAX_BYTES} bytes` });
            return;
          }
        }

        // Build receipt meta: spread caller meta then overlay facade-specific ids
        const receiptMeta: Record<string, unknown> = {};
        if (metaRaw !== undefined) Object.assign(receiptMeta, metaRaw as Record<string, unknown>);
        if (matterId !== undefined) receiptMeta["matterId"] = matterId;
        if (workProductId !== undefined) receiptMeta["workProductId"] = workProductId;

        // Append receipt — kind ALWAYS firm_facade (never from body).
        // Follow-up #2: default top-level issueId from matterId when no explicit
        // issueId is supplied. Every facade tool carries matterId, so this makes
        // facade receipts appear in the per-matter GET /receipts/bundle Matter Trust
        // Report (which filters on body.issueId). Explicit issueId wins when present.
        const entry = deps.receipts.append({
          kind: "firm_facade",
          tool,
          boundary: null,
          decision: null,
          outcome,
          payloadSha256,
          agentId: agentId as string | undefined,
          issueId: ((issueId ?? matterId) as string | undefined),
          approvalId: approvalId as string | undefined,
          ...(Object.keys(receiptMeta).length > 0 ? { meta: receiptMeta } : {}),
        });

        sendJson(res, 200, { recorded: true, seq: entry.seq, hash: entry.hash });
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /receipts/deadline — deadline receipt audit channel.
    //
    // SECURITY INVARIANTS (same anti-forgery property as /receipts/facade):
    //   - kind is ALWAYS hard-coded to "deadline" server-side.
    //     The caller cannot forge a different kind by putting kind:"quality"
    //     or kind:"egress" in the body.
    //   - issueId is ALWAYS set to matterId (never read from body) so the
    //     deadline joins the per-matter Matter Trust Report bundle.
    //   - meta carries NON-privileged computation facts only:
    //     {deadline, rule, jurisdiction, direction, days}. No matter content.
    //   - Exact-key validation: extra or missing meta fields are rejected.
    // ------------------------------------------------------------------
    if (method === "POST" && url === "/receipts/deadline") {
      try {
        const { body: rawBody, limitExceeded } = await readBody(req);
        if (limitExceeded) {
          sendJson(res, 413, { error: "request_too_large" });
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          // kind is always "deadline" even on error receipts.
          deps.receipts.append({
            kind: "deadline",
            tool: "deadline_parse_error",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const b = parsed as Record<string, unknown>;

        // Validate matterId — required, SAFE_ID_RE
        const matterId = b["matterId"];
        if (typeof matterId !== "string" || !SAFE_ID_RE.test(matterId)) {
          deps.receipts.append({
            kind: "deadline",
            tool: "deadline_bad_body",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_matterId: required, must match [A-Za-z0-9-]{1,64}" });
          return;
        }

        // Validate payloadSha256 — required, 64-hex
        const payloadSha256Raw = b["payloadSha256"];
        if (typeof payloadSha256Raw !== "string" || !SAFE_SHA_RE.test(payloadSha256Raw)) {
          deps.receipts.append({
            kind: "deadline",
            tool: "deadline_bad_body",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, { error: "invalid_payloadSha256: must be 64-char lowercase hex" });
          return;
        }
        const payloadSha256 = payloadSha256Raw as string;

        // Validate meta — required plain object with EXACTLY the six allowed keys.
        // Reject extra, missing, or mis-typed fields. serviceByMail is recorded so
        // a mail-service deadline's `days` reconciles with the date (which silently
        // includes the FRCP 6(d) +3 mail days).
        const metaRaw = b["meta"];
        const DEADLINE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
        const DEADLINE_EXPECTED_KEYS = "days,deadline,direction,jurisdiction,rule,serviceByMail"; // sorted
        if (metaRaw === null || typeof metaRaw !== "object" || Array.isArray(metaRaw)) {
          deps.receipts.append({
            kind: "deadline",
            tool: "deadline_bad_body",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, {
            error: "invalid_meta: required plain object {deadline:YYYY-MM-DD, rule:FRCP-6, jurisdiction:US-FED, direction:forward|backward, days:positive-integer, serviceByMail:boolean}",
          });
          return;
        }
        const meta = metaRaw as Record<string, unknown>;
        const metaKeys = Object.keys(meta).sort().join(",");
        if (metaKeys !== DEADLINE_EXPECTED_KEYS) {
          deps.receipts.append({
            kind: "deadline",
            tool: "deadline_bad_body",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, {
            error: "invalid_meta: must have exactly {deadline, rule, jurisdiction, direction, days, serviceByMail} — no extra or missing fields",
          });
          return;
        }
        if (
          typeof meta["deadline"] !== "string" || !DEADLINE_DATE_RE.test(meta["deadline"] as string) ||
          meta["rule"] !== "FRCP-6" ||
          meta["jurisdiction"] !== "US-FED" ||
          (meta["direction"] !== "forward" && meta["direction"] !== "backward") ||
          typeof meta["days"] !== "number" || !Number.isInteger(meta["days"]) || (meta["days"] as number) < 1 ||
          typeof meta["serviceByMail"] !== "boolean"
        ) {
          deps.receipts.append({
            kind: "deadline",
            tool: "deadline_bad_body",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
          sendJson(res, 400, {
            error: "invalid_meta: deadline must be YYYY-MM-DD, rule must be FRCP-6, jurisdiction must be US-FED, direction must be forward|backward, days must be positive integer, serviceByMail must be boolean",
          });
          return;
        }

        // Append receipt — kind ALWAYS "deadline" (never from body).
        // issueId is ALWAYS set to matterId so this deadline joins the per-matter
        // bundle in GET /receipts/bundle?issueId=<matter>.
        const entry = deps.receipts.append({
          kind: "deadline",
          tool: "deadline_calculation",
          boundary: null,
          decision: null,
          outcome: "performed",
          payloadSha256,
          issueId: matterId as string,
          meta: {
            deadline: meta["deadline"],
            rule: meta["rule"],
            jurisdiction: meta["jurisdiction"],
            direction: meta["direction"],
            days: meta["days"],
            serviceByMail: meta["serviceByMail"],
          },
        });

        sendJson(res, 200, { recorded: true, seq: entry.seq, hash: entry.hash });
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /matters/classification — body {issueId, tier}
    //
    // Task H (fix 1a): the operator/launcher/chief-of-staff intake registers a
    // matter's confidentiality floor here. The registry appends a hash-chained
    // quality receipt (tool=matter_classification; ids/enums/hashes only) and
    // applies a RAISE-ONLY merge: a later lower registration never lowers an
    // existing floor (the attempt is still receipted). At egress the effective
    // confidentiality = max(registered floor, request tier).
    // ------------------------------------------------------------------
    if (method === "POST" && url === "/matters/classification") {
      try {
        const { body: rawBody, limitExceeded } = await readBody(req);
        if (limitExceeded) {
          sendJson(res, 413, { error: "request_too_large" });
          return;
        }
        const errorReceipt = (): void => {
          deps.receipts.append({
            kind: "quality",
            tool: "matter_classification",
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(rawBody),
          });
        };
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          errorReceipt();
          sendJson(res, 400, { error: "invalid_json" });
          return;
        }
        const b = parsed as Record<string, unknown>;
        const issueId = b["issueId"];
        const tier = b["tier"];
        if (typeof issueId !== "string" || !SAFE_ID_RE.test(issueId) || !isConfidentiality(tier)) {
          errorReceipt();
          sendJson(res, 400, {
            error: "invalid_classification: requires issueId matching [A-Za-z0-9-]{1,64} and tier one of standard|confidential|privileged",
          });
          return;
        }
        let result;
        try {
          result = matterClassifications.register({ issueId, tier });
        } catch (err) {
          errorReceipt();
          sendJson(res, 400, {
            error: `classification_rejected: ${err instanceof Error ? err.message : "invalid input"}`,
          });
          return;
        }
        sendJson(res, 200, {
          registered: true,
          issueId: result.issueId,
          requestedTier: result.requestedTier,
          effectiveTier: result.effectiveTier,
        });
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // GET /matters/classification?issueId= — read-back (no receipt; read-only)
    // ------------------------------------------------------------------
    if (method === "GET" && url.startsWith("/matters/classification")) {
      try {
        const parsedUrl = new URL(url, "http://localhost");
        const issueId = parsedUrl.searchParams.get("issueId");
        if (issueId === null || !SAFE_ID_RE.test(issueId)) {
          sendJson(res, 400, { error: "invalid_issueId: required query param issueId must match [A-Za-z0-9-]{1,64}" });
          return;
        }
        sendJson(res, 200, { issueId, tier: matterClassifications.get(issueId) ?? null });
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
      return;
    }

    // ------------------------------------------------------------------
    // POST /egress/{tool}
    // ------------------------------------------------------------------
    const egressMatch = url.match(/^\/egress\/([^/?#]+)(?:\?.*)?$/);
    if (method === "POST" && egressMatch) {
      const tool = decodeURIComponent(egressMatch[1]);
      // C2 (a): entire egress handler wrapped in try/catch
      try {
        await handleEgress(tool, req, res, { policy, receipts, client, performers, localModelAvailable, citationRegistry: deps.citationRegistry, authorityRegistry: deps.authorityRegistry, matterClassifications, log, maxUploadBytes });
      } catch (outerErr) {
        // Best-effort: try to append an error receipt; if the chain itself is
        // corrupt, log a no-payload line and continue — process stays alive.
        try {
          const msg = outerErr instanceof Error ? outerErr.message : "internal_error";
          log(`egress_unhandled_error tool=${tool} err=${msg}`);
          receipts.append({
            kind: "egress",
            tool,
            boundary: null,
            decision: null,
            outcome: "error",
            payloadSha256: sha256hex(""),
          });
        } catch {
          log(`egress_receipt_failed tool=${tool}`);
        }
        if (!res.headersSent) {
          sendJson(res, 500, { error: "internal_error" });
        }
      }
      return;
    }

    // ------------------------------------------------------------------
    // 404 everything else
    // ------------------------------------------------------------------
    sendJson(res, 404, { error: "not_found" });
  });

  return server;
}

// ---------------------------------------------------------------------------
// Egress pipeline
// ---------------------------------------------------------------------------

async function handleEgress(
  tool: string,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  deps: Required<GateServerDeps>,
): Promise<void> {
  const { policy, receipts, client, performers, localModelAvailable, citationRegistry, authorityRegistry, matterClassifications, log } = deps;

  // 1. Read raw body (with size cap). Task 4.1: upload_document may carry a
  // base64-encoded file, so its body cap scales to hold maxUploadBytes of
  // decoded content (×4/3 base64 overhead) plus the normal 1 MB envelope
  // budget (documentText, name, meta, JSON syntax). Every other tool keeps
  // the strict 1 MB cap.
  const bodyCap =
    tool === "upload_document"
      ? Math.ceil(deps.maxUploadBytes / 3) * 4 + MAX_BODY_BYTES
      : MAX_BODY_BYTES;
  const { body: rawBody, limitExceeded } = await readBody(req, bodyCap);

  if (limitExceeded) {
    // I2 (a): body exceeded 1 MB cap
    receipts.append({
      kind: "egress",
      tool,
      boundary: null,
      decision: null,
      outcome: "error",
      payloadSha256: sha256hex(""),
    });
    sendJson(res, 413, { error: "request_too_large" });
    return;
  }

  // 2. Parse — malformed JSON or non-object payload → 400 + "error" receipt
  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    const payloadSha256 = sha256hex(rawBody);
    receipts.append({
      kind: "egress",
      tool,
      boundary: null,
      decision: null,
      outcome: "error",
      payloadSha256,
    });
    sendJson(res, 400, { error: "invalid_json: request body is not valid JSON" });
    return;
  }

  const bodyObj = parsedBody as Record<string, unknown>;
  const rawPayload = bodyObj["payload"];

  if (rawPayload === null || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
    const payloadSha256 = sha256hex(rawBody);
    receipts.append({
      kind: "egress",
      tool,
      boundary: null,
      decision: null,
      outcome: "error",
      payloadSha256,
    });
    sendJson(res, 400, { error: "invalid_payload: 'payload' field must be an object" });
    return;
  }

  const payload = rawPayload as Record<string, unknown>;

  // minor: meta must be a plain object when present → else 400 + error receipt
  const rawMeta = bodyObj["meta"];
  if (rawMeta !== undefined) {
    if (rawMeta === null || typeof rawMeta !== "object" || Array.isArray(rawMeta)) {
      const payloadSha256 = sha256hex(rawBody);
      receipts.append({
        kind: "egress",
        tool,
        boundary: null,
        decision: null,
        outcome: "error",
        payloadSha256,
      });
      sendJson(res, 400, { error: "invalid_meta: 'meta' field must be an object" });
      return;
    }
  }

  const meta = (rawMeta as EgressMeta | undefined) ?? {};

  // I1 (a): validate agent-supplied IDs against safe pattern
  if (!isValidId(meta.issueId)) {
    const payloadSha256 = sha256hex(rawBody);
    receipts.append({
      kind: "egress",
      tool,
      boundary: null,
      decision: null,
      outcome: "error",
      payloadSha256,
    });
    sendJson(res, 400, { error: "invalid_meta: meta.issueId contains invalid characters" });
    return;
  }
  if (!isValidId(meta.approvalId)) {
    const payloadSha256 = sha256hex(rawBody);
    receipts.append({
      kind: "egress",
      tool,
      boundary: null,
      decision: null,
      outcome: "error",
      payloadSha256,
    });
    sendJson(res, 400, { error: "invalid_meta: meta.approvalId contains invalid characters" });
    return;
  }
  if (!isValidId(meta.agentId)) {
    const payloadSha256 = sha256hex(rawBody);
    receipts.append({
      kind: "egress",
      tool,
      boundary: null,
      decision: null,
      outcome: "error",
      payloadSha256,
    });
    sendJson(res, 400, { error: "invalid_meta: meta.agentId contains invalid characters" });
    return;
  }

  // I2 (c): enforce entity list size cap at server layer → 400
  const rawEntities = meta.entities;
  if (rawEntities !== undefined) {
    if (rawEntities.length > MAX_ENTITIES) {
      const payloadSha256 = sha256hex(rawBody);
      receipts.append({
        kind: "egress",
        tool,
        boundary: null,
        decision: null,
        outcome: "error",
        payloadSha256,
      });
      sendJson(res, 400, { error: `invalid_meta: meta.entities exceeds maximum of ${MAX_ENTITIES} entries` });
      return;
    }
    for (const e of rawEntities) {
      if (typeof e === "string" && e.length > MAX_ENTITY_LENGTH) {
        const payloadSha256 = sha256hex(rawBody);
        receipts.append({
          kind: "egress",
          tool,
          boundary: null,
          decision: null,
          outcome: "error",
          payloadSha256,
        });
        sendJson(res, 400, { error: `invalid_meta: entity exceeds maximum length of ${MAX_ENTITY_LENGTH} characters` });
        return;
      }
    }
  }

  // 2b. Task 4.1 — binary upload contract (upload_document + contentBase64).
  // FIXED payload contract (shared with the courier skill — do not rename):
  //   contentBase64  base64 file bytes, mutually exclusive with content
  //   documentText   REQUIRED reviewable text companion (citation gate input)
  //   mimeType       optional explicit MIME; else derived from name extension
  // All violations fail closed: 400/413 + error receipt, no dispatch. The
  // receipt never carries content — errors are static codes; the success
  // receipt carries only {bytes, mimeType} and the sha of the decoded bytes.
  let binaryPayloadSha256: string | null = null;
  // Human-gate binding for binary uploads. The RECEIPT sha stays the decoded-
  // bytes sha (binaryPayloadSha256), but the human approval must be pinned to
  // the FULL payload (destination/folderId/name/documentText/...) so an approval
  // for "upload bytes X to folder A with text T" cannot be replayed with the
  // SAME bytes but a DIFFERENT destination/name/text. Computed over the payload
  // with contentBase64 replaced by the decoded-bytes sha (bytes never leave in
  // the approval channel). Null for text uploads (they bind the full payload
  // via payloadSha256 already).
  let binaryApprovalSha256: string | null = null;
  let binaryReceiptMeta: Record<string, unknown> = {};
  if (tool === "upload_document" && payload["contentBase64"] !== undefined) {
    const failBinary = (status: number, errorCode: string, message: string): void => {
      receipts.append({
        kind: "egress",
        tool,
        boundary: null,
        decision: null,
        outcome: "error",
        payloadSha256: sha256hex(rawBody),
        agentId: meta.agentId,
        issueId: meta.issueId,
        meta: { error: errorCode, claimedConfidentiality: sanitizeClaimedConfidentiality(meta.confidentiality) },
      });
      sendJson(res, status, { error: message });
    };

    const b64 = payload["contentBase64"];
    if (typeof b64 !== "string" || b64.length === 0) {
      failBinary(400, "invalid_content_base64", "invalid_payload: contentBase64 must be a non-empty base64 string");
      return;
    }
    if (payload["content"] !== undefined) {
      failBinary(400, "content_conflict", "invalid_payload: content and contentBase64 are mutually exclusive");
      return;
    }
    // Fail closed: a binary upload without reviewable text must never pass a
    // citation-gated boundary — require documentText up front for ALL binary
    // uploads so citation enforcement cannot be bypassed by shipping bytes.
    const documentText = payload["documentText"];
    if (typeof documentText !== "string" || documentText.trim().length === 0) {
      failBinary(
        400,
        "missing_document_text",
        "invalid_payload: contentBase64 requires a non-empty documentText companion (the reviewable text of the document)",
      );
      return;
    }
    if (payload["mimeType"] !== undefined && !isValidMimeType(payload["mimeType"])) {
      failBinary(400, "invalid_mime_type", "invalid_payload: mimeType must be a single valid MIME type token");
      return;
    }
    const decodedBytes = decodeBase64Strict(b64);
    if (decodedBytes === null) {
      failBinary(400, "invalid_base64", "invalid_base64: contentBase64 is not valid base64");
      return;
    }
    if (decodedBytes.length > deps.maxUploadBytes) {
      failBinary(413, "upload_too_large", "upload_too_large: decoded contentBase64 exceeds the maximum upload size");
      return;
    }
    // Receipts: payloadSha256 for a binary upload = sha256 of the DECODED
    // bytes (what actually egresses), and meta carries size + resolved MIME
    // only — never content.
    binaryPayloadSha256 = crypto.createHash("sha256").update(decodedBytes).digest("hex");
    // Human-gate binding: the FULL payload with contentBase64 replaced by the
    // decoded-bytes sha. Pins the approval to destination/folderId/name/
    // documentText/... — not just the bytes — so an approved upload cannot be
    // replayed with the same bytes but a different destination or text.
    binaryApprovalSha256 = sha256hex(
      canonicalJson(JSON.parse(JSON.stringify({ ...payload, contentBase64: binaryPayloadSha256 }))),
    );
    const resolvedMime = resolveUploadMimeType(payload["name"], payload["mimeType"]) ?? "application/octet-stream";
    binaryReceiptMeta = { binary: { bytes: decodedBytes.length, mimeType: resolvedMime } };
  }

  // 3. Compute payloadSha256 — normalized payload JSON for text egress; the
  // decoded bytes for binary uploads (Task 4.1). This is the RECEIPT sha.
  const payloadSha256 = binaryPayloadSha256 ?? sha256hex(canonicalJson(JSON.parse(JSON.stringify(payload))));

  // Human-gate binding sha. Text uploads already bind the full payload via
  // payloadSha256 (the canonical payload JSON). Binary uploads use
  // binaryApprovalSha256 (full payload with bytes represented by their sha) so
  // an approval cannot be replayed with the same bytes but a different
  // destination/name/documentText — while the receipt keeps the decoded-bytes
  // sha (audit invariant).
  const humanGateSha256 = binaryApprovalSha256 ?? payloadSha256;

  // 3b. Task H — EFFECTIVE confidentiality. meta.confidentiality is typed by
  // the CALLING AGENT and cannot be trusted alone: the gate's own registered
  // per-matter floor (receipt-derived) takes precedence via a raise-only
  // merge — the request may RAISE the tier, never LOWER it. When neither a
  // floor nor a usable claim exists, query_external_model (the secondary-model
  // channel) fails closed to the policy's unspecified-confidentiality default.
  // The effective value drives boundary classification + tier-floor +
  // anonymizer below; receipts stay honest by recording claimed vs effective
  // separately (enums/booleans only).
  const registeredFloor =
    meta.issueId !== undefined ? matterClassifications.get(meta.issueId) : undefined;
  const confResolution = resolveEffectiveConfidentiality({
    claimed: meta.confidentiality,
    registeredFloor,
    // Fail-closed unless the firm explicitly set "standard" (any other value —
    // including a malformed policy object at runtime — keeps the default).
    unspecifiedDefault:
      tool === "query_external_model" && policy.unspecifiedConfidentialityDefault !== "standard"
        ? "confidential"
        : null,
  });
  const effectiveConfidentiality = confResolution.effective;

  // I5: claimedConfidentiality in every egress receipt meta (what the caller
  // SENT); effectiveConfidentiality + confidentialityFloorApplied record what
  // the gate actually enforced, only when they differ from the claim.
  const claimedConfidentiality = sanitizeClaimedConfidentiality(meta.confidentiality);
  const confidentialityAudit: Record<string, unknown> = {};
  if (effectiveConfidentiality !== undefined && effectiveConfidentiality !== meta.confidentiality) {
    confidentialityAudit["effectiveConfidentiality"] = effectiveConfidentiality;
  }
  if (confResolution.floorApplied) confidentialityAudit["confidentialityFloorApplied"] = true;

  // Downstream consumers (classify, tier-floor, anonymizer, performers, human
  // gate) see the EFFECTIVE meta. The ORIGINAL `meta` object keeps the claimed
  // value for honest receipts.
  const effectiveMeta: EgressMeta =
    effectiveConfidentiality !== undefined
      ? { ...meta, confidentiality: effectiveConfidentiality }
      : meta;

  const egressReq: EgressRequest = { tool, payload, meta: effectiveMeta };

  // 4. Classify — UnknownToolError → 403 blocked (fail-closed)
  let boundary: ReturnType<typeof classify>;
  try {
    boundary = classify(egressReq);
  } catch (err) {
    if (err instanceof UnknownToolError) {
      // Deliberately NOT best-effort: if this append throws (corrupt chain), the
      // outer handler returns 500 — the proxy refuses normal operation rather
      // than serve an un-receipted decision. Receipt-on-every-path is strict.
      receipts.append({
        kind: "egress",
        tool,
        boundary: null,
        decision: null,
        outcome: "blocked",
        payloadSha256,
        agentId: meta.agentId,
        issueId: meta.issueId,
        meta: { claimedConfidentiality, ...confidentialityAudit },
      });
      sendJson(res, 403, { error: `unknown_tool: ${tool}` });
      return;
    }
    throw err;
  }

  // 5. Decide
  const decision = decide(boundary, policy);

  // Authority-provenance signal computed in the citation gate (5b) and threaded
  // onto whatever egress receipt the dispatch (step 6) ultimately writes, so the
  // hallucination flag rides on the SAME receipt as the egress decision. Empty
  // by default; set only on a citation-gated boundary that carries a document.
  let authorityReceiptMeta: Record<string, unknown> = {};

  // 5b. Citation gate (OUTBOUND_QUALITY): on configured boundaries, egress that
  // CARRIES LEGAL CITATIONS must have a registered, passing citation verification
  // bound to the document's sha before any dispatch (including the human gate).
  // A document with no detectable citations has nothing to re-check and passes
  // the gate (matches the Phase 2 goal: "egress carrying legal citations").
  // Fail-closed: a gated boundary whose payload carries no reviewable document
  // text at all is blocked (we cannot rule out citations we cannot see).
  if (boundary !== null && policy.citationGate.boundaries.includes(boundary)) {
    const documentText = extractDocumentText(tool, payload);
    if (documentText === null) {
      receipts.append({
        kind: "egress", tool, boundary, decision, outcome: "blocked",
        payloadSha256, agentId: meta.agentId, issueId: meta.issueId, approvalId: meta.approvalId,
        meta: { reason: "citation_gate_no_document", claimedConfidentiality, ...confidentialityAudit },
      });
      sendJson(res, 403, { decision: "block", reason: "citation_gate: no reviewable document text on a citation-gated boundary" });
      return;
    }
    const docSha = documentSha256(documentText);
    if (extractCitations(documentText).length > 0 && !citationRegistry.has(docSha)) {
      receipts.append({
        kind: "egress", tool, boundary, decision, outcome: "blocked",
        payloadSha256, agentId: meta.agentId, issueId: meta.issueId, approvalId: meta.approvalId,
        meta: { reason: "citation_gate_unverified", documentSha256: docSha, claimedConfidentiality, ...confidentialityAudit },
      });
      sendJson(res, 403, { decision: "block", reason: "citation_gate: no registered citation verification for this document" });
      return;
    }

    // 5c. Authority provenance (anti-hallucination): partition the document's
    // citations into those that were RETRIEVED (registered via POST
    // /quality/authority) and those that were NOT. `unbacked` is cited-but-
    // never-retrieved — a hallucination signal.
    //
    // Default behavior is RECORD/FLAG only: we stash unbackedCitations so it is
    // written onto the egress receipt the dispatch step produces — existing
    // pass/block behavior is UNCHANGED. When the policy opts in
    // (requireAuthorityProvenance) AND there is at least one unbacked citation,
    // we block here with a clear reason.
    const authority = authorityRegistry.verifyDocument(documentText);
    if (authority.unbacked.length > 0) {
      authorityReceiptMeta = {
        unbackedCitations: authority.unbacked,
        backedCitationCount: authority.backed.length,
        documentSha256: docSha,
      };
      if (policy.citationGate.requireAuthorityProvenance) {
        receipts.append({
          kind: "egress", tool, boundary, decision, outcome: "blocked",
          payloadSha256, agentId: meta.agentId, issueId: meta.issueId, approvalId: meta.approvalId,
          meta: { reason: "authority_provenance_unbacked", ...authorityReceiptMeta, claimedConfidentiality, ...confidentialityAudit },
        });
        sendJson(res, 403, {
          decision: "block",
          reason: "authority_provenance: document cites authorities that were never retrieved",
          unbackedCitations: authority.unbacked,
        });
        return;
      }
    }

    // 5d. Per-segment provenance (verifiable-first). Segment the outbound
    // document and label each paragraph: `sourced` if it carries a citation that
    // was ACTUALLY retrieved (authorityRegistry.hasCitation), else `unsourced`.
    // Recorded on the egress receipt's meta (rides via authorityReceiptMeta →
    // extraReceiptMeta) — segment shas/indices/kinds only, never segment text.
    // The signoff bundle projects this into the Matter Trust Report.
    const prov = buildProvenance(documentText, {
      isCitationBacked: (c) => authorityRegistry.hasCitation(c),
    });
    const provSegments = prov.segments.slice(0, MAX_PROVENANCE_SEGMENTS);
    authorityReceiptMeta = {
      ...authorityReceiptMeta,
      provenance: {
        documentSha256: prov.documentSha256,
        segmentCount: prov.segmentCount,
        summary: prov.summary,
        segments: provSegments,
        ...(prov.segments.length > provSegments.length ? { segmentsTruncated: true } : {}),
      },
    };
  }

  // Extra non-payload audit meta that rides on the dispatched receipt:
  // binary upload facts (Task 4.1) + authority/provenance signals (5b–5d) +
  // confidentiality enforcement audit (Task H: effective tier + floor marker).
  const extraReceiptMeta: Record<string, unknown> = { ...binaryReceiptMeta, ...authorityReceiptMeta, ...confidentialityAudit };

  // 6. Dispatch by decision
  switch (decision) {
    // -----------------------------------------------------------------------
    case "block": {
      receipts.append({
        kind: "egress",
        tool,
        boundary,
        decision,
        outcome: "blocked",
        payloadSha256,
        agentId: meta.agentId,
        issueId: meta.issueId,
        approvalId: meta.approvalId,
        meta: { claimedConfidentiality, ...confidentialityAudit },
      });
      sendJson(res, 403, { decision: "block", reason: `blocked by policy: ${String(boundary)}` });
      return;
    }

    // -----------------------------------------------------------------------
    case "allow": {
      await performAndReceipt({
        performers, receipts, tool, boundary, decision, payloadSha256,
        meta, useLocal: false, egressReq, res, log,
        responseDecisionLabel: "allow",
        extraReceiptMeta,
      });
      return;
    }

    // -----------------------------------------------------------------------
    case "anonymize": {
      // FIX 4 (honesty): dataTerms is NOT yet threaded here (staged — not wired
      // into the live egress path). The ZDR branches in tier-floor.ts are
      // unreachable at runtime until dataTerms is added as a parameter.
      // Task H: the tier-floor reasons over the EFFECTIVE confidentiality
      // (registered floor ∨ raised claim ∨ fail-closed default) — never the
      // raw self-reported label.
      const tierResult = evaluateTierFloor({
        confidentiality: effectiveMeta.confidentiality,
        targetTier: "cloud",
        localAvailable: localModelAvailable,
      });

      if (tierResult.action === "block") {
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "blocked",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
          meta: {
            reason: tierResult.reason,
            claimedConfidentiality,
            ...confidentialityAudit,
            ...(tierResult.dataTermsTier !== undefined ? { dataTermsTier: tierResult.dataTermsTier } : {}),
          },
        });
        sendJson(res, 403, { decision: "block", reason: tierResult.reason });
        return;
      }

      // Task H (problem 2): a useLocal "allow" is only honored for tools whose
      // performers genuinely route locally (LOCAL_ROUTABLE_TOOLS). For any
      // other tool the performer would IGNORE useLocal and ship the UNMASKED
      // payload to its real vendor while the receipt claimed routedLocal:true
      // — a lying receipt. Those tools fall through to the anonymize path
      // below (mask then perform when entities allow, else block) so the
      // receipt records what ACTUALLY happened.
      if (tierResult.action === "allow" && (!tierResult.useLocal || LOCAL_ROUTABLE_TOOLS.has(tool))) {
        // Route local (useLocal:true) with UNMASKED payload — or plain cloud
        // allow (useLocal:false) for a standard-tier payload.
        await performAndReceipt({
          performers, receipts, tool, boundary, decision, payloadSha256,
          meta, useLocal: tierResult.useLocal, dataTermsTier: tierResult.dataTermsTier,
          egressReq, res, log,
          responseDecisionLabel: "allow",
          extraReceiptMeta,
        });
        return;
      }

      // tierResult.action === "anonymize", OR a useLocal allow for a tool
      // whose performer cannot route locally (fail-closed: mask or block —
      // never an unmasked vendor send under a routedLocal label).
      // v1: only string field 'prompt' is the anonymizable surface
      const promptVal = payload["prompt"];
      if (typeof promptVal !== "string") {
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "blocked",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
          meta: { reason: "anonymize_unsupported_payload", claimedConfidentiality, ...confidentialityAudit },
        });
        sendJson(res, 403, { decision: "block", reason: "anonymize_unsupported_payload: payload must have a string 'prompt' field" });
        return;
      }

      const entities = meta.entities ?? [];
      const anonResult = anonymize(promptVal, entities);

      if (anonResult.confidence === 0) {
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "blocked",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
          meta: { reason: "anonymizer_cannot_vouch: confidence=0", claimedConfidentiality, ...confidentialityAudit },
        });
        sendJson(res, 403, { decision: "block", reason: "anonymizer_cannot_vouch: anonymizer returned confidence=0; cannot proceed safely" });
        return;
      }

      // confidence === 1 → perform with masked payload; deanonymize result locally
      const maskedPayload = { ...payload, prompt: anonResult.masked };
      const maskedReq: EgressRequest = { tool, payload: maskedPayload, meta: effectiveMeta };

      await performAndReceipt({
        performers, receipts, tool, boundary, decision, payloadSha256,
        meta, useLocal: false, egressReq: maskedReq, res, log,
        deanonymizeMap: anonResult.map,
        responseDecisionLabel: "anonymize",
        extraReceiptMeta,
      });
      return;
    }

    // -----------------------------------------------------------------------
    case "human": {
      if (client === null) {
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "blocked",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
          meta: { reason: "human_gate_unavailable: paperclip client not configured", claimedConfidentiality, ...confidentialityAudit },
        });
        sendJson(res, 503, { error: "human_gate_unavailable" });
        return;
      }

      let gateResult: Awaited<ReturnType<typeof humanGate>>;
      try {
        // Bind the approval to humanGateSha256 (full payload), not the receipt
        // sha — see the humanGateSha256 computation above.
        gateResult = await humanGate(client, egressReq, boundary!, humanGateSha256);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`human_gate_error tool=${tool}`);
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "error",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
          meta: { error: msg, claimedConfidentiality, ...confidentialityAudit },
        });
        sendJson(res, 502, { error: msg });
        return;
      }

      switch (gateResult.status) {
        case "pending_approval": {
          receipts.append({
            kind: "egress",
            tool,
            boundary,
            decision,
            outcome: "pending",
            payloadSha256,
            agentId: meta.agentId,
            issueId: meta.issueId,
            approvalId: gateResult.approvalId,
            meta: { claimedConfidentiality, ...extraReceiptMeta },
          });
          sendJson(res, 202, {
            status: "pending_approval",
            approvalId: gateResult.approvalId,
            resumeHint: gateResult.resumeHint,
          });
          return;
        }

        case "approved": {
          await performAndReceipt({
            performers, receipts, tool, boundary, decision, payloadSha256,
            meta, approvalId: gateResult.approvalId, useLocal: false,
            egressReq, res, log,
            responseDecisionLabel: "human",
            extraReceiptMeta,
          });
          return;
        }

        case "blocked": {
          receipts.append({
            kind: "egress",
            tool,
            boundary,
            decision,
            outcome: "blocked",
            payloadSha256,
            agentId: meta.agentId,
            issueId: meta.issueId,
            approvalId: gateResult.approvalId,
            meta: { reason: gateResult.reason, claimedConfidentiality, ...confidentialityAudit },
          });
          sendJson(res, 403, { status: "blocked", reason: gateResult.reason });
          return;
        }
      }
    }

    // -----------------------------------------------------------------------
    default: {
      // Should never reach here with a typed Decision
      const _exhaustive: never = decision;
      receipts.append({
        kind: "egress",
        tool,
        boundary,
        decision: null,
        outcome: "error",
        payloadSha256,
        agentId: meta.agentId,
        issueId: meta.issueId,
        approvalId: meta.approvalId,
        meta: { error: `unhandled_decision: ${String(_exhaustive)}`, claimedConfidentiality, ...confidentialityAudit },
      });
      sendJson(res, 500, { error: "internal_error: unhandled decision" });
    }
  }
}
