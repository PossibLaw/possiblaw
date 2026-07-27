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
import { ReceiptChain, canonicalJson, sha256hex } from "./receipts.ts";
import { acquireReceiptStoreLease } from "./receipt-lease.ts";
import { loadPolicy } from "./policy.ts";
import { PaperclipClient, probePaperclipCompanyAccess } from "./paperclip-client.ts";
import { buildPerformers } from "./connectors.ts";
import { createGateServer } from "./server.ts";
import { pollOnce } from "./poller.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";
import { MatterClassificationRegistry } from "./matter-classification.ts";
import { resolveStartupAttestationEnvironment } from "./startup-attestation.ts";
import { resolveTsaUrl } from "./anchor-tsa.ts";
import type { TraceSink } from "./trace-sink.ts";
import {
  appendTrace,
  loadTraceConfig,
  makeTraceRecord,
} from "@possiblaw/trace-store";
import { createPaperclipInboundAuthenticator, resolveInboundAuthEnvironment } from "./inbound-auth.ts";
import {
  resolveFetchMaxResponseBytes,
  resolveFetchTimeoutMs,
  withFetchTimeout,
} from "./fetch-timeout.ts";
import {
  DEFAULT_GATE_AUTHORIZATION,
  loadGateAuthorization,
} from "./authorization.ts";

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
const PAPERCLIP_GATE_API_KEY = process.env["PAPERCLIP_GATE_API_KEY"];
const PAPERCLIP_GATE_AGENT_ID = process.env["PAPERCLIP_GATE_AGENT_ID"];

const LOCAL_MODEL_URL = process.env["LOCAL_MODEL_URL"];
const localModelAvailable = typeof LOCAL_MODEL_URL === "string" && LOCAL_MODEL_URL.length > 0;

const POLLER_INTERVAL_MS = parseInt(process.env["GATE_POLLER_INTERVAL_MS"] ?? "30000", 10);

function resolveShutdownTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) return 10_000;
  if (!/^\d+$/.test(raw)) {
    throw new Error("GATE_SHUTDOWN_TIMEOUT_MS must be an integer");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1_000 || value > 10_000) {
    throw new Error("GATE_SHUTDOWN_TIMEOUT_MS must be between 1000 and 10000");
  }
  return value;
}

const SHUTDOWN_TIMEOUT_MS = resolveShutdownTimeoutMs(
  process.env["GATE_SHUTDOWN_TIMEOUT_MS"],
);

// Task 4.1: decoded-size cap for contentBase64 binary uploads (default 25 MB).
// createGateServer falls back to its default on NaN/non-positive values.
const GATE_MAX_UPLOAD_BYTES = process.env["GATE_MAX_UPLOAD_BYTES"];
const maxUploadBytes = GATE_MAX_UPLOAD_BYTES !== undefined ? parseInt(GATE_MAX_UPLOAD_BYTES, 10) : undefined;
const inboundAuthEnvironment = resolveInboundAuthEnvironment(process.env);
const authorization = inboundAuthEnvironment.requireAuth
  ? loadGateAuthorization(
      process.env["GATE_AUTHORIZATION_PATH"],
      inboundAuthEnvironment.companyId,
    )
  : DEFAULT_GATE_AUTHORIZATION;
const outboundFetch = withFetchTimeout(
  globalThis.fetch,
  resolveFetchTimeoutMs(process.env),
  resolveFetchMaxResponseBytes(process.env),
);

// ---------------------------------------------------------------------------
// Build deps
// ---------------------------------------------------------------------------

const policy = loadPolicy(POLICY_PATH);
const policySource = POLICY_PATH ? `file:${POLICY_PATH}` : "defaults";
const startupAttestation = resolveStartupAttestationEnvironment(process.env);
const instanceId = startupAttestation.instanceId;
const policyDigest = sha256hex(canonicalJson({ policy, authorization }));
// A1: optional RFC 3161 external witness for POST /receipts/anchor. A malformed
// GATE_TSA_URL throws here, at startup, rather than at the first anchor.
const tsaUrl = resolveTsaUrl(process.env);

// ---------------------------------------------------------------------------
// M2 — execution-trace sink.
//
// Reads the same fail-closed `trace:` section of gate-policy.yaml the trace
// store owns; a closed config yields a null sink and nothing is recorded or
// stamped. Traces live beside the receipts ledger but in their own directory:
// the ledger is hash-only and shareable, traces are content-bearing and stay
// inside the perimeter.
//
// The sink never throws — bindTrace treats a throw as "no binding", but a
// trace failure must not even look like an egress failure, so errors are
// swallowed here and surfaced as a missing traceId on the receipt.
// ---------------------------------------------------------------------------
const traceConfig = loadTraceConfig(POLICY_PATH);
const TRACE_DIR = path.join(path.dirname(RECEIPTS_PATH), "traces");

const traceSink: TraceSink | null = traceConfig.enabled
  ? (input) => {
      try {
        const record = makeTraceRecord(
          {
            agentId: input.agentId ?? "unknown",
            outcome: input.outcome === "performed" || input.outcome === "anonymized_performed"
              ? "ok"
              : input.outcome === "blocked"
                ? "blocked"
                : "error",
            ...(input.issueId !== undefined ? { issueId: input.issueId } : {}),
            ...(input.requestedBy !== undefined ? { requestedBy: input.requestedBy } : {}),
            ...(PAPERCLIP_COMPANY_ID ? { companyId: PAPERCLIP_COMPANY_ID } : {}),
            contextRefs: [{ kind: "connector", ref: input.tool }],
          },
          traceConfig,
        );
        if (record === null) return null;
        appendTrace(TRACE_DIR, record);
        return { traceId: record.traceId, traceSha256: record.contentSha256 };
      } catch {
        return null;
      }
    }
  : null;

const receipts = new ReceiptChain(RECEIPTS_PATH, PAPERCLIP_COMPANY_ID);

// Two required env vars must be set to construct a client (API key is optional); else null
const client =
  PAPERCLIP_BASE_URL && PAPERCLIP_COMPANY_ID
    ? new PaperclipClient({
        baseUrl: PAPERCLIP_BASE_URL,
        companyId: PAPERCLIP_COMPANY_ID,
        apiKey: PAPERCLIP_GATE_API_KEY,
        expectedAgentId: PAPERCLIP_GATE_AGENT_ID,
        fetchImpl: outboundFetch,
      })
    : null;

// Any partial Paperclip configuration is not ready. A complete configuration
// must include a dedicated API key so /ready proves authenticated,
// company-scoped access rather than merely proving network reachability.
const paperclipEnvConfigured = Boolean(
  PAPERCLIP_BASE_URL || PAPERCLIP_COMPANY_ID || PAPERCLIP_GATE_API_KEY || PAPERCLIP_GATE_AGENT_ID,
);
const paperclipReadiness: (() => Promise<void>) | null = !paperclipEnvConfigured
  ? null
  : PAPERCLIP_BASE_URL && PAPERCLIP_COMPANY_ID && PAPERCLIP_GATE_API_KEY && PAPERCLIP_GATE_AGENT_ID
    ? () => probePaperclipCompanyAccess({
        baseUrl: PAPERCLIP_BASE_URL,
        companyId: PAPERCLIP_COMPANY_ID,
        apiKey: PAPERCLIP_GATE_API_KEY,
        expectedAgentId: PAPERCLIP_GATE_AGENT_ID,
        fetchImpl: outboundFetch,
      })
    : async () => { throw new Error("paperclip readiness configuration incomplete"); };

const performers = buildPerformers(
  process.env as Record<string, string | undefined>,
  outboundFetch,
);

const citationRegistry = new CitationRegistry(receipts);
const authorityRegistry = new AuthorityRegistry(receipts);
const matterClassifications = new MatterClassificationRegistry(receipts);
const inboundAuth = inboundAuthEnvironment.requireAuth
  ? {
      companyId: inboundAuthEnvironment.companyId,
      authenticate: createPaperclipInboundAuthenticator({
        baseUrl: inboundAuthEnvironment.baseUrl,
        fetchImpl: outboundFetch,
      }),
    }
  : null;

const log = (line: string): void => {
  // Safety: never include payload text in log lines — sanitized by contract
  console.log(`[gate-proxy] ${new Date().toISOString()} ${line}`);
};

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = createGateServer({
  policy,
  receipts,
  client,
  performers,
  localModelAvailable,
  citationRegistry,
  authorityRegistry,
  matterClassifications,
  log,
  ...(maxUploadBytes !== undefined ? { maxUploadBytes } : {}),
  paperclipReadiness,
  instanceId,
  companyId: PAPERCLIP_COMPANY_ID ?? null,
  policyDigest,
  tsaUrl,
  traceSink,
  ...(startupAttestation.startupSecret !== undefined
    ? { startupSecret: startupAttestation.startupSecret }
    : {}),
  inboundAuth,
  ...(authorization.companyId !== null ? { authorization } : {}),
});

// Acquire only after all server dependencies are constructed, but before the
// socket or poller can perform work. The atomic lock is held until shutdown.
const receiptLease = acquireReceiptStoreLease(RECEIPTS_PATH, instanceId);

// ---------------------------------------------------------------------------
// Process lifecycle
// ---------------------------------------------------------------------------

let pollerTimer: NodeJS.Timeout | null = null;
let pollerRun: Promise<void> | null = null;
let shutdownStarted = false;
let shutdownExitCode = 0;
let shutdownFinished = false;
let shutdownDeadlineTimer: NodeJS.Timeout | null = null;

function releaseLeaseAndExit(): void {
  if (shutdownFinished) return;
  shutdownFinished = true;
  if (shutdownDeadlineTimer !== null) clearTimeout(shutdownDeadlineTimer);
  try {
    receiptLease.release();
    log(shutdownExitCode === 0 ? "shutdown complete" : "fatal shutdown complete");
    process.exit(shutdownExitCode);
  } catch {
    log("shutdown lease_release_failed");
    process.exit(1);
  }
}

function shutdown(exitCode = 0): void {
  if (exitCode !== 0) shutdownExitCode = 1;
  if (shutdownStarted) return;
  shutdownStarted = true;
  if (pollerTimer !== null) clearInterval(pollerTimer);

  // A native or injected fetch may ignore cancellation. Never let one stalled
  // request make the launcher SIGKILL the gate while its writer lease remains
  // on disk. The durable pre-dispatch reservation is intentionally left
  // indeterminate for operator reconciliation before the process exits 1.
  shutdownDeadlineTimer = setTimeout(() => {
    shutdownExitCode = 1;
    log("shutdown_deadline_exceeded");
    releaseLeaseAndExit();
  }, SHUTDOWN_TIMEOUT_MS);

  const finish = (): void => {
    // server.close waits for HTTP dispatches; also wait for a poll already in
    // flight before releasing the single-writer lease.
    void (pollerRun ?? Promise.resolve()).finally(() => {
      releaseLeaseAndExit();
    });
  };

  if (!server.listening) {
    finish();
    return;
  }
  server.close((err) => {
    if (err) shutdownExitCode = 1;
    finish();
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

// Unknown process state is never allowed to keep serving. Log only the event
// class (exception messages can contain client payloads or credentials), stop
// accepting work, release the writer lease, and exit 1.
process.on("unhandledRejection", () => {
  log("unhandled_rejection");
  shutdown(1);
});

process.on("uncaughtException", () => {
  log("uncaught_exception");
  shutdown(1);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  const code = typeof err.code === "string" && /^[A-Z0-9_]{1,64}$/.test(err.code)
    ? err.code
    : "UNKNOWN";
  log(`server_error: ${code}`);
  shutdown(1);
});

try {
  server.listen(PORT, "127.0.0.1", () => {
    log(
      `port=${PORT} policy=${policySource} receipts=${RECEIPTS_PATH} ` +
        `paperclip=${client ? "yes" : "no"} localModel=${localModelAvailable ? "yes" : "no"}`,
    );
  });
} catch {
  // Invalid ports and other synchronous listen failures do not emit `error`.
  log("server_error: LISTEN_THROWN");
  shutdown(1);
}

// ---------------------------------------------------------------------------
// Rejection poller
// ---------------------------------------------------------------------------

if (!shutdownStarted && client !== null) {
  pollerTimer = setInterval(() => {
    if (pollerRun !== null) return;
    pollerRun = (async () => {
      try {
        await pollOnce(receipts, client);
      } catch {
        // Error details may include sensitive remote response data.
        log("poller_error");
      }
    })().finally(() => { pollerRun = null; });
  }, POLLER_INTERVAL_MS);

  // unref so the timer doesn't prevent clean shutdown
  pollerTimer.unref();
}
