// ---------------------------------------------------------------------------
// server.test.ts — Firm Overview dashboard server.
//
// Uses withStub-style real HTTP stubs for paperclip (never a fake client
// object) so the tests exercise the real PaperclipClient + real fetch, per
// the pattern already established in paperclip.test.ts / auth.test.ts.
// ---------------------------------------------------------------------------

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PaperclipClient } from "./paperclip.ts";
import { createOverviewServer, type PaperclipClientFactory } from "./server.ts";

// ---------------------------------------------------------------------------
// Stub helpers
// ---------------------------------------------------------------------------

interface Route {
  method: string;
  match: RegExp;
  handler: (req: http.IncomingMessage, res: http.ServerResponse, m: RegExpMatchArray) => void;
}

function jsonHandler(status: number, body: unknown) {
  return (_req: http.IncomingMessage, res: http.ServerResponse): void => {
    res.statusCode = status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(body));
  };
}

interface StubRequest {
  method: string;
  url: string;
  auth?: string;
}

async function startStub(
  routes: Route[],
): Promise<{ baseUrl: string; close: () => Promise<void>; requests: StubRequest[] }> {
  const requests: StubRequest[] = [];
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method ?? "", url: req.url ?? "", auth: req.headers.authorization });
    const path = (req.url ?? "").split("?")[0] ?? "";
    for (const route of routes) {
      if (route.method !== (req.method ?? "")) continue;
      const m = path.match(route.match);
      if (m) {
        route.handler(req, res, m);
        return;
      }
    }
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "not_found_in_stub", path }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { baseUrl: `http://127.0.0.1:${port}`, close, requests };
}

async function startOverview(
  clientFactory: PaperclipClientFactory,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createOverviewServer({
    client: clientFactory,
    publicUrl: "http://127.0.0.1:9000",
    now: () => "2026-07-02T00:00:00.000Z",
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  const close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { baseUrl: `http://127.0.0.1:${port}`, close };
}

const H = { "X-Firm-Overview": "1" };

// ---------------------------------------------------------------------------
// (a) /api/board merges two companies and marks the failing one with error
// ---------------------------------------------------------------------------

test("(a) /api/board merges two companies and marks the failing one with error", async () => {
  const stub = await startStub([
    {
      method: "GET",
      match: /^\/api\/companies$/,
      handler: jsonHandler(200, [
        { id: "c1", name: "Acme", issuePrefix: "ACM" },
        { id: "c2", name: "Broken Co", issuePrefix: "BRK" },
      ]),
    },
    { method: "GET", match: /^\/api\/companies\/c1\/dashboard$/, handler: jsonHandler(200, { openIssues: 3 }) },
    {
      method: "GET",
      match: /^\/api\/companies\/c1\/issues$/,
      handler: jsonHandler(200, [
        {
          id: "i1",
          title: "Draft NDA",
          status: "in_progress",
          priority: 1,
          assigneeAgentId: "a1",
          identifier: "ACM-1",
          updatedAt: "2026-07-01T00:00:00Z",
        },
      ]),
    },
    { method: "GET", match: /^\/api\/companies\/c1\/agents$/, handler: jsonHandler(200, [{ id: "a1", name: "Alice" }]) },
    { method: "GET", match: /^\/api\/companies\/c1\/approvals$/, handler: jsonHandler(200, []) },
    { method: "GET", match: /^\/api\/issues\/i1\/work-products$/, handler: jsonHandler(200, []) },
    // company c2: every one of the four per-company fetches fails
    { method: "GET", match: /^\/api\/companies\/c2\/dashboard$/, handler: jsonHandler(500, { error: "boom" }) },
    { method: "GET", match: /^\/api\/companies\/c2\/issues$/, handler: jsonHandler(500, { error: "boom" }) },
    { method: "GET", match: /^\/api\/companies\/c2\/agents$/, handler: jsonHandler(500, { error: "boom" }) },
    { method: "GET", match: /^\/api\/companies\/c2\/approvals$/, handler: jsonHandler(500, { error: "boom" }) },
  ]);
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: stub.baseUrl, token }));

  const res = await fetch(`${overview.baseUrl}/api/board`, { headers: H });
  const data = (await res.json()) as {
    board: { clients: Array<{ companyId: string; error: string | null; issues: unknown[] }> };
  };

  assert.equal(res.status, 200);
  assert.equal(data.board.clients.length, 2);
  const acme = data.board.clients.find((c) => c.companyId === "c1")!;
  const broken = data.board.clients.find((c) => c.companyId === "c2")!;
  assert.equal(acme.error, null);
  assert.equal(acme.issues.length, 1);
  assert.ok(broken.error);

  await overview.close();
  await stub.close();
});

// ---------------------------------------------------------------------------
// (b) POST without X-Firm-Overview -> 403
// ---------------------------------------------------------------------------

test("(b) POST without X-Firm-Overview header -> 403", async () => {
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: "http://127.0.0.1:1", token }));

  const res = await fetch(`${overview.baseUrl}/api/disconnect`, { method: "POST" });
  assert.equal(res.status, 403);

  await overview.close();
});

// ---------------------------------------------------------------------------
// (c) POST with cross-origin Origin -> 403
// ---------------------------------------------------------------------------

test("(c) POST with Origin: http://evil.example -> 403", async () => {
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: "http://127.0.0.1:1", token }));

  const res = await fetch(`${overview.baseUrl}/api/disconnect`, {
    method: "POST",
    headers: { ...H, Origin: "http://evil.example" },
  });
  assert.equal(res.status, 403);

  await overview.close();
});

// ---------------------------------------------------------------------------
// (d) decide with action:"nuke" -> 400
// ---------------------------------------------------------------------------

test("(d) decide with action:'nuke' -> 400", async () => {
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: "http://127.0.0.1:1", token }));

  const res = await fetch(`${overview.baseUrl}/api/approvals/ap1/decide`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ action: "nuke" }),
  });
  assert.equal(res.status, 400);

  await overview.close();
});

// ---------------------------------------------------------------------------
// (e) decide happy path proxies + mirrors paperclip's 200
// ---------------------------------------------------------------------------

test("(e) decide happy path proxies to POST /api/approvals/ap1/approve and mirrors 200", async () => {
  const stub = await startStub([
    {
      method: "POST",
      match: /^\/api\/approvals\/ap1\/approve$/,
      handler: jsonHandler(200, { id: "ap1", status: "approved" }),
    },
  ]);
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: stub.baseUrl, token }));

  const res = await fetch(`${overview.baseUrl}/api/approvals/ap1/decide`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", decisionNote: "lgtm" }),
  });
  const body = (await res.json()) as { status: string };

  assert.equal(res.status, 200);
  assert.equal(body.status, "approved");
  assert.equal(
    stub.requests.some((r) => r.method === "POST" && r.url === "/api/approvals/ap1/approve"),
    true,
  );

  await overview.close();
  await stub.close();
});

// ---------------------------------------------------------------------------
// (f) decide as agent-credential mirror: paperclip returns 403 -> mirrored verbatim
// ---------------------------------------------------------------------------

test("(f) decide mirrors a 403 from paperclip verbatim (body passed through)", async () => {
  const stub = await startStub([
    {
      method: "POST",
      match: /^\/api\/approvals\/ap1\/reject$/,
      handler: jsonHandler(403, { error: "Board access required" }),
    },
  ]);
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: stub.baseUrl, token }));

  const res = await fetch(`${overview.baseUrl}/api/approvals/ap1/decide`, {
    method: "POST",
    headers: { ...H, "content-type": "application/json" },
    body: JSON.stringify({ action: "reject" }),
  });
  const body = (await res.json()) as { error: string };

  assert.equal(res.status, 403);
  assert.equal(body.error, "Board access required");

  await overview.close();
  await stub.close();
});

// ---------------------------------------------------------------------------
// (g) board with a held token that now 401s -> {connected:false, reauth:true}
// ---------------------------------------------------------------------------

test("(g) board with a held token that now 401s -> {connected:false, reauth:true}", async () => {
  const stub = await startStub([
    {
      method: "POST",
      match: /^\/api\/cli-auth\/challenges$/,
      handler: jsonHandler(200, {
        id: "ch1",
        token: "sec1",
        boardApiToken: "pcp_board_live",
        approvalUrl: "http://x/approve/ch1",
      }),
    },
    {
      method: "GET",
      match: /^\/api\/cli-auth\/challenges\/ch1$/,
      handler: jsonHandler(200, { status: "approved" }),
    },
    { method: "GET", match: /^\/api\/companies$/, handler: jsonHandler(401, { error: "unauthorized" }) },
  ]);
  const overview = await startOverview((token) => new PaperclipClient({ baseUrl: stub.baseUrl, token }));

  // Drive the real connect handshake through the overview server's own HTTP
  // endpoints so the server's CredentialStore ends up holding a live token —
  // exactly what a real "reauth" scenario needs to demonstrate.
  const connectRes = await fetch(`${overview.baseUrl}/api/connect`, { method: "POST", headers: H });
  assert.equal(connectRes.status, 200);

  const statusRes = await fetch(`${overview.baseUrl}/api/connect/status`, { headers: H });
  const status = (await statusRes.json()) as { status: string };
  assert.equal(status.status, "connected");

  // Now the board fetch 401s against the held token.
  const boardRes = await fetch(`${overview.baseUrl}/api/board`, { headers: H });
  const boardBody = await boardRes.json();
  assert.deepEqual(boardBody, { connected: false, reauth: true });

  await overview.close();
  await stub.close();
});
