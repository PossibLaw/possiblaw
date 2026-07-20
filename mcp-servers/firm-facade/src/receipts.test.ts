import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FacadeReceiptWriter } from "./receipts.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_SHA = "a".repeat(64);

function makeCapturingFetch(status = 200, responseBody: unknown = { recorded: true, seq: 1, hash: "b".repeat(64) }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    calls.push({ url: String(url), init: init ?? {} });
    const body = JSON.stringify(responseBody);
    return new Response(body, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fakeFetch: fakeFetch as typeof fetch, calls };
}

function makeRejectingFetch(reason: string) {
  const fakeFetch = async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw new Error(reason);
  };
  return fakeFetch as typeof fetch;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FacadeReceiptWriter", () => {
  // 1. record() POSTs the correct JSON shape to ${url}/receipts/facade
  it("record() POSTs correct JSON to ${gateProxyUrl}/receipts/facade", async () => {
    const { fakeFetch, calls } = makeCapturingFetch();
    const writer = new FacadeReceiptWriter({
      gateProxyUrl: "http://gate:9000",
      apiKey: "agent-secret",
      fetchImpl: fakeFetch,
    });

    await writer.record({
      tool: "create_matter",
      outcome: "performed",
      payloadSha256: VALID_SHA,
      matterId: "matter-42",
      agentId: "agent-1",
    });

    assert.equal(calls.length, 1, "must POST exactly once");
    assert.equal(calls[0].url, "http://gate:9000/receipts/facade");

    const init = calls[0].init;
    assert.equal(init.method, "POST");
    assert.ok(
      String((init.headers as Record<string, string>)["content-type"] ?? "").startsWith("application/json"),
      "content-type must be application/json",
    );
    assert.equal((init.headers as Record<string, string>)["authorization"], "Bearer agent-secret");

    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    assert.equal(sentBody["tool"], "create_matter");
    assert.equal(sentBody["outcome"], "performed");
    assert.equal(sentBody["payloadSha256"], VALID_SHA);
    assert.equal(sentBody["matterId"], "matter-42");
    assert.equal(sentBody["agentId"], "agent-1");
  });

  // 2. record() throws on non-2xx response (fail-closed)
  it("record() throws when gate returns non-2xx (fail-closed)", async () => {
    const { fakeFetch } = makeCapturingFetch(400, { error: "invalid_tool" });
    const writer = new FacadeReceiptWriter({
      gateProxyUrl: "http://gate:9000",
      fetchImpl: fakeFetch,
    });

    await assert.rejects(
      () => writer.record({ tool: "create_matter", outcome: "performed", payloadSha256: VALID_SHA }),
      (err: unknown) => {
        assert.ok(err instanceof Error, `expected Error, got ${String(err)}`);
        return true;
      },
    );
  });

  // 3. record() throws when fetch itself rejects (fail-closed)
  it("record() throws when fetch rejects/network error (fail-closed)", async () => {
    const fakeFetch = makeRejectingFetch("ECONNREFUSED");
    const writer = new FacadeReceiptWriter({
      gateProxyUrl: "http://gate:9000",
      fetchImpl: fakeFetch,
    });

    await assert.rejects(
      () => writer.record({ tool: "get_matter_status", outcome: "performed", payloadSha256: VALID_SHA }),
      (err: unknown) => {
        assert.ok(err instanceof Error, `expected Error, got ${String(err)}`);
        assert.match(err.message, /ECONNREFUSED/);
        return true;
      },
    );
  });

  // 4. record() includes optional fields when provided
  it("record() includes optional fields (workProductId, approvalId, meta) when provided", async () => {
    const { fakeFetch, calls } = makeCapturingFetch();
    const writer = new FacadeReceiptWriter({
      gateProxyUrl: "http://gate:9000",
      fetchImpl: fakeFetch,
    });

    await writer.record({
      tool: "fetch_work_product",
      outcome: "performed",
      payloadSha256: VALID_SHA,
      workProductId: "wp-7",
      approvalId: "approval-3",
      meta: { note: "test" },
    });

    const sentBody = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
    assert.equal(sentBody["workProductId"], "wp-7");
    assert.equal(sentBody["approvalId"], "approval-3");
    assert.deepEqual(sentBody["meta"], { note: "test" });
  });

  // 5. record() omits undefined optional fields (no pollution in the POST body)
  it("record() omits undefined optional fields from POST body", async () => {
    const { fakeFetch, calls } = makeCapturingFetch();
    const writer = new FacadeReceiptWriter({
      gateProxyUrl: "http://gate:9000",
      fetchImpl: fakeFetch,
    });

    await writer.record({
      tool: "list_work_products",
      outcome: "performed",
      payloadSha256: VALID_SHA,
    });

    const sentBody = JSON.parse(calls[0].init.body as string) as Record<string, unknown>;
    assert.equal("matterId" in sentBody, false, "matterId must not be present when undefined");
    assert.equal("workProductId" in sentBody, false);
    assert.equal("approvalId" in sentBody, false);
    assert.equal("meta" in sentBody, false);
  });
});
