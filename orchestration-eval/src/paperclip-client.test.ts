import { test } from "node:test";
import assert from "node:assert/strict";
import { PaperclipEvalClient } from "./paperclip-client.ts";

function fakeFetch(calls: Array<{ url: string; init?: RequestInit }>, body: unknown) {
  return async (url: any, init?: any) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("createIssue posts to the company issues endpoint with Bearer auth", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, { id: "iss-9", status: "todo" }) as any,
  });
  const issue = await client.createIssue({ title: "T", assigneeAgentId: "ag-7" });
  assert.equal(issue.id, "iss-9");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/companies/co-1/issues");
  assert.equal((calls[0].init?.headers as any).Authorization, "Bearer k");
});

test("putDocument PUTs to the issue document key (url-encoded)", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.putDocument("iss-9", "brief", "hello");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/issues/iss-9/documents/brief");
  assert.equal((calls[0].init?.method), "PUT");
});

test("patchCompanyBudget PATCHes the budgets endpoint", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.patchCompanyBudget(5000);
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/companies/co-1/budgets");
  assert.equal(calls[0].init?.method, "PATCH");
});

test("I3: listChildIssues GETs company issues with parentId query param (url-encoded)", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, [{ id: "child-1" }, { id: "child-2" }]) as any,
  });
  const children = await client.listChildIssues("iss-parent");
  assert.equal(children.length, 2);
  assert.equal(children[0].id, "child-1");
  assert.ok(calls[0].url.includes("/api/companies/co-1/issues"), "should call company issues endpoint");
  assert.ok(calls[0].url.includes("parentId=iss-parent"), "should include parentId query param");
  assert.equal(calls[0].init?.method, "GET");
});
