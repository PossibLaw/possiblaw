import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { ReceiptChain, ReceiptChainCorruptError, sha256hex } from "./receipts.ts";
import { probePaperclipCompanyAccess } from "./paperclip-client.ts";
import type { PaperclipClient } from "./paperclip-client.ts";
import { createGateServer } from "./server.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";
import { DEFAULT_POLICY } from "./policy.ts";
import type { PerformerRegistry } from "./connectors.ts";
import { assembleSignoffBundle } from "./quality/signoff.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-readiness-test-"));
}

async function startServer(input: {
  receipts: ReceiptChain;
  performers?: PerformerRegistry;
  client?: PaperclipClient | null;
  paperclipReadiness?: (() => Promise<void>) | null;
  instanceId?: string;
  companyId?: string | null;
  policyDigest?: string;
  startupSecret?: string;
}): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createGateServer({
    policy: { ...DEFAULT_POLICY, citationGate: { boundaries: [], requireAuthorityProvenance: false } },
    receipts: input.receipts,
    client: input.client ?? null,
    performers: input.performers ?? {},
    localModelAvailable: false,
    citationRegistry: new CitationRegistry(input.receipts),
    authorityRegistry: new AuthorityRegistry(input.receipts),
    paperclipReadiness: input.paperclipReadiness ?? null,
    instanceId: input.instanceId ?? "gate-test-instance",
    companyId: input.companyId ?? "CO1",
    policyDigest: input.policyDigest ?? "a".repeat(64),
    ...(input.startupSecret !== undefined ? { startupSecret: input.startupSecret } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { address: string; port: number };
  return {
    baseUrl: `http://${address.address}:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}

describe("receipt-store readiness", () => {
  it("verifies integrity and appendability without adding a probe receipt", () => {
    const filePath = path.join(tmpDir(), "receipts.jsonl");
    const receipts = new ReceiptChain(filePath);
    receipts.append({
      kind: "egress",
      tool: "send_email",
      boundary: "THIRD_PARTY_EGRESS",
      decision: "allow",
      outcome: "performed",
      payloadSha256: sha256hex("existing"),
    });
    const before = fs.readFileSync(filePath);

    receipts.assertAppendable();

    assert.deepEqual(fs.readFileSync(filePath), before);
    assert.equal(receipts.entries().length, 1);
  });

  it("rejects a fully corrupt chain even when its tail is parseable", () => {
    const filePath = path.join(tmpDir(), "receipts.jsonl");
    const receipts = new ReceiptChain(filePath);
    receipts.append({
      kind: "egress",
      tool: "send_email",
      boundary: "THIRD_PARTY_EGRESS",
      decision: "allow",
      outcome: "performed",
      payloadSha256: sha256hex("existing"),
    });
    const entry = JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
    entry["prevHash"] = "0".repeat(64);
    fs.writeFileSync(filePath, JSON.stringify(entry) + "\n");

    assert.throws(() => receipts.assertAppendable(), ReceiptChainCorruptError);
  });
});

describe("Paperclip readiness probe", () => {
  it("authenticates a company-scoped GET without exposing the key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "AGENT-1", companyId: "CO 1/x" }), { status: 200 });
    }) as typeof fetch;

    await probePaperclipCompanyAccess({
      baseUrl: "http://127.0.0.1:3100/",
      companyId: "CO 1/x",
      apiKey: "gate-key-secret",
      fetchImpl,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://127.0.0.1:3100/api/agents/me");
    assert.equal(calls[0].init?.method, "GET");
    assert.equal(
      (calls[0].init?.headers as Record<string, string>)["Authorization"],
      "Bearer gate-key-secret",
    );
  });

  it("fails before the network when an authenticated key is absent", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    await assert.rejects(
      probePaperclipCompanyAccess({
        baseUrl: "http://127.0.0.1:3100",
        companyId: "CO1",
        fetchImpl,
      }),
      /authenticated Paperclip readiness requires an API key/,
    );
    assert.equal(calls, 0);
  });

  it("rejects an agent key bound to a different company", async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({ id: "AGENT-2", companyId: "OTHER-CO" }),
      { status: 200 },
    )) as typeof fetch;

    await assert.rejects(
      probePaperclipCompanyAccess({
        baseUrl: "http://127.0.0.1:3100",
        companyId: "EXPECTED-CO",
        apiKey: "gate-key-secret",
        fetchImpl,
      }),
      /configured company/,
    );
  });

  it("rejects a same-company key for a different gate agent", async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({ id: "AGENT-OTHER", companyId: "EXPECTED-CO" }),
      { status: 200 },
    )) as typeof fetch;

    await assert.rejects(
      probePaperclipCompanyAccess({
        baseUrl: "http://127.0.0.1:3100",
        companyId: "EXPECTED-CO",
        apiKey: "gate-key-secret",
        expectedAgentId: "AGENT-GATE",
        fetchImpl,
      }),
      /configured gate agent/,
    );
  });

  it("rejects a board key because /api/agents/me requires an agent actor", async () => {
    const fetchImpl = (async () => new Response(
      JSON.stringify({ error: "Agent authentication required" }),
      { status: 401 },
    )) as typeof fetch;

    await assert.rejects(
      probePaperclipCompanyAccess({
        baseUrl: "http://127.0.0.1:3100",
        companyId: "EXPECTED-CO",
        apiKey: "board-key",
        fetchImpl,
      }),
      /PaperclipApiError: 401 \/api\/agents\/me/,
    );
  });
});

describe("GET /ready", () => {
  it("fails closed when a Paperclip client lacks an authenticated readiness probe", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    const client = {} as PaperclipClient;
    const srv = await startServer({ receipts, client });
    try {
      const response = await fetch(`${srv.baseUrl}/ready`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { ok: false, error: "paperclip_unavailable" });
    } finally {
      await srv.close();
    }
  });

  it("checks receipts before Paperclip and leaves no probe receipt", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    let paperclipChecks = 0;
    const srv = await startServer({
      receipts,
      paperclipReadiness: async () => { paperclipChecks++; },
    });
    try {
      const response = await fetch(`${srv.baseUrl}/ready`);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), {
        ok: true,
        receipts: "ready",
        paperclip: "ready",
        instanceId: "gate-test-instance",
        companyId: "CO1",
        policyDigest: "a".repeat(64),
      });
      assert.equal(paperclipChecks, 1);
      assert.equal(receipts.entries().length, 0);
    } finally {
      await srv.close();
    }
  });

  it("returns an HMAC proof bound to the exact startup identity tuple", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    const instanceId = "39b9e369-ed73-4a95-ad44-20de7039a3a7";
    const companyId = "CO1";
    const policyDigest = "b".repeat(64);
    const startupSecret = "c".repeat(64);
    const srv = await startServer({
      receipts,
      instanceId,
      companyId,
      policyDigest,
      startupSecret,
    });
    try {
      const response = await fetch(`${srv.baseUrl}/ready`);
      assert.equal(response.status, 200);
      const body = await response.json() as Record<string, unknown>;
      const expected = crypto
        .createHmac("sha256", startupSecret)
        .update(`${instanceId}\n${companyId}\n${policyDigest}`)
        .digest("hex");
      assert.equal(body["startupProof"], expected);
      assert.match(String(body["startupProof"]), /^[0-9a-f]{64}$/);

      const forgedForAnotherCompany = crypto
        .createHmac("sha256", startupSecret)
        .update(`${instanceId}\nOTHER-CO\n${policyDigest}`)
        .digest("hex");
      assert.notEqual(body["startupProof"], forgedForAnotherCompany);
      assert.equal(JSON.stringify(body).includes(startupSecret), false);
    } finally {
      await srv.close();
    }
  });

  it("refuses startup attestation without a concrete company binding", () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    assert.throws(
      () => createGateServer({
        policy: { ...DEFAULT_POLICY, citationGate: { boundaries: [], requireAuthorityProvenance: false } },
        receipts,
        client: null,
        performers: {},
        localModelAvailable: false,
        citationRegistry: new CitationRegistry(receipts),
        authorityRegistry: new AuthorityRegistry(receipts),
        instanceId: "39b9e369-ed73-4a95-ad44-20de7039a3a7",
        companyId: null,
        policyDigest: "b".repeat(64),
        startupSecret: "c".repeat(64),
      }),
      /company binding/,
    );
  });

  it("fails closed and skips Paperclip when receipts are unavailable", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    let paperclipChecks = 0;
    Object.defineProperty(receipts, "assertAppendable", {
      value: () => { throw new Error("disk-secret-path"); },
    });
    const srv = await startServer({
      receipts,
      paperclipReadiness: async () => { paperclipChecks++; },
    });
    try {
      const response = await fetch(`${srv.baseUrl}/ready`);
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { ok: false, error: "receipts_unavailable" });
      assert.equal(paperclipChecks, 0);
    } finally {
      await srv.close();
    }
  });

  it("fails closed with a sanitized response when company access fails", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    const srv = await startServer({
      receipts,
      paperclipReadiness: async () => { throw new Error("gate-key-secret"); },
    });
    try {
      const response = await fetch(`${srv.baseUrl}/ready`);
      assert.equal(response.status, 503);
      const raw = await response.text();
      assert.equal(raw, JSON.stringify({ ok: false, error: "paperclip_unavailable" }));
      assert.ok(!raw.includes("gate-key-secret"));
    } finally {
      await srv.close();
    }
  });
});

describe("durable dispatch reservation", () => {
  it("does not misrepresent an indeterminate reservation as a board attestation", () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    receipts.append({
      kind: "egress",
      tool: "file_court_document",
      boundary: "COURT_FILING",
      decision: "human",
      outcome: "reserved",
      payloadSha256: sha256hex("filing"),
      issueId: "ISSUE-1",
      approvalId: "APPROVAL-1",
      meta: { dispatchReservation: true },
    });

    const bundle = assembleSignoffBundle(receipts, "ISSUE-1");
    assert.equal(bundle.receipts.length, 1);
    assert.equal(bundle.attestations.length, 0);
  });

  it("writes a reservation before invoking a performer", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    let observed: string[] = [];
    const srv = await startServer({
      receipts,
      performers: {
        send_email: async () => {
          observed = receipts.entries().map((entry) => entry.body.outcome);
          return { id: "msg-1" };
        },
      },
    });
    try {
      const response = await fetch(`${srv.baseUrl}/egress/send_email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { to: "a@example.com", subject: "s", body: "b" } }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(observed, ["reserved"]);
      const entries = receipts.entries();
      assert.deepEqual(entries.map((entry) => entry.body.outcome), ["reserved", "performed"]);
      assert.match(entries[0].body.operationId ?? "", /^[0-9a-f]{64}$/);
      assert.equal(entries[1].body.operationId, entries[0].body.operationId);
    } finally {
      await srv.close();
    }
  });

  it("never invokes a performer when the receipt store cannot preflight", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    Object.defineProperty(receipts, "assertAppendable", {
      value: () => { throw new Error("unavailable"); },
    });
    let performerCalls = 0;
    const srv = await startServer({
      receipts,
      performers: { send_email: async () => { performerCalls++; return {}; } },
    });
    try {
      const response = await fetch(`${srv.baseUrl}/egress/send_email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { to: "a@example.com", subject: "s", body: "b" } }),
      });
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "receipts_unavailable" });
      assert.equal(performerCalls, 0);
    } finally {
      await srv.close();
    }
  });

  it("retains a durable indeterminate reservation if completion persistence fails", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    const originalAppend = receipts.append.bind(receipts);
    let appendCalls = 0;
    Object.defineProperty(receipts, "append", {
      value: (body: Parameters<ReceiptChain["append"]>[0]) => {
        appendCalls++;
        if (appendCalls === 1) return originalAppend(body);
        throw new Error("simulated post-dispatch storage failure");
      },
    });
    let performerCalls = 0;
    const srv = await startServer({
      receipts,
      performers: { send_email: async () => { performerCalls++; return { id: "msg-1" }; } },
    });
    try {
      const response = await fetch(`${srv.baseUrl}/egress/send_email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { to: "a@example.com", subject: "s", body: "b" } }),
      });
      assert.equal(response.status, 500);
      assert.equal(performerCalls, 1);
      const entries = receipts.entries();
      assert.equal(entries.length, 1);
      assert.equal(entries[0].body.outcome, "reserved");
      assert.equal(entries[0].body.meta?.["dispatchReservation"], true);
      assert.match(entries[0].body.operationId ?? "", /^[0-9a-f]{64}$/);

      const retry = await fetch(`${srv.baseUrl}/egress/send_email`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload: { to: "a@example.com", subject: "s", body: "b" } }),
      });
      assert.equal(retry.status, 409);
      assert.deepEqual(await retry.json(), {
        error: "indeterminate_dispatch",
        operationId: entries[0].body.operationId,
      });
      assert.equal(performerCalls, 1, "retry must not repeat an indeterminate external dispatch");
    } finally {
      await srv.close();
    }
  });

  it("does not retry a performer after an indeterminate performer error", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
    let performerCalls = 0;
    const srv = await startServer({
      receipts,
      performers: {
        send_email: async () => {
          performerCalls++;
          throw new Error("provider timeout");
        },
      },
    });
    const request = () => fetch(`${srv.baseUrl}/egress/send_email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { to: "a@example.com", subject: "s", body: "b" } }),
    });
    try {
      assert.equal((await request()).status, 502);
      const entries = receipts.entries();
      assert.deepEqual(entries.map((entry) => entry.body.outcome), ["reserved", "error"]);
      assert.equal(entries[1].body.operationId, entries[0].body.operationId);
      assert.equal(entries[1].body.meta?.["dispatchIndeterminate"], true);

      const retry = await request();
      assert.equal(retry.status, 409);
      assert.equal(performerCalls, 1);
    } finally {
      await srv.close();
    }
  });
});
