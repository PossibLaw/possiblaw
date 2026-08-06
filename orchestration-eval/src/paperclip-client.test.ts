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

test("putDocument satisfies the 2026-07 pin's documents contract: key slug + required format", async () => {
  // The 24aa2f51 pin validates keys as [a-z0-9_-] (no dots, no uppercase)
  // and requires format:"markdown" in the body — the pre-bump client 400'd
  // on both (observed live 2026-08-02, every A/B smoke run).
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.putDocument("iss-9", "Draft Petition-Letter.docx", "hello");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/issues/iss-9/documents/draft-petition-letter-docx");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.format, "markdown");
  assert.equal(body.body, "hello");
});

test("empty apiKey sends NO Authorization header (local_trusted board actor)", async () => {
  // The eval must not share an identity with a working agent: the pinned
  // paperclip session-scopes an agent key while that agent has a live run,
  // so a chief-keyed client racing the chief's own Arm B session gets
  // 403/409/401 on unrelated issues (observed across smokes 2-4,
  // 2026-08-02/03). On local_trusted, credential-less loopback is the board
  // actor with no boundary — the correct harness identity.
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.getIssue("iss-1");
  const headers = (calls[0].init?.headers ?? {}) as Record<string, string>;
  assert.equal("Authorization" in headers, false);
});

test("patchIssueAssignee sets assignee AND moves status to todo (backlog skips the wake)", async () => {
  // paperclip/server/src/routes/issues.ts:412 — assignment wake is skipped
  // while status === "backlog", and unassigned-created issues default to
  // backlog. Observed live 2026-08-03: 12/12 runs timed out with agents
  // never woken. The PATCH must carry both fields.
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.patchIssueAssignee("iss-9", "agent-1");
  const body = JSON.parse(String(calls[0].init?.body));
  assert.equal(body.assigneeAgentId, "agent-1");
  assert.equal(body.status, "todo");
});

test("cancelIssue PATCHes status cancelled", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "",
    fetchImpl: fakeFetch(calls, {}) as any,
  });
  await client.cancelIssue("iss-9");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/issues/iss-9");
  assert.equal(calls[0].init?.method, "PATCH");
  assert.equal(JSON.parse(String(calls[0].init?.body)).status, "cancelled");
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

test("1.1: listAgents GETs the company agents endpoint and surfaces urlKey rows", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, [{ id: "ag-1", name: "Immigration Lead", urlKey: "immigration-lead" }]) as any,
  });
  const agents = await client.listAgents();
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/companies/co-1/agents");
  assert.equal(agents[0].urlKey, "immigration-lead");
});

test("1.2: getIssueCostSummary surfaces the costCents field the route actually returns", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PaperclipEvalClient({
    baseUrl: "http://127.0.0.1:3199", companyId: "co-1", apiKey: "k",
    fetchImpl: fakeFetch(calls, { issueId: "iss-9", includeDescendants: true, costCents: 456 }) as any,
  });
  const summary = await client.getIssueCostSummary("iss-9");
  assert.equal(calls[0].url, "http://127.0.0.1:3199/api/issues/iss-9/cost-summary");
  assert.equal(summary.costCents, 456);
});
