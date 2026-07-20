import { it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGateServer } from "./server.ts";
import { ReceiptChain } from "./receipts.ts";
import { DEFAULT_POLICY } from "./policy.ts";
import { loadPolicy } from "./policy.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";
import type { PerformerRegistry } from "./connectors.ts";
import type { PaperclipClient } from "./paperclip-client.ts";
import type {
  GateAuthorizationTarget,
  TrustedDestination,
} from "./authorization.ts";

async function start(
  agentId: string,
  grants: Record<string, GateAuthorizationTarget[]>,
  destinations: Record<string, TrustedDestination> = {},
  destinationGrants: Record<string, string[]> = {},
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-authorization-server-"));
  const receipts = new ReceiptChain(path.join(dir, "receipts.jsonl"));
  let performed = 0;
  const performers: PerformerRegistry = {
    send_email: async () => { performed += 1; return { sent: true }; },
    upload_document: async () => { performed += 1; return { id: "file-1" }; },
  };
  const server = createGateServer({
    policy: { ...DEFAULT_POLICY, citationGate: { boundaries: [], requireAuthorityProvenance: false } },
    receipts,
    client: null,
    performers,
    localModelAvailable: false,
    citationRegistry: new CitationRegistry(receipts),
    authorityRegistry: new AuthorityRegistry(receipts),
    inboundAuth: {
      companyId: "company-1",
      authenticate: async () => ({ agentId, companyId: "company-1" }),
    },
    authorization: {
      version: 1,
      companyId: "company-1",
      default: "deny",
      grants,
      destinations,
      destinationGrants,
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { address: string; port: number };
  return {
    url: `http://${address.address}:${address.port}`,
    receipts,
    receiptPath: path.join(dir, "receipts.jsonl"),
    performed: () => performed,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function post(
  baseUrl: string,
  tool: string,
  payloadOverride?: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/egress/${tool}`, {
    method: "POST",
    headers: { authorization: "Bearer agent-key", "content-type": "application/json" },
    body: JSON.stringify({
      payload: payloadOverride ?? (tool === "upload_document"
        ? { destinationId: "firm-review-google", name: "draft.txt", content: "draft" }
        : { to: "client@example.test", subject: "Draft", body: "draft" }),
    }),
  });
}

it("allows an exact specialist grant and denies a different protected tool before dispatch", async () => {
  const srv = await start("agent-courier-1", {
    "agent-courier-1": ["egress:upload_document"],
  }, {
    "firm-review-google": { provider: "gdrive", folderId: "folder-server-1" },
  }, {
    "agent-courier-1": ["firm-review-google"],
  });
  try {
    assert.equal((await post(srv.url, "upload_document")).status, 200);
    const denied = await post(srv.url, "send_email");
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "forbidden" });
    assert.equal(srv.performed(), 1);
    const receipt = srv.receipts.entries().at(-1)?.body;
    assert.equal(receipt?.kind, "authorization");
    assert.equal(receipt?.agentId, "agent-courier-1");
    assert.equal(receipt?.tool, "egress:send_email");
    assert.equal(receipt?.outcome, "blocked");
    assert.deepEqual(receipt?.meta, {
      reason: "capability_missing",
      enforcementDigest: receipt?.meta?.["enforcementDigest"],
    });
    const ledger = fs.readFileSync(srv.receiptPath, "utf8");
    assert.ok(!ledger.includes("client@example.test"));
    assert.ok(!ledger.includes("Draft"));
  } finally {
    await srv.close();
  }
});

it("resolves a trusted upload alias server-side and rejects raw or ungranted selectors", async () => {
  const seen: Array<Record<string, unknown>> = [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-authorization-destination-"));
  const receipts = new ReceiptChain(path.join(dir, "receipts.jsonl"));
  const server = createGateServer({
    policy: { ...DEFAULT_POLICY, citationGate: { boundaries: [], requireAuthorityProvenance: false } },
    receipts,
    client: null,
    performers: { upload_document: async (req) => { seen.push(req.payload); return { id: "file-1" }; } },
    localModelAvailable: false,
    citationRegistry: new CitationRegistry(receipts),
    authorityRegistry: new AuthorityRegistry(receipts),
    inboundAuth: {
      companyId: "company-1",
      authenticate: async () => ({ agentId: "agent-courier-1", companyId: "company-1" }),
    },
    authorization: {
      version: 1,
      companyId: "company-1",
      default: "deny",
      grants: { "agent-courier-1": ["egress:upload_document"] },
      destinations: {
        "firm-review-google": { provider: "gdrive", folderId: "folder-server-1" },
      },
      destinationGrants: { "agent-courier-1": ["firm-review-google"] },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { address: string; port: number };
  const url = `http://${address.address}:${address.port}`;
  try {
    assert.equal((await post(url, "upload_document", {
      destinationId: "firm-review-google",
      name: "draft.txt",
      content: "draft",
    })).status, 200);
    assert.deepEqual(seen, [{
      destination: "gdrive",
      folderId: "folder-server-1",
      name: "draft.txt",
      content: "draft",
    }]);
    const raw = await post(url, "upload_document", {
      destination: "gdrive",
      folderId: "attacker-folder",
      name: "draft.txt",
      content: "draft",
    });
    assert.equal(raw.status, 403);
    assert.deepEqual(await raw.json(), { error: "forbidden" });
    assert.equal(seen.length, 1);
    assert.equal(receipts.entries().at(-1)?.body.kind, "authorization");
    assert.equal(receipts.entries().at(-1)?.body.meta?.["reason"], "destination_not_allowed");
    const ledger = fs.readFileSync(path.join(dir, "receipts.jsonl"), "utf8");
    assert.ok(!ledger.includes("attacker-folder"));
    assert.ok(!ledger.includes("folder-server-1"));
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it("fails closed on an unmapped authenticated route and records a safe denial", async () => {
  const srv = await start("agent-courier-1", { "agent-courier-1": ["egress:upload_document"] });
  try {
    const response = await fetch(`${srv.url}/future-protected-route`, {
      headers: { authorization: "Bearer agent-key" },
    });
    assert.equal(response.status, 403);
    assert.equal(srv.receipts.entries().at(-1)?.body.kind, "authorization");
    assert.equal(srv.receipts.entries().at(-1)?.body.meta?.["reason"], "unmapped_route");
  } finally {
    await srv.close();
  }
});

it("returns 503 and performs nothing when an authorization denial cannot be receipted", async () => {
  const srv = await start("agent-unprivileged-2", { "agent-courier-1": ["egress:upload_document"] });
  try {
    fs.writeFileSync(srv.receiptPath, "{}\n", "utf8");
    const response = await post(srv.url, "upload_document");
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "receipts_unavailable" });
    assert.equal(srv.performed(), 0);
  } finally {
    await srv.close();
  }
});

it("denies a different immutable agent ID even if it claims the specialist name elsewhere", async () => {
  const srv = await start("agent-unprivileged-2", {
    "agent-courier-1": ["egress:upload_document"],
  });
  try {
    const denied = await post(srv.url, "upload_document");
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: "forbidden" });
    assert.equal(srv.performed(), 0);
  } finally {
    await srv.close();
  }
});

it("auto-files only a principal-authorized firm root under the shipped human third-party policy", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-authorization-shipped-policy-"));
  const receipts = new ReceiptChain(path.join(dir, "receipts.jsonl"));
  let uploads = 0;
  let emails = 0;
  let approvals = 0;
  const policy = loadPolicy(path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../../companies/legal-operations/gate-policy.yaml",
  ));
  const client = {
    createApproval: async () => {
      approvals += 1;
      return { id: "approval-1" };
    },
    linkIssueApproval: async () => undefined,
  } as unknown as PaperclipClient;
  const server = createGateServer({
    policy: { ...policy, citationGate: { boundaries: [], requireAuthorityProvenance: false } },
    receipts,
    client,
    performers: {
      upload_document: async () => { uploads += 1; return { id: "file-1" }; },
      send_email: async () => { emails += 1; return { id: "message-1" }; },
    },
    localModelAvailable: false,
    citationRegistry: new CitationRegistry(receipts),
    authorityRegistry: new AuthorityRegistry(receipts),
    inboundAuth: {
      companyId: "company-1",
      authenticate: async () => ({ agentId: "agent-specialist-1", companyId: "company-1" }),
    },
    authorization: {
      version: 1,
      companyId: "company-1",
      default: "deny",
      grants: {
        "agent-specialist-1": ["egress:upload_document", "egress:send_email"],
      },
      destinations: {
        "firm-review-google": { provider: "gdrive", folderId: "folder-server-1" },
      },
      destinationGrants: { "agent-specialist-1": ["firm-review-google"] },
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { address: string; port: number };
  const url = `http://${address.address}:${address.port}`;
  try {
    assert.equal((await post(url, "upload_document")).status, 200);
    assert.equal(uploads, 1);
    assert.equal(approvals, 0);

    const email = await post(url, "send_email");
    assert.equal(email.status, 202);
    assert.equal(emails, 0);
    assert.equal(approvals, 1);

    const raw = await post(url, "upload_document", {
      destination: "gdrive",
      folderId: "attacker-folder",
      name: "draft.txt",
      content: "draft",
    });
    assert.equal(raw.status, 403);
    assert.equal(uploads, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
