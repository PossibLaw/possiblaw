import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReceiptChain } from "./receipts.ts";
import { DEFAULT_POLICY } from "./policy.ts";
import type { Performer, PerformerRegistry } from "./connectors.ts";
import { createGateServer } from "./server.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";
import {
  createPaperclipInboundAuthenticator,
  resolveInboundAuthEnvironment,
} from "./inbound-auth.ts";
import type { PaperclipClient } from "./paperclip-client.ts";

const TEST_AUTHORIZATION_TARGETS = [
  "egress:send_email",
  "quality:citation",
  "quality:authority",
  "receipts:facade",
  "receipts:deadline",
  "receipts:anchor",
  "matters:classification:write",
] as const;

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-inbound-auth-test-"));
}

async function startAuthenticatedServer(
  authenticate: (token: string) => Promise<{ agentId: string; companyId: string }>,
  opts: { withPaperclipClient?: boolean } = {},
) {
  const receipts = new ReceiptChain(path.join(tmpDir(), "receipts.jsonl"));
  let performed = 0;
  const performer: Performer = async () => {
    performed += 1;
    return { sent: true };
  };
  const performers: PerformerRegistry = { send_email: performer };
  const paperclipClient = opts.withPaperclipClient
    ? {
        createApproval: async () => ({ id: "approval-1" }),
        getApproval: async () => ({ id: "approval-1", status: "pending", payload: {} }),
        postIssueComment: async () => undefined,
        linkIssueApproval: async () => undefined,
      } as unknown as PaperclipClient
    : null;
  const server = createGateServer({
    policy: { ...DEFAULT_POLICY, citationGate: { boundaries: [], requireAuthorityProvenance: false } },
    receipts,
    client: paperclipClient,
    performers,
    localModelAvailable: false,
    citationRegistry: new CitationRegistry(receipts),
    authorityRegistry: new AuthorityRegistry(receipts),
    inboundAuth: {
      companyId: "company-1",
      authenticate,
    },
    authorization: {
      version: 1,
      companyId: "company-1",
      default: "deny",
      grants: { "agent-1": [...TEST_AUTHORIZATION_TARGETS] },
      destinations: {},
      destinationGrants: {},
    },
    ...(paperclipClient !== null ? { paperclipReadiness: async () => undefined } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { address: string; port: number };
  return {
    baseUrl: `http://${address.address}:${address.port}`,
    receipts,
    performed: () => performed,
    close: () => new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}

async function post(baseUrl: string, token?: string, agentId?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}/egress/send_email`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      payload: { to: "lawyer@example.test", subject: "Review", body: "Draft" },
      ...(agentId !== undefined ? { meta: { agentId } } : {}),
    }),
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

async function postJson(
  baseUrl: string,
  route: string,
  body: Record<string, unknown>,
  token = "agent-secret",
): Promise<Response> {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function postMalformed(
  baseUrl: string,
  route: string,
  token = "agent-secret",
): Promise<Response> {
  return fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{",
  });
}

describe("gate inbound authentication", () => {
  it("accepts a valid company-scoped agent key and derives receipt identity", async () => {
    const seen: string[] = [];
    const srv = await startAuthenticatedServer(async (token) => {
      seen.push(token);
      return { agentId: "agent-1", companyId: "company-1" };
    });
    try {
      const response = await post(srv.baseUrl, "agent-secret");
      assert.equal(response.status, 200);
      assert.deepEqual(seen, ["agent-secret"]);
      assert.equal(srv.performed(), 1);
      assert.equal(srv.receipts.entries().at(-1)?.body.agentId, "agent-1");
    } finally {
      await srv.close();
    }
  });

  it("leaves GET /health and GET /ready unauthenticated", async () => {
    const srv = await startAuthenticatedServer(async () => {
      throw new Error("must not authenticate public probes");
    });
    try {
      assert.equal((await fetch(`${srv.baseUrl}/health`)).status, 200);
      assert.equal((await fetch(`${srv.baseUrl}/ready`)).status, 200);
    } finally {
      await srv.close();
    }
  });

  it("rejects a missing or invalid bearer key without dispatch", async () => {
    const srv = await startAuthenticatedServer(async () => {
      throw new Error("remote authentication rejected");
    });
    try {
      const missing = await post(srv.baseUrl);
      assert.equal(missing.status, 401);
      assert.deepEqual(missing.body, { error: "unauthorized" });
      const invalid = await post(srv.baseUrl, "wrong-secret");
      assert.equal(invalid.status, 401);
      assert.deepEqual(invalid.body, { error: "unauthorized" });
      assert.equal(srv.performed(), 0);
    } finally {
      await srv.close();
    }
  });

  it("rejects a valid agent key bound to another company", async () => {
    const srv = await startAuthenticatedServer(async () => ({ agentId: "agent-2", companyId: "company-2" }));
    try {
      const response = await post(srv.baseUrl, "other-company-secret");
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { error: "forbidden" });
      assert.equal(srv.performed(), 0);
    } finally {
      await srv.close();
    }
  });

  it("rejects caller meta.agentId spoofing", async () => {
    const srv = await startAuthenticatedServer(async () => ({ agentId: "agent-1", companyId: "company-1" }));
    try {
      const response = await post(srv.baseUrl, "agent-secret", "agent-2");
      assert.equal(response.status, 403);
      assert.deepEqual(response.body, { error: "agent_identity_mismatch" });
      assert.equal(srv.performed(), 0);
    } finally {
      await srv.close();
    }
  });

  it("rejects a malformed encoded egress path without crashing the gate", async () => {
    const srv = await startAuthenticatedServer(async () => ({ agentId: "agent-1", companyId: "company-1" }));
    try {
      const malformed = await postJson(srv.baseUrl, "/egress/%ZZ", {});
      assert.equal(malformed.status, 400);
      assert.deepEqual(await malformed.json(), { error: "invalid_tool" });
      assert.equal((await fetch(`${srv.baseUrl}/health`)).status, 200);
    } finally {
      await srv.close();
    }
  });

  it("attributes protected non-egress receipts to the authenticated caller", async () => {
    const srv = await startAuthenticatedServer(
      async () => ({ agentId: "agent-1", companyId: "company-1" }),
      { withPaperclipClient: true },
    );
    try {
      assert.equal((await postJson(srv.baseUrl, "/quality/authority", {
        citation: "410 U.S. 113",
        sha256: "a".repeat(64),
        source: "courtlistener",
      })).status, 200);
      assert.equal((await postJson(srv.baseUrl, "/receipts/deadline", {
        matterId: "matter-1",
        payloadSha256: "b".repeat(64),
        meta: {
          deadline: "2026-08-01",
          rule: "FRCP-6",
          jurisdiction: "US-FED",
          direction: "forward",
          days: 14,
          serviceByMail: false,
        },
      })).status, 200);
      assert.equal((await postJson(srv.baseUrl, "/matters/classification", {
        issueId: "matter-1",
        tier: "confidential",
      })).status, 200);
      assert.equal((await postJson(srv.baseUrl, "/receipts/anchor", {
        issueId: "matter-1",
      })).status, 200);

      const protectedTools = new Set([
        "authority_provenance",
        "deadline_calculation",
        "matter_classification",
        "anchor",
      ]);
      const protectedReceipts = srv.receipts.entries().filter((entry) =>
        protectedTools.has(entry.body.tool),
      );
      assert.ok(protectedReceipts.length >= 5);
      for (const entry of protectedReceipts) {
        assert.equal(entry.body.agentId, "agent-1", entry.body.tool);
      }
    } finally {
      await srv.close();
    }
  });

  it("attributes malformed protected writes to the authenticated caller", async () => {
    const srv = await startAuthenticatedServer(async () => ({ agentId: "agent-1", companyId: "company-1" }));
    try {
      for (const route of [
        "/quality/citation",
        "/quality/authority",
        "/receipts/facade",
        "/receipts/deadline",
        "/matters/classification",
        "/egress/send_email",
      ]) {
        assert.equal((await postMalformed(srv.baseUrl, route)).status, 400, route);
      }
      const errorReceipts = srv.receipts.entries().filter((entry) => entry.body.outcome === "error");
      assert.equal(errorReceipts.length, 6);
      for (const entry of errorReceipts) {
        assert.equal(entry.body.agentId, "agent-1", entry.body.tool);
      }
    } finally {
      await srv.close();
    }
  });
});

describe("inbound auth environment", () => {
  it("is backward-compatible when GATE_REQUIRE_AUTH is unset or false", () => {
    assert.deepEqual(resolveInboundAuthEnvironment({}), { requireAuth: false });
    assert.deepEqual(resolveInboundAuthEnvironment({ GATE_REQUIRE_AUTH: "false" }), { requireAuth: false });
  });

  it("strictly rejects invalid or incomplete production configuration", () => {
    assert.throws(() => resolveInboundAuthEnvironment({ GATE_REQUIRE_AUTH: "TRUE" }), /GATE_REQUIRE_AUTH/);
    assert.throws(() => resolveInboundAuthEnvironment({ GATE_REQUIRE_AUTH: "true" }), /PAPERCLIP_BASE_URL/);
    assert.throws(
      () => resolveInboundAuthEnvironment({ GATE_REQUIRE_AUTH: "true", PAPERCLIP_BASE_URL: "http:\/\/127.0.0.1:3100" }),
      /PAPERCLIP_COMPANY_ID/,
    );
  });

  it("validates the caller key through /api/agents/me without surfacing it", async () => {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), authorization: headers.get("authorization") });
      // Match Paperclip's real /api/agents/me shape: urlKey is mutable display/
      // routing metadata and must not participate in authorization.
      return new Response(JSON.stringify({
        id: "agent-1",
        companyId: "company-1",
        urlKey: "deliverables-courier",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    const authenticate = createPaperclipInboundAuthenticator({
      baseUrl: "http://127.0.0.1:3100/",
      fetchImpl: fakeFetch as typeof fetch,
    });
    assert.deepEqual(await authenticate("agent-secret"), { agentId: "agent-1", companyId: "company-1" });
    assert.deepEqual(calls, [{
      url: "http://127.0.0.1:3100/api/agents/me",
      authorization: "Bearer agent-secret",
    }]);
  });
});
