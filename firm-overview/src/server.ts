// ---------------------------------------------------------------------------
// server.ts — Firm Overview loopback dashboard server.
//
// This server does ZERO authorization filtering of its own: every response
// is built from data fetched using the lawyer's own paperclip token, and
// paperclip's own access rules are the only filter that has ever been
// applied. approve/reject just mirrors paperclip's response verbatim — this
// server never invents or synthesizes a success.
//
// The paperclip client is token-dependent (the lawyer connects via the
// cli-auth handshake in auth.ts, and the resulting token lives only in
// memory for the life of this process), so callers pass a CLIENT FACTORY
// rather than a single client instance. A fresh, correctly-authed
// PaperclipClient is built per request via `clientFactory(credentials.token())`.
// The one exception is the CredentialStore itself: it is constructed ONCE,
// for the life of the server, with a token-LESS client — cli-auth challenge
// creation/polling is unauthenticated by design (see auth.ts).
//
// createOverviewServer binds NOTHING itself — the caller (index.ts) calls
// server.listen(port, "127.0.0.1") so the loopback-only bind lives in one
// place, at the edge, next to the env wiring.
// ---------------------------------------------------------------------------

import http from "node:http";
import { PaperclipClient, PaperclipHttpError } from "./paperclip.ts";
import type { Issue } from "./paperclip.ts";
import { CredentialStore } from "./auth.ts";
import { IN_FLIGHT_STATUSES, buildClientBoard, errorClientBoard, buildFirmBoard } from "./merge.ts";
import type { ClientBoard, FirmBoard } from "./merge.ts";
import { renderPage } from "./page.ts";

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/** Builds a fresh, correctly-authed PaperclipClient. Called with no args (no
 * token) exactly once, to build the client used only for cli-auth calls;
 * called with `credentials.token()` per request/board-build otherwise. */
export type PaperclipClientFactory = (token?: string) => PaperclipClient;

export interface OverviewServerOpts {
  client: PaperclipClientFactory;
  publicUrl: string;
  /** Injectable clock for FirmBoard.generatedAt. Defaults to the real clock;
   * tests inject a fixed value. */
  now?: () => string;
}

// ---------------------------------------------------------------------------
// Small HTTP helpers
// ---------------------------------------------------------------------------

const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload, "utf8"),
  });
  res.end(payload);
}

function sendHtml(res: http.ServerResponse, html: string): void {
  if (res.headersSent) return;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "content-length": Buffer.byteLength(html, "utf8"),
  });
  res.end(html);
}

function readBody(req: http.IncomingMessage): Promise<{ body: string; limitExceeded: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let limitExceeded = false;
    req.on("data", (chunk: Buffer) => {
      if (limitExceeded) return;
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        limitExceeded = true;
        chunks.length = 0;
        resolve({ body: "", limitExceeded: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!limitExceeded) resolve({ body: Buffer.concat(chunks).toString("utf8"), limitExceeded: false });
    });
    req.on("error", reject);
  });
}

/**
 * CSRF guard, applied to every POST (brief's HTTP contract): requires the
 * custom `X-Firm-Overview: 1` header AND, when an `Origin` header is present,
 * that it be loopback (http://127.0.0.1:* or http://localhost:*).
 *
 * This is defense in depth on top of a browser-enforced mechanism: a custom
 * header like X-Firm-Overview is not CORS-safelisted, so ANY cross-origin
 * fetch that sets it forces a CORS preflight (OPTIONS) first. This server
 * never answers OPTIONS and never sends Access-Control-* headers, so a
 * forged cross-origin request never even reaches this check in a real
 * browser. The explicit check below covers non-browser callers and same-
 * origin-but-still-wrong-Origin edge cases.
 */
function csrfOk(req: http.IncomingMessage): boolean {
  const marker = req.headers["x-firm-overview"];
  if (marker !== "1") return false;
  const origin = req.headers["origin"];
  if (origin === undefined) return true;
  return origin.startsWith("http://127.0.0.1:") || origin.startsWith("http://localhost:");
}

function isUnauthorized(reason: unknown): boolean {
  return reason instanceof PaperclipHttpError && reason.status === 401;
}

// ---------------------------------------------------------------------------
// Board building
// ---------------------------------------------------------------------------

interface CompanyBoardResult {
  clientBoard: ClientBoard;
  /** true when a 401 was observed among this company's sub-fetches — the
   * caller must disconnect and short-circuit the whole /api/board response,
   * not just mark this one company as errored. */
  unauthorized: boolean;
}

async function buildOneClientBoard(
  company: { id: string; name: string; issuePrefix: string },
  client: PaperclipClient,
  publicUrl: string,
): Promise<CompanyBoardResult> {
  const [dashboardR, issuesR, agentsR, approvalsR] = await Promise.allSettled([
    client.getDashboard(company.id),
    client.listIssues(company.id, [...IN_FLIGHT_STATUSES]),
    client.listAgents(company.id),
    client.listApprovals(company.id),
  ]);
  const settled = [dashboardR, issuesR, agentsR, approvalsR];

  if (settled.some((r) => r.status === "rejected" && isUnauthorized(r.reason))) {
    return { clientBoard: errorClientBoard(company, "unauthorized"), unauthorized: true };
  }

  // A rejected company entirely: every one of the four per-company fetches
  // failed (vs. "each rejected sub-fetch -> that field null/empty" for a
  // partial failure) — report the whole client as errored rather than a
  // board that looks like an empty-but-healthy client.
  if (settled.every((r) => r.status === "rejected")) {
    const reason = (dashboardR as PromiseRejectedResult).reason;
    const message = reason instanceof Error ? reason.message : "failed to load client";
    return { clientBoard: errorClientBoard(company, message), unauthorized: false };
  }

  const dashboard = dashboardR.status === "fulfilled" ? dashboardR.value : null;
  const issues: Issue[] = issuesR.status === "fulfilled" ? issuesR.value : [];
  const agents = agentsR.status === "fulfilled" ? agentsR.value : [];
  const approvals = approvalsR.status === "fulfilled" ? approvalsR.value : [];

  // listIssues() already requests sortField=updated&sortDir=desc, so the
  // first 10 are the 10 most-recently-updated in-flight issues.
  const topIssues = issues.slice(0, 10);
  const deliverablesTruncated = issues.length > 10;
  const wpResults = await Promise.allSettled(topIssues.map((issue) => client.listWorkProducts(issue.id)));

  if (wpResults.some((r) => r.status === "rejected" && isUnauthorized(r.reason))) {
    return { clientBoard: errorClientBoard(company, "unauthorized"), unauthorized: true };
  }

  const workProducts = wpResults.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  return {
    clientBoard: buildClientBoard({
      company,
      publicUrl,
      dashboard,
      issues,
      agents,
      approvals,
      workProducts,
      workProductsTruncated: deliverablesTruncated,
    }),
    unauthorized: false,
  };
}

interface BoardResponse {
  status: number;
  body: unknown;
}

async function handleBoard(
  clientFactory: PaperclipClientFactory,
  credentials: CredentialStore,
  publicUrl: string,
  now: () => string,
): Promise<BoardResponse> {
  const token = credentials.token();
  const client = clientFactory(token);

  let companies: Array<{ id: string; name: string; issuePrefix: string }>;
  try {
    companies = await client.listCompanies();
  } catch (err) {
    if (isUnauthorized(err) && token !== undefined) {
      credentials.disconnect();
      return { status: 200, body: { connected: false, reauth: true } };
    }
    return { status: 502, body: { error: "paperclip_unreachable" } };
  }

  const clientBoards: ClientBoard[] = [];
  for (const company of companies) {
    const result = await buildOneClientBoard(company, client, publicUrl);
    if (result.unauthorized && token !== undefined) {
      credentials.disconnect();
      return { status: 200, body: { connected: false, reauth: true } };
    }
    clientBoards.push(result.clientBoard);
  }

  const board: FirmBoard = buildFirmBoard(clientBoards, now());
  return { status: 200, body: { connect: credentials.state(), board } };
}

// ---------------------------------------------------------------------------
// Approval decide — proxy, never synthesize success
// ---------------------------------------------------------------------------

async function handleDecide(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  approvalId: string,
  clientFactory: PaperclipClientFactory,
  credentials: CredentialStore,
): Promise<void> {
  const { body: rawBody, limitExceeded } = await readBody(req);
  if (limitExceeded) {
    sendJson(res, 413, { error: "request_too_large" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }

  const b = (parsed !== null && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const action = b["action"];
  if (action !== "approve" && action !== "reject") {
    sendJson(res, 400, { error: "invalid_action: action must be 'approve' or 'reject'" });
    return;
  }
  const decisionNote = typeof b["decisionNote"] === "string" ? b["decisionNote"] : undefined;

  const client = clientFactory(credentials.token());
  // decideApproval never throws — it always resolves {status, body}, which we
  // mirror back verbatim. This server never synthesizes a success/failure.
  const result = await client.decideApproval(approvalId, action, decisionNote);
  sendJson(res, result.status, result.body);
}

// ---------------------------------------------------------------------------
// createOverviewServer
// ---------------------------------------------------------------------------

export function createOverviewServer(opts: OverviewServerOpts): http.Server {
  const clientFactory = opts.client;
  const publicUrl = opts.publicUrl;
  const now = opts.now ?? (() => new Date().toISOString());

  // Constructed ONCE, for the life of the server: a token-LESS client, used
  // only for the two unauthenticated cli-auth endpoints (see auth.ts).
  const credentials = new CredentialStore(clientFactory());

  const decideRoute = /^\/api\/approvals\/([^/]+)\/decide$/;

  const server = http.createServer((req, res) => {
    void (async () => {
      try {
        const method = req.method ?? "GET";
        const pathname = (req.url ?? "/").split("?")[0] ?? "/";

        if (method === "GET" && pathname === "/") {
          sendHtml(res, renderPage());
          return;
        }

        if (method === "GET" && pathname === "/api/board") {
          const { status, body } = await handleBoard(clientFactory, credentials, publicUrl, now);
          sendJson(res, status, body);
          return;
        }

        if (method === "POST" && pathname === "/api/connect") {
          if (!csrfOk(req)) {
            sendJson(res, 403, { error: "csrf_check_failed" });
            return;
          }
          const { approvalUrl } = await credentials.startConnect();
          sendJson(res, 200, { approvalUrl });
          return;
        }

        if (method === "GET" && pathname === "/api/connect/status") {
          const state = await credentials.pollConnect();
          sendJson(res, 200, state);
          return;
        }

        if (method === "POST" && pathname === "/api/disconnect") {
          if (!csrfOk(req)) {
            sendJson(res, 403, { error: "csrf_check_failed" });
            return;
          }
          credentials.disconnect();
          res.writeHead(204);
          res.end();
          return;
        }

        const decideMatch = pathname.match(decideRoute);
        if (method === "POST" && decideMatch) {
          if (!csrfOk(req)) {
            sendJson(res, 403, { error: "csrf_check_failed" });
            return;
          }
          const approvalId = decodeURIComponent(decideMatch[1] ?? "");
          await handleDecide(req, res, approvalId, clientFactory, credentials);
          return;
        }

        sendJson(res, 404, { error: "not_found" });
      } catch {
        if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      }
    })();
  });

  return server;
}
