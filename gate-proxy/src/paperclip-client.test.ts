import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PaperclipClient, PaperclipApiError } from "./paperclip-client.ts";

// ---------------------------------------------------------------------------
// Fake fetch helpers
// ---------------------------------------------------------------------------

type FetchCall = { url: string; init: RequestInit | undefined };

function makeFakeFetch(
  responses: Array<{ status: number; body: unknown }>,
): { fetchImpl: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  let idx = 0;
  const fetchImpl = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    const resp = responses[idx++] ?? { status: 200, body: {} };
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

function makeClient(
  overrides: Partial<Parameters<typeof PaperclipClient.prototype.createApproval>[0]> & {
    fetchImpl?: typeof fetch;
    apiKey?: string;
  } = {},
  fakeFetch?: typeof fetch,
): { client: PaperclipClient; calls: FetchCall[] } {
  // convenience wrapper used differently per test — build separately
  throw new Error("use buildClient directly");
}

function buildClient(
  cfg: {
    baseUrl?: string;
    companyId?: string;
    apiKey?: string;
    fetchImpl?: typeof fetch;
  } = {},
): PaperclipClient {
  return new PaperclipClient({
    baseUrl: cfg.baseUrl ?? "http://127.0.0.1:3100",
    companyId: cfg.companyId ?? "CO123",
    apiKey: cfg.apiKey,
    fetchImpl: cfg.fetchImpl,
  });
}

// ---------------------------------------------------------------------------
// Test 1: createApproval — correct URL, method, bearer header, hardcoded type
// ---------------------------------------------------------------------------

describe("PaperclipClient.createApproval", () => {
  it("posts to correct URL with bearer header and hardcoded type", async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { status: 200, body: { id: "appr-001" } },
    ]);
    const client = buildClient({ apiKey: "sk-test", fetchImpl });

    const result = await client.createApproval({
      requestedByAgentId: "agent-x",
      issueIds: ["issue-1"],
      payload: { foo: "bar" },
    });

    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.ok(
      call.url.endsWith("/api/companies/CO123/approvals"),
      `URL should end with /api/companies/CO123/approvals; got ${call.url}`,
    );
    assert.equal((call.init as RequestInit).method, "POST");

    const headers = (call.init as RequestInit).headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer sk-test");
    assert.equal(headers["content-type"], "application/json");

    const body = JSON.parse((call.init as RequestInit).body as string);
    assert.equal(body.type, "request_board_approval", "type must be hardcoded to request_board_approval");
    assert.equal(body.requestedByAgentId, "agent-x");
    assert.deepEqual(body.issueIds, ["issue-1"]);
    assert.deepEqual(body.payload, { foo: "bar" });

    assert.equal(result.id, "appr-001");
  });

  // -------------------------------------------------------------------------
  // Test 2: no apiKey → no Authorization header
  // -------------------------------------------------------------------------

  it("omits Authorization header when apiKey is not set", async () => {
    const { fetchImpl, calls } = makeFakeFetch([
      { status: 200, body: { id: "appr-002" } },
    ]);
    const client = buildClient({ fetchImpl }); // no apiKey

    await client.createApproval({ payload: { x: 1 } });

    const headers = (calls[0].init as RequestInit).headers as Record<string, string>;
    assert.ok(
      !("Authorization" in headers),
      "Authorization header must be absent when no apiKey",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3: getApproval, postIssueComment, linkIssueApproval
// ---------------------------------------------------------------------------

describe("PaperclipClient.getApproval", () => {
  it("calls GET /api/approvals/:id and returns parsed record", async () => {
    const record = {
      id: "appr-001",
      status: "pending",
      payload: { gate: "possiblaw-egress" },
    };
    const { fetchImpl, calls } = makeFakeFetch([{ status: 200, body: record }]);
    const client = buildClient({ fetchImpl });

    const result = await client.getApproval("appr-001");

    assert.equal(calls.length, 1);
    assert.ok(
      calls[0].url.endsWith("/api/approvals/appr-001"),
      `URL should end with /api/approvals/appr-001; got ${calls[0].url}`,
    );
    assert.deepEqual(result, record);
  });
});

describe("PaperclipClient.postIssueComment", () => {
  it("posts body string to /api/issues/:id/comments", async () => {
    const { fetchImpl, calls } = makeFakeFetch([{ status: 201, body: { id: "cmt-1" } }]);
    const client = buildClient({ fetchImpl });

    await client.postIssueComment("issue-99", "approval required");

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/issues/issue-99/comments"));
    assert.equal((calls[0].init as RequestInit).method, "POST");
    const body = JSON.parse((calls[0].init as RequestInit).body as string);
    assert.equal(body.body, "approval required");
  });
});

describe("PaperclipClient.linkIssueApproval", () => {
  it("posts {approvalId} to /api/issues/:id/approvals", async () => {
    const { fetchImpl, calls } = makeFakeFetch([{ status: 201, body: {} }]);
    const client = buildClient({ fetchImpl });

    await client.linkIssueApproval("issue-77", "appr-333");

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith("/api/issues/issue-77/approvals"));
    assert.equal((calls[0].init as RequestInit).method, "POST");
    const body = JSON.parse((calls[0].init as RequestInit).body as string);
    assert.equal(body.approvalId, "appr-333");
  });
});

// ---------------------------------------------------------------------------
// Test 4: non-2xx → PaperclipApiError with status + path only, no body
// ---------------------------------------------------------------------------

describe("PaperclipApiError", () => {
  it("throws PaperclipApiError with status 403 and url path; message excludes request body content", async () => {
    const sentinel = "super-privileged-payload-content-xyz";
    const { fetchImpl } = makeFakeFetch([{ status: 403, body: { error: "forbidden" } }]);
    const client = buildClient({ fetchImpl });

    await assert.rejects(
      async () =>
        client.createApproval({
          payload: { secret: sentinel },
        }),
      (err: unknown) => {
        assert.ok(err instanceof PaperclipApiError, "should be PaperclipApiError");
        const e = err as PaperclipApiError;
        assert.equal(e.status, 403);
        assert.ok(
          e.message.includes("403"),
          `message should include "403"; got: ${e.message}`,
        );
        assert.ok(
          e.message.includes("/api/companies/CO123/approvals"),
          `message should include URL path; got: ${e.message}`,
        );
        assert.ok(
          !e.message.includes(sentinel),
          `message must NOT contain request body sentinel; got: ${e.message}`,
        );
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5: Integrity invariant — source contains no approve/reject/request-revision
//         paths; class exposes exactly 4 method names
// ---------------------------------------------------------------------------

describe("PaperclipClient integrity invariant", () => {
  it("source contains no approve/reject/request-revision path fragments", () => {
    const srcPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "paperclip-client.ts",
    );
    const source = fs.readFileSync(srcPath, "utf8");

    // These are the board-only action endpoint path patterns.
    // /approve, /reject, /request-revision appear as terminal path segments in the action URLs
    // (e.g. /api/approvals/{id}/approve). We match them as path segment boundaries to avoid
    // false-positives on the resource URL /approvals (which contains "approve" as a prefix).
    const forbidden: RegExp[] = [
      /\/approve(?:[/"'`]|$)/,
      /\/reject(?:[/"'`]|$)/,
      /\/request-revision(?:[/"'`]|$)/,
    ];
    for (const pattern of forbidden) {
      assert.ok(
        !pattern.test(source),
        `paperclip-client.ts must NOT match "${pattern}" — integrity invariant violated`,
      );
    }
  });

  it("class prototype exposes exactly 4 method names", () => {
    const proto = PaperclipClient.prototype;
    const methods = Object.getOwnPropertyNames(proto).filter(
      (n) => n !== "constructor" && typeof (proto as unknown as Record<string, unknown>)[n] === "function",
    );
    const expected = new Set(["createApproval", "getApproval", "postIssueComment", "linkIssueApproval"]);
    assert.equal(
      methods.length,
      4,
      `Expected exactly 4 methods; got: ${methods.join(", ")}`,
    );
    for (const m of methods) {
      assert.ok(expected.has(m), `Unexpected method "${m}" on PaperclipClient`);
    }
  });
});
