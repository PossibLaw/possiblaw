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
import type { Policy } from "./policy.ts";
import type { ReceiptChain, ReceiptBody } from "./receipts.ts";
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

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface GateServerDeps {
  policy: Policy;
  receipts: ReceiptChain;
  client: PaperclipClient | null; // null = paperclip unconfigured → human gates FAIL CLOSED (503)
  performers: PerformerRegistry;
  localModelAvailable: boolean;
  log?: (line: string) => void; // NEVER log payload text
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** I2 (a): max body size in bytes before we reply 413. */
const MAX_BODY_BYTES = 1_000_000;

/** I1 (a): safe ID pattern — only alphanumeric + hyphen, 1–64 chars. */
const SAFE_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

/** I2 (c): entity list / per-entity caps — mirrored from anonymize.ts for server-level 400 guard. */
const MAX_ENTITIES = 256;
const MAX_ENTITY_LENGTH = 256;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function noop(_line: string): void { /* intentional no-op */ }

/**
 * C2: readBody with:
 *   - body-size cap (I2 a): resolves with null + sets the limitExceeded flag when
 *     > MAX_BODY_BYTES are received (caller responds 413).
 *   - 'error' event handler for client aborts (C2 c).
 */
function readBody(req: http.IncomingMessage): Promise<{ body: string; limitExceeded: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let limitExceeded = false;

    req.on("data", (chunk: Buffer) => {
      if (limitExceeded) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
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
  egressReq: EgressRequest;
  /** For the anonymize path: de-token the model response string before sending. */
  deanonymizeMap?: Record<string, string>;
  res: http.ServerResponse;
  log: (line: string) => void;
  /** The decision label to return in the JSON response (allow | anonymize | human). */
  responseDecisionLabel: string;
}

async function performAndReceipt(opts: PerformAndReceiptInput): Promise<void> {
  const {
    performers, receipts, tool, boundary, decision, payloadSha256,
    meta, approvalId, useLocal, egressReq, deanonymizeMap, res,
    log: _log, responseDecisionLabel,
  } = opts;

  // I5: claimedConfidentiality in every egress receipt meta
  const claimedConfidentiality = meta.confidentiality ?? "unspecified";

  const performer = performers[tool];
  try {
    const result = await performer(egressReq, { useLocal });

    // Build extra receipt meta
    const receiptMeta: Record<string, unknown> = { claimedConfidentiality };
    if (useLocal) receiptMeta["routedLocal"] = true;
    if (deanonymizeMap) receiptMeta["maskedTokenCount"] = Object.keys(deanonymizeMap).length;

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
    const errorReceiptMeta: Record<string, unknown> = { error: msg, claimedConfidentiality };
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
    // POST /egress/{tool}
    // ------------------------------------------------------------------
    const egressMatch = url.match(/^\/egress\/([^/?#]+)(?:\?.*)?$/);
    if (method === "POST" && egressMatch) {
      const tool = decodeURIComponent(egressMatch[1]);
      // C2 (a): entire egress handler wrapped in try/catch
      try {
        await handleEgress(tool, req, res, { policy, receipts, client, performers, localModelAvailable, log });
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
  const { policy, receipts, client, performers, localModelAvailable, log } = deps;

  // 1. Read raw body (with size cap)
  const { body: rawBody, limitExceeded } = await readBody(req);

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

  // 3. Compute payloadSha256 over the normalized payload
  const payloadSha256 = sha256hex(canonicalJson(JSON.parse(JSON.stringify(payload))));

  const egressReq: EgressRequest = { tool, payload, meta };

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
        meta: { claimedConfidentiality: meta.confidentiality ?? "unspecified" },
      });
      sendJson(res, 403, { error: `unknown_tool: ${tool}` });
      return;
    }
    throw err;
  }

  // 5. Decide
  const decision = decide(boundary, policy);

  // I5: claimedConfidentiality in every egress receipt meta
  const claimedConfidentiality = meta.confidentiality ?? "unspecified";

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
        meta: { claimedConfidentiality },
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
      });
      return;
    }

    // -----------------------------------------------------------------------
    case "anonymize": {
      const tierResult = evaluateTierFloor({
        confidentiality: meta.confidentiality,
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
          meta: { reason: tierResult.reason, claimedConfidentiality },
        });
        sendJson(res, 403, { decision: "block", reason: tierResult.reason });
        return;
      }

      if (tierResult.action === "allow") {
        // Route local (useLocal:true) with UNMASKED payload
        await performAndReceipt({
          performers, receipts, tool, boundary, decision, payloadSha256,
          meta, useLocal: tierResult.useLocal, egressReq, res, log,
          responseDecisionLabel: "allow",
        });
        return;
      }

      // tierResult.action === "anonymize"
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
          meta: { reason: "anonymize_unsupported_payload", claimedConfidentiality },
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
          meta: { reason: "anonymizer_cannot_vouch: confidence=0", claimedConfidentiality },
        });
        sendJson(res, 403, { decision: "block", reason: "anonymizer_cannot_vouch: anonymizer returned confidence=0; cannot proceed safely" });
        return;
      }

      // confidence === 1 → perform with masked payload; deanonymize result locally
      const maskedPayload = { ...payload, prompt: anonResult.masked };
      const maskedReq: EgressRequest = { tool, payload: maskedPayload, meta };

      await performAndReceipt({
        performers, receipts, tool, boundary, decision, payloadSha256,
        meta, useLocal: false, egressReq: maskedReq, res, log,
        deanonymizeMap: anonResult.map,
        responseDecisionLabel: "anonymize",
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
          meta: { reason: "human_gate_unavailable: paperclip client not configured", claimedConfidentiality },
        });
        sendJson(res, 503, { error: "human_gate_unavailable" });
        return;
      }

      let gateResult: Awaited<ReturnType<typeof humanGate>>;
      try {
        gateResult = await humanGate(client, egressReq, boundary!, payloadSha256);
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
          meta: { error: msg, claimedConfidentiality },
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
            meta: { claimedConfidentiality },
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
            meta: { reason: gateResult.reason, claimedConfidentiality },
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
        meta: { error: `unhandled_decision: ${String(_exhaustive)}`, claimedConfidentiality },
      });
      sendJson(res, 500, { error: "internal_error: unhandled decision" });
    }
  }
}
