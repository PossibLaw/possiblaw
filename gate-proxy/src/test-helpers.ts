// gate-proxy/src/test-helpers.ts
// Shared test harness helpers for gate-proxy integration tests.
// Extracted from server.test.ts patterns (pure refactor — no behavior change).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReceiptChain } from "./receipts.ts";
import { DEFAULT_POLICY } from "./policy.ts";
import type { Performer, PerformerRegistry } from "./connectors.ts";
import { createGateServer } from "./server.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestServer {
  baseUrl: string;
  receipts: ReceiptChain;
  citationRegistry: CitationRegistry;
  close: () => Promise<void>;
}

export interface EgressResponse {
  status: number;
  body: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-server-test-"));
}

/** Start a test gate server with default policy and all tools stubbed as no-ops.
 * The citation registry is wired to the receipt chain so registerCitation works. */
export async function startTestServer(): Promise<TestServer> {
  const dir = tmpDir();
  const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
  const citationRegistry = new CitationRegistry(receipts);

  // Stub all standard performers so egress paths don't error on missing credentials
  const noOp: Performer = async () => ({});
  const performers: PerformerRegistry = {
    send_email: noOp,
    upload_document: noOp,
    query_external_model: noOp,
    share_external: noOp,
    file_court_document: noOp,
    sign_document: noOp,
    send_payment: noOp,
    delete_external_resource: noOp,
  };

  const server = createGateServer({
    policy: DEFAULT_POLICY,
    receipts,
    client: null,
    performers,
    localModelAvailable: false,
    citationRegistry,
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { address: string; port: number };
  const baseUrl = `http://${addr.address}:${addr.port}`;

  const close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );

  return { baseUrl, receipts, citationRegistry, close };
}

/** POST to /egress/<tool> with payload wrapped in the standard envelope. */
export async function postEgress(
  srv: TestServer,
  tool: string,
  payload: Record<string, unknown>,
): Promise<EgressResponse> {
  const res = await fetch(`${srv.baseUrl}/egress/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  const body = (await res.json()) as Record<string, unknown>;
  return { status: res.status, body };
}

/** Register a citation verification for a document via POST /quality/citation. */
export async function registerCitation(
  srv: TestServer,
  document: string,
  rows: Array<{ citation: string; match: string; quoted?: string; sourcePassage?: string }>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${srv.baseUrl}/quality/citation`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      document,
      rows,
      meta: { agentId: "test-agent", issueId: "test-issue" },
    }),
  });
  return (await res.json()) as Record<string, unknown>;
}
