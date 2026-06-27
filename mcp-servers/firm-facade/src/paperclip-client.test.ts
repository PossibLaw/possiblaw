// mcp-servers/firm-facade/src/paperclip-client.test.ts
//
// Tests for FirmFacadeClient — zero network (injected fetch).
// Security invariant (load-bearing): the client must expose NO approve/reject/decide
// method. Adding such a method must cause the invariant test to fail.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FirmFacadeClient } from "./paperclip-client.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCapturingFetch(status = 200, responseBody: unknown = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(responseBody), {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fakeFetch: fakeFetch as typeof fetch, calls };
}

const BASE_CONFIG = {
  baseUrl: "http://paperclip:3100",
  companyId: "company-abc",
  apiKey: "test-secret-key-99999",
};

function makeClient(fetchImpl: typeof fetch): FirmFacadeClient {
  return new FirmFacadeClient({ ...BASE_CONFIG, fetchImpl });
}

function captureBearer(init: RequestInit): string {
  const headers = init.headers as Record<string, string>;
  return headers["Authorization"] ?? headers["authorization"] ?? "";
}

// ---------------------------------------------------------------------------
// Method routing tests
// ---------------------------------------------------------------------------

describe("FirmFacadeClient", () => {
  describe("createIssue", () => {
    it("POSTs to /api/companies/{companyId}/issues with Bearer auth and JSON body", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(201, { id: "issue-1", status: "open" });
      await makeClient(fakeFetch).createIssue({ title: "Test matter" });

      assert.equal(calls.length, 1, "should POST exactly once");
      assert.equal(calls[0].url, "http://paperclip:3100/api/companies/company-abc/issues");
      assert.equal(calls[0].init.method, "POST");
      assert.ok(
        captureBearer(calls[0].init).startsWith("Bearer test-secret-key-99999"),
        "must send Bearer apiKey",
      );

      const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
      assert.equal(body["title"], "Test matter", "title must be in request body");
    });

    it("passes optional fields (description, projectId) through in the body", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(201, { id: "issue-2", status: "open" });
      await makeClient(fakeFetch).createIssue({
        title: "Another matter",
        description: "Full description",
        projectId: "proj-7",
      });

      const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
      assert.equal(body["title"], "Another matter");
      assert.equal(body["description"], "Full description");
      assert.equal(body["projectId"], "proj-7");
    });
  });

  describe("getIssue", () => {
    it("GETs /api/issues/{issueId} with Bearer auth", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(200, { id: "issue-1", status: "open", workProducts: [] });
      await makeClient(fakeFetch).getIssue("issue-1");

      assert.equal(calls[0].url, "http://paperclip:3100/api/issues/issue-1");
      assert.equal(calls[0].init.method, "GET");
      assert.ok(captureBearer(calls[0].init).startsWith("Bearer "), "must send Bearer auth");
      // GET must NOT include a body
      assert.equal(calls[0].init.body, undefined, "GET must not send a body");
    });
  });

  describe("listWorkProducts", () => {
    it("GETs /api/issues/{issueId}/work-products with Bearer auth", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(200, []);
      await makeClient(fakeFetch).listWorkProducts("issue-1");

      assert.equal(calls[0].url, "http://paperclip:3100/api/issues/issue-1/work-products");
      assert.equal(calls[0].init.method, "GET");
      assert.ok(captureBearer(calls[0].init).startsWith("Bearer "));
    });
  });

  describe("getDocument", () => {
    it("GETs /api/issues/{issueId}/documents/{key} with Bearer auth", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(200, { id: "doc-1", body: "full text" });
      await makeClient(fakeFetch).getDocument("issue-1", "doc-key-abc");

      assert.equal(calls[0].url, "http://paperclip:3100/api/issues/issue-1/documents/doc-key-abc");
      assert.equal(calls[0].init.method, "GET");
      assert.ok(captureBearer(calls[0].init).startsWith("Bearer "));
    });

    it("URL-encodes special chars in issueId and key", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(200, {});
      await makeClient(fakeFetch).getDocument("iss/ue 1", "key with spaces");
      // encodeURIComponent encodes spaces as %20, / as %2F
      assert.ok(calls[0].url.includes("iss%2Fue%201"), `unexpected URL: ${calls[0].url}`);
      assert.ok(calls[0].url.includes("key%20with%20spaces"), `unexpected URL: ${calls[0].url}`);
    });
  });

  describe("createApproval", () => {
    it("POSTs to /api/companies/{companyId}/approvals with type + payload in body", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(201, { id: "approval-1", status: "pending" });
      await makeClient(fakeFetch).createApproval({
        type: "request_board_approval",
        payload: { matterId: "m-1", summary: "file motion" },
      });

      assert.equal(calls[0].url, "http://paperclip:3100/api/companies/company-abc/approvals");
      assert.equal(calls[0].init.method, "POST");
      assert.ok(captureBearer(calls[0].init).startsWith("Bearer "));

      const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
      assert.equal(body["type"], "request_board_approval");
      assert.deepEqual(body["payload"], { matterId: "m-1", summary: "file motion" });
    });

    it("passes optional requestedByAgentId and issueIds when provided", async () => {
      const { fakeFetch, calls } = makeCapturingFetch(201, { id: "approval-2", status: "pending" });
      await makeClient(fakeFetch).createApproval({
        type: "request_board_approval",
        payload: { action: "send_letter" },
        requestedByAgentId: "agent-7",
        issueIds: ["issue-1", "issue-2"],
      });

      const body = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
      assert.equal(body["requestedByAgentId"], "agent-7");
      assert.deepEqual(body["issueIds"], ["issue-1", "issue-2"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling — non-2xx throws and does NOT leak the apiKey
  // ---------------------------------------------------------------------------

  describe("error handling", () => {
    it("throws on 404 and the error message does NOT contain the apiKey", async () => {
      const { fakeFetch } = makeCapturingFetch(404, { error: "not found" });
      await assert.rejects(
        () => makeClient(fakeFetch).getIssue("missing"),
        (err: unknown) => {
          assert.ok(err instanceof Error, `expected Error, got ${String(err)}`);
          assert.ok(
            !err.message.includes("test-secret-key-99999"),
            `error message must NOT contain the API key — got: "${err.message}"`,
          );
          return true;
        },
      );
    });

    it("throws on 500 from createIssue and does not leak apiKey", async () => {
      const { fakeFetch } = makeCapturingFetch(500, { error: "internal error" });
      await assert.rejects(
        () => makeClient(fakeFetch).createIssue({ title: "fail" }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!err.message.includes(BASE_CONFIG.apiKey));
          return true;
        },
      );
    });

    it("throws on 403 from createApproval and does not leak apiKey", async () => {
      const { fakeFetch } = makeCapturingFetch(403, { error: "forbidden" });
      await assert.rejects(
        () =>
          makeClient(fakeFetch).createApproval({
            type: "request_board_approval",
            payload: {},
          }),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.ok(!err.message.includes(BASE_CONFIG.apiKey));
          return true;
        },
      );
    });
  });

  // ---------------------------------------------------------------------------
  // SECURITY INVARIANT (load-bearing):
  // The client must have NO method that can approve/reject/decide an approval.
  // Only CREATING an approval request is allowed. This test enumerates all
  // prototype + own property names and asserts none match the forbidden pattern.
  // Adding an `approve`, `reject`, `decideApproval`, or `requestRevision` method
  // MUST cause this test to fail.
  // ---------------------------------------------------------------------------

  describe("INVARIANT: no approve/reject/decide method", () => {
    it("FirmFacadeClient prototype and instance expose no approve/reject/decide method", () => {
      const noop = (() => Promise.resolve(new Response())) as unknown as typeof fetch;
      const instance = new FirmFacadeClient({ ...BASE_CONFIG, fetchImpl: noop });

      // "starts with approve/reject/decide" covers approve(), approveGate(), rejectIssue(), etc.
      // "request-revision / request_revision" covers requestRevision() etc.
      // createApproval() is intentionally allowed — it CREATES a request, it does not approve.
      const FORBIDDEN = /^(approv|reject|decide)|request.?revision/i;

      const protoMethods = Object.getOwnPropertyNames(FirmFacadeClient.prototype);
      const instanceProps = Object.getOwnPropertyNames(instance);
      const allNames = [...protoMethods, ...instanceProps];

      for (const name of allNames) {
        assert.ok(
          !FORBIDDEN.test(name),
          `SECURITY VIOLATION: FirmFacadeClient exposes forbidden method/property "${name}" ` +
            `(matches /^(approv|reject|decide)|request.?revision/i)`,
        );
      }
    });

    // ALLOWLIST-EQUALITY (the real guard): the verb regex above would miss a
    // backdoor with an innocuous name (resolveApproval, assertBoard, castVote,
    // setApprovalDecision). Asserting the EXACT method set catches ANY added
    // method regardless of name. To add a method here you must also extend this
    // allowlist — forcing a deliberate, reviewable change.
    it("FirmFacadeClient prototype exposes EXACTLY the 5 allowed methods (no extras, any name)", () => {
      const EXPECTED = ["createIssue", "getIssue", "listWorkProducts", "getDocument", "createApproval"];
      const actual = Object.getOwnPropertyNames(FirmFacadeClient.prototype)
        .filter((n) => n !== "constructor")
        .sort();
      assert.deepEqual(
        actual,
        [...EXPECTED].sort(),
        `SECURITY VIOLATION: FirmFacadeClient method set changed. Any added method — even an ` +
          `innocuously-named one (resolveApproval, assertBoard, castVote) — must be reviewed and ` +
          `explicitly added to this allowlist. Expected exactly: ${[...EXPECTED].sort().join(", ")}`,
      );
    });
  });
});
