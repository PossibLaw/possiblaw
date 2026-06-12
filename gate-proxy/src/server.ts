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
import { anonymize } from "./anonymize.ts";
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
// Internal helpers
// ---------------------------------------------------------------------------

function noop(_line: string): void { /* intentional no-op */ }

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload, "utf8"),
  });
  res.end(payload);
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
      if (client === null) {
        sendJson(res, 503, { error: "paperclip_client_unavailable" });
        return;
      }
      const rawBody = await readBody(req);
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
      return;
    }

    // ------------------------------------------------------------------
    // POST /egress/{tool}
    // ------------------------------------------------------------------
    const egressMatch = url.match(/^\/egress\/([^/?#]+)(?:\?.*)?$/);
    if (method === "POST" && egressMatch) {
      const tool = decodeURIComponent(egressMatch[1]);
      await handleEgress(tool, req, res, { policy, receipts, client, performers, localModelAvailable, log });
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

  // 1. Read raw body
  const rawBody = await readBody(req);

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
  const meta = (bodyObj["meta"] as EgressMeta | undefined) ?? {};

  // 3. Compute payloadSha256 over the normalized payload
  const payloadSha256 = sha256hex(canonicalJson(JSON.parse(JSON.stringify(payload))));

  const egressReq: EgressRequest = { tool, payload, meta };

  // 4. Classify — UnknownToolError → 403 blocked (fail-closed)
  let boundary: ReturnType<typeof classify>;
  try {
    boundary = classify(egressReq);
  } catch (err) {
    if (err instanceof UnknownToolError) {
      receipts.append({
        kind: "egress",
        tool,
        boundary: null,
        decision: null,
        outcome: "blocked",
        payloadSha256,
        agentId: meta.agentId,
        issueId: meta.issueId,
      });
      sendJson(res, 403, { error: `unknown_tool: ${tool}` });
      return;
    }
    throw err;
  }

  // 5. Decide
  const decision = decide(boundary, policy);

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
      });
      sendJson(res, 403, { decision: "block", reason: `blocked by policy: ${String(boundary)}` });
      return;
    }

    // -----------------------------------------------------------------------
    case "allow": {
      const performer = performers[tool];
      try {
        const result = await performer(egressReq, { useLocal: false });
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "performed",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
        });
        sendJson(res, 200, { decision: "allow", result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
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
          meta: { error: msg },
        });
        sendJson(res, 502, { error: msg });
      }
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
          meta: { reason: tierResult.reason },
        });
        sendJson(res, 403, { decision: "block", reason: tierResult.reason });
        return;
      }

      if (tierResult.action === "allow") {
        // Route local (useLocal:true) with UNMASKED payload
        const performer = performers[tool];
        try {
          const result = await performer(egressReq, { useLocal: tierResult.useLocal });
          const receiptMeta: Record<string, unknown> = {};
          if (tierResult.useLocal) receiptMeta["routedLocal"] = true;
          receipts.append({
            kind: "egress",
            tool,
            boundary,
            decision,
            outcome: "performed",
            payloadSha256,
            agentId: meta.agentId,
            issueId: meta.issueId,
            approvalId: meta.approvalId,
            meta: Object.keys(receiptMeta).length > 0 ? receiptMeta : undefined,
          });
          sendJson(res, 200, { decision: "allow", result });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
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
            meta: { error: msg },
          });
          sendJson(res, 502, { error: msg });
        }
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
          meta: { reason: "anonymize_unsupported_payload" },
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
          meta: { reason: "anonymizer_cannot_vouch: confidence=0" },
        });
        sendJson(res, 403, { decision: "block", reason: "anonymizer_cannot_vouch: anonymizer returned confidence=0; cannot proceed safely" });
        return;
      }

      // confidence === 1 → perform with masked payload
      const maskedPayload = { ...payload, prompt: anonResult.masked };
      const maskedReq: EgressRequest = { tool, payload: maskedPayload, meta };
      const maskedTokenCount = Object.keys(anonResult.map).length;

      const performer = performers[tool];
      try {
        const result = await performer(maskedReq, { useLocal: false });
        // NEVER include the anonymization map in the receipt
        receipts.append({
          kind: "egress",
          tool,
          boundary,
          decision,
          outcome: "anonymized_performed",
          payloadSha256,
          agentId: meta.agentId,
          issueId: meta.issueId,
          approvalId: meta.approvalId,
          meta: { maskedTokenCount },
        });
        sendJson(res, 200, { decision: "anonymize", result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
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
          meta: { error: msg },
        });
        sendJson(res, 502, { error: msg });
      }
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
          meta: { reason: "human_gate_unavailable: paperclip client not configured" },
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
          meta: { error: msg },
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
          });
          sendJson(res, 202, {
            status: "pending_approval",
            approvalId: gateResult.approvalId,
            resumeHint: gateResult.resumeHint,
          });
          return;
        }

        case "approved": {
          const performer = performers[tool];
          try {
            const result = await performer(egressReq, { useLocal: false });
            receipts.append({
              kind: "egress",
              tool,
              boundary,
              decision,
              outcome: "performed",
              payloadSha256,
              agentId: meta.agentId,
              issueId: meta.issueId,
              approvalId: gateResult.approvalId,
            });
            sendJson(res, 200, { decision: "human", result });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            receipts.append({
              kind: "egress",
              tool,
              boundary,
              decision,
              outcome: "error",
              payloadSha256,
              agentId: meta.agentId,
              issueId: meta.issueId,
              approvalId: gateResult.approvalId,
              meta: { error: msg },
            });
            sendJson(res, 502, { error: msg });
          }
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
            meta: { reason: gateResult.reason },
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
        meta: { error: `unhandled_decision: ${String(_exhaustive)}` },
      });
      sendJson(res, 500, { error: "internal_error: unhandled decision" });
    }
  }
}
