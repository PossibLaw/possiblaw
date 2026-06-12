// ---------------------------------------------------------------------------
// index.ts — Gate-proxy entrypoint.
//
// Reads env, wires deps, starts the HTTP server on 127.0.0.1 ONLY, and
// starts the rejection poller.  SIGINT/SIGTERM → close server, exit 0.
//
// SECURITY: binds to loopback only; never logs payload text.
// ---------------------------------------------------------------------------

import os from "node:os";
import path from "node:path";
import { ReceiptChain } from "./receipts.ts";
import { loadPolicy } from "./policy.ts";
import { PaperclipClient } from "./paperclip-client.ts";
import { buildPerformers } from "./connectors.ts";
import { createGateServer } from "./server.ts";
import { pollOnce } from "./poller.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------

const PORT = parseInt(process.env["GATE_PROXY_PORT"] ?? "3801", 10);

const POLICY_PATH = process.env["GATE_POLICY_PATH"]; // undefined → defaults

const RECEIPTS_PATH =
  process.env["GATE_RECEIPTS_PATH"] ??
  path.join(os.homedir(), ".possiblaw", "gate-receipts", "default", "receipts.jsonl");

const PAPERCLIP_BASE_URL = process.env["PAPERCLIP_BASE_URL"];
const PAPERCLIP_COMPANY_ID = process.env["PAPERCLIP_COMPANY_ID"];
const PAPERCLIP_GATE_API_KEY = process.env["PAPERCLIP_GATE_API_KEY"]; // optional

const LOCAL_MODEL_URL = process.env["LOCAL_MODEL_URL"];
const localModelAvailable = typeof LOCAL_MODEL_URL === "string" && LOCAL_MODEL_URL.length > 0;

const POLLER_INTERVAL_MS = parseInt(process.env["GATE_POLLER_INTERVAL_MS"] ?? "30000", 10);

// ---------------------------------------------------------------------------
// Build deps
// ---------------------------------------------------------------------------

const policy = loadPolicy(POLICY_PATH);
const policySource = POLICY_PATH ? `file:${POLICY_PATH}` : "defaults";

const receipts = new ReceiptChain(RECEIPTS_PATH);

// Two required env vars must be set to construct a client (API key is optional); else null
const client =
  PAPERCLIP_BASE_URL && PAPERCLIP_COMPANY_ID
    ? new PaperclipClient({
        baseUrl: PAPERCLIP_BASE_URL,
        companyId: PAPERCLIP_COMPANY_ID,
        apiKey: PAPERCLIP_GATE_API_KEY,
      })
    : null;

const performers = buildPerformers(process.env as Record<string, string | undefined>);

const citationRegistry = new CitationRegistry(receipts);

const log = (line: string): void => {
  // Safety: never include payload text in log lines — sanitized by contract
  console.log(`[gate-proxy] ${new Date().toISOString()} ${line}`);
};

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = createGateServer({ policy, receipts, client, performers, localModelAvailable, citationRegistry, log });

server.listen(PORT, "127.0.0.1", () => {
  log(
    `port=${PORT} policy=${policySource} receipts=${RECEIPTS_PATH} ` +
      `paperclip=${client ? "yes" : "no"} localModel=${localModelAvailable ? "yes" : "no"}`,
  );
});

// ---------------------------------------------------------------------------
// Rejection poller
// ---------------------------------------------------------------------------

if (client !== null) {
  const timer = setInterval(async () => {
    try {
      await pollOnce(receipts, client);
    } catch (err) {
      // Log error code only — never payload
      const msg = err instanceof Error ? err.message : String(err);
      log(`poller_error: ${msg}`);
    }
  }, POLLER_INTERVAL_MS);

  // unref so the timer doesn't prevent clean shutdown
  timer.unref();
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

function shutdown(): void {
  server.close(() => {
    log("shutdown complete");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// C2 (d): keep the process alive on unhandled rejections and uncaught exceptions.
// Log one sanitized line (no payloads) and continue — the server stays up.
process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  // Safety: only log the message, never any payload or stack that could contain it
  log(`unhandled_rejection: ${msg.slice(0, 200)}`);
});

process.on("uncaughtException", (err) => {
  log(`uncaught_exception: ${err.message.slice(0, 200)}`);
});
