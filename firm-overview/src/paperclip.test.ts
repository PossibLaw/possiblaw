import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PaperclipClient, PaperclipHttpError } from "./paperclip.ts";

async function withStub(
  handler: http.RequestListener,
  fn: (baseUrl: string, seen: Array<{ url: string; auth?: string }>) => Promise<void>,
) {
  const seen: Array<{ url: string; auth?: string }> = [];
  const server = http.createServer((req, res) => {
    seen.push({ url: req.url ?? "", auth: req.headers.authorization });
    handler(req, res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  try { await fn(`http://127.0.0.1:${port}`, seen); }
  finally { server.close(); }
}

test("listIssues builds the query and parses the bare array", async () => {
  await withStub((_req, res) => { res.setHeader("content-type", "application/json");
    res.end(JSON.stringify([{ id: "i1", title: "T", status: "in_progress", priority: 1,
      assigneeAgentId: "a1", identifier: "ACM-1", updatedAt: "2026-07-02T00:00:00Z" }])); },
    async (baseUrl, seen) => {
      const c = new PaperclipClient({ baseUrl, token: "pcp_board_x" });
      const issues = await c.listIssues("c1", ["in_progress", "blocked"]);
      assert.equal(issues[0].identifier, "ACM-1");
      assert.match(seen[0].url, /\/api\/companies\/c1\/issues\?/);
      assert.match(seen[0].url, /status=in_progress%2Cblocked|status=in_progress,blocked/);
      assert.match(seen[0].url, /sortField=updated/);
      assert.equal(seen[0].auth, "Bearer pcp_board_x");
    });
});

test("no Authorization header without a token", async () => {
  await withStub((_req, res) => { res.end("[]"); }, async (baseUrl, seen) => {
    await new PaperclipClient({ baseUrl }).listCompanies();
    assert.equal(seen[0].auth, undefined);
  });
});

test("non-2xx throws PaperclipHttpError with status", async () => {
  await withStub((_req, res) => { res.statusCode = 403; res.end("{}"); }, async (baseUrl) => {
    await assert.rejects(
      new PaperclipClient({ baseUrl, token: "t" }).listApprovals("c1"),
      (e: unknown) => e instanceof PaperclipHttpError && e.status === 403,
    );
  });
});

test("decideApproval returns status+body without throwing on 403", async () => {
  await withStub((req, res) => {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => { res.statusCode = 403;
      res.end(JSON.stringify({ error: "Board access required", got: JSON.parse(body) })); });
  }, async (baseUrl, seen) => {
    const r = await new PaperclipClient({ baseUrl, token: "t" })
      .decideApproval("ap1", "approve", "lgtm");
    assert.equal(r.status, 403);
    assert.match(seen[0].url, /\/api\/approvals\/ap1\/approve$/);
  });
});

test("createCliAuthChallenge posts and parses the approval fields", async () => {
  await withStub((_req, res) => { res.end(JSON.stringify({ id: "ch1", token: "sec",
    boardApiToken: "pcp_board_new", approvalUrl: "http://x/approve" })); },
    async (baseUrl) => {
      const r = await new PaperclipClient({ baseUrl }).createCliAuthChallenge();
      assert.equal(r.boardApiToken, "pcp_board_new");
    });
});
