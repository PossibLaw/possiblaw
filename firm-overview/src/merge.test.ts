import { test } from "node:test";
import assert from "node:assert/strict";
import type { Issue, Approval, WorkProduct } from "./paperclip.ts";
import {
  IN_FLIGHT_STATUSES,
  OPEN_APPROVAL_STATUSES,
  buildClientBoard,
  errorClientBoard,
  buildFirmBoard,
} from "./merge.ts";

const company = { id: "c1", name: "Acme Co", issuePrefix: "ACM" };
const publicUrl = "https://board.example.com";

function issue(overrides: Partial<Issue>): Issue {
  return {
    id: "i-default",
    title: "T",
    status: "todo",
    priority: null,
    assigneeAgentId: null,
    identifier: null,
    updatedAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function approval(overrides: Partial<Approval>): Approval {
  return {
    id: "ap-default",
    companyId: "c1",
    type: "deploy",
    status: "pending",
    requestedByAgentId: null,
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function workProduct(overrides: Partial<WorkProduct>): WorkProduct {
  return {
    id: "wp-default",
    issueId: "i-default",
    type: "doc",
    title: "Draft",
    status: null,
    url: null,
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof buildClientBoard>[0]> = {}) {
  return {
    company,
    publicUrl,
    dashboard: null,
    issues: [],
    agents: [],
    approvals: [],
    workProducts: [],
    workProductsTruncated: false,
    ...overrides,
  };
}

test("IN_FLIGHT_STATUSES and OPEN_APPROVAL_STATUSES have the expected members", () => {
  assert.deepEqual(IN_FLIGHT_STATUSES, ["backlog", "todo", "in_progress", "in_review", "blocked"]);
  assert.deepEqual(OPEN_APPROVAL_STATUSES, ["pending", "revision_requested"]);
});

test("in-flight filter keeps all IN_FLIGHT_STATUSES and drops done/cancelled", () => {
  const issues = [
    ...IN_FLIGHT_STATUSES.map((status, i) => issue({ id: `inflight-${i}`, status })),
    issue({ id: "done-1", status: "done" }),
    issue({ id: "cancelled-1", status: "cancelled" }),
  ];
  const board = buildClientBoard(baseInput({ issues }));
  const ids = board.issues.map((i) => i.id);
  assert.deepEqual(ids, IN_FLIGHT_STATUSES.map((_, i) => `inflight-${i}`));
});

test("agent-name join resolves known agent and nulls out unknown/absent agent", () => {
  const issues = [
    issue({ id: "i-known", status: "todo", assigneeAgentId: "a1" }),
    issue({ id: "i-unknown", status: "todo", assigneeAgentId: "a-does-not-exist" }),
    issue({ id: "i-none", status: "todo", assigneeAgentId: null }),
  ];
  const agents = [{ id: "a1", name: "Riley Agent" }];
  const board = buildClientBoard(baseInput({ issues, agents }));
  const byId = Object.fromEntries(board.issues.map((i) => [i.id, i.assigneeAgentName]));
  assert.equal(byId["i-known"], "Riley Agent");
  assert.equal(byId["i-unknown"], null);
  assert.equal(byId["i-none"], null);
});

test("issue deep link uses identifier when present and falls back to id", () => {
  const issues = [
    issue({ id: "i-1", status: "todo", identifier: "ACM-42" }),
    issue({ id: "i-2", status: "todo", identifier: null }),
  ];
  const board = buildClientBoard(baseInput({ issues }));
  const byId = Object.fromEntries(board.issues.map((i) => [i.id, i.deepLink]));
  assert.equal(byId["i-1"], "https://board.example.com/ACM/issues/ACM-42");
  assert.equal(byId["i-2"], "https://board.example.com/ACM/issues/i-2");
});

test("approval filter keeps pending + revision_requested, drops approved/rejected", () => {
  const approvals = [
    approval({ id: "ap-pending", status: "pending" }),
    approval({ id: "ap-revision", status: "revision_requested" }),
    approval({ id: "ap-approved", status: "approved" }),
    approval({ id: "ap-rejected", status: "rejected" }),
  ];
  const board = buildClientBoard(baseInput({ approvals }));
  const ids = board.approvals.map((a) => a.id);
  assert.deepEqual(ids.sort(), ["ap-pending", "ap-revision"].sort());
});

test("approval deep link points to the approvals page (no per-approval id)", () => {
  const approvals = [approval({ id: "ap-1", status: "pending" })];
  const board = buildClientBoard(baseInput({ approvals }));
  assert.equal(board.approvals[0].deepLink, "https://board.example.com/ACM/approvals");
});

test("deliverable deep link points to its parent issue", () => {
  const workProducts = [workProduct({ id: "wp-1", issueId: "i-77" })];
  const board = buildClientBoard(baseInput({ workProducts }));
  assert.equal(board.deliverables[0].deepLink, "https://board.example.com/ACM/issues/i-77");
});

test("deliverablesTruncated passes through verbatim (true and false)", () => {
  const truncated = buildClientBoard(baseInput({ workProductsTruncated: true }));
  const notTruncated = buildClientBoard(baseInput({ workProductsTruncated: false }));
  assert.equal(truncated.deliverablesTruncated, true);
  assert.equal(notTruncated.deliverablesTruncated, false);
});

test("buildClientBoard defaults error to null when omitted, passes through when given", () => {
  const withoutError = buildClientBoard(baseInput());
  const withError = buildClientBoard(baseInput({ error: "upstream failed" }));
  assert.equal(withoutError.error, null);
  assert.equal(withError.error, "upstream failed");
});

test("buildClientBoard carries company identity and dashboard through unchanged", () => {
  const dashboard = { widgets: ["a", "b"] };
  const board = buildClientBoard(baseInput({ dashboard }));
  assert.equal(board.companyId, "c1");
  assert.equal(board.name, "Acme Co");
  assert.equal(board.issuePrefix, "ACM");
  assert.deepEqual(board.dashboard, dashboard);
});

test("errorClientBoard yields empty arrays, the message, and deliverablesTruncated false", () => {
  const board = errorClientBoard(company, "upstream unreachable");
  assert.equal(board.companyId, "c1");
  assert.equal(board.name, "Acme Co");
  assert.equal(board.issuePrefix, "ACM");
  assert.equal(board.dashboard, null);
  assert.deepEqual(board.issues, []);
  assert.deepEqual(board.approvals, []);
  assert.deepEqual(board.deliverables, []);
  assert.equal(board.deliverablesTruncated, false);
  assert.equal(board.error, "upstream unreachable");
});

test("buildFirmBoard preserves client order and stamps generatedAt verbatim", () => {
  const clients = [
    errorClientBoard({ id: "c1", name: "Alpha", issuePrefix: "ALP" }, "err-a"),
    errorClientBoard({ id: "c2", name: "Beta", issuePrefix: "BET" }, "err-b"),
    errorClientBoard({ id: "c3", name: "Gamma", issuePrefix: "GAM" }, "err-c"),
  ];
  const firmBoard = buildFirmBoard(clients, "2026-07-02T12:34:56.000Z");
  assert.equal(firmBoard.generatedAt, "2026-07-02T12:34:56.000Z");
  assert.deepEqual(
    firmBoard.clients.map((c) => c.companyId),
    ["c1", "c2", "c3"],
  );
  assert.equal(firmBoard.clients, clients);
});
