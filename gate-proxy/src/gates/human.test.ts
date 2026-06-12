import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { humanGate } from "./human.ts";
import type { HumanGateResult } from "./human.ts";
import type { EgressRequest } from "../types.ts";
import type { ApprovalRecord, PaperclipClient } from "../paperclip-client.ts";

// ---------------------------------------------------------------------------
// Fake PaperclipClient
// ---------------------------------------------------------------------------

interface ClientCalls {
  createApproval: Array<Parameters<PaperclipClient["createApproval"]>[0]>;
  getApproval: string[];
  postIssueComment: Array<{ issueId: string; body: string }>;
  linkIssueApproval: Array<{ issueId: string; approvalId: string }>;
}

function makeClient(overrides: {
  createApprovalResult?: { id: string };
  getApprovalResult?: ApprovalRecord;
}): { client: PaperclipClient; calls: ClientCalls } {
  const calls: ClientCalls = {
    createApproval: [],
    getApproval: [],
    postIssueComment: [],
    linkIssueApproval: [],
  };

  const client = {
    async createApproval(input: Parameters<PaperclipClient["createApproval"]>[0]) {
      calls.createApproval.push(input);
      return overrides.createApprovalResult ?? { id: "appr-new" };
    },
    async getApproval(id: string) {
      calls.getApproval.push(id);
      if (!overrides.getApprovalResult) throw new Error("getApprovalResult not set");
      return overrides.getApprovalResult;
    },
    async postIssueComment(issueId: string, body: string) {
      calls.postIssueComment.push({ issueId, body });
    },
    async linkIssueApproval(issueId: string, approvalId: string) {
      calls.linkIssueApproval.push({ issueId, approvalId });
    },
  } as unknown as PaperclipClient;

  return { client, calls };
}

function makeReq(meta: EgressRequest["meta"] = {}): EgressRequest {
  return {
    tool: "send_email",
    payload: { to: "opposing@counsel.com", body: "PRIVILEGED-SENTINEL-TEXT" },
    meta,
  };
}

// ---------------------------------------------------------------------------
// Test 1: First call with issueId
// ---------------------------------------------------------------------------

describe("humanGate — first call with issueId", () => {
  it("creates approval, links, comments, returns pending_approval; payload sentinel absent from all client calls", async () => {
    const sentinel = "PRIVILEGED-SENTINEL-TEXT";
    const { client, calls } = makeClient({ createApprovalResult: { id: "appr-abc" } });

    const req = makeReq({ agentId: "agent-1", issueId: "issue-42" });
    const sha = "deadbeef1234";
    const result = await humanGate(client, req, "THIRD_PARTY_EGRESS", sha);

    // Returns pending
    assert.equal(result.status, "pending_approval");
    assert.equal((result as Extract<HumanGateResult, { status: "pending_approval" }>).approvalId, "appr-abc");
    assert.ok(
      (result as Extract<HumanGateResult, { status: "pending_approval" }>).resumeHint.length > 0,
      "resumeHint should be non-empty",
    );

    // createApproval called once
    assert.equal(calls.createApproval.length, 1);
    const created = calls.createApproval[0];
    assert.equal(created.requestedByAgentId, "agent-1");
    assert.deepEqual(created.issueIds, ["issue-42"]);
    // payload must contain sha, gate, tool, boundary — but NOT the egress payload text
    assert.equal((created.payload as Record<string, unknown>)["payloadSha256"], sha);
    assert.equal((created.payload as Record<string, unknown>)["gate"], "possiblaw-egress");
    assert.equal((created.payload as Record<string, unknown>)["tool"], "send_email");
    assert.equal((created.payload as Record<string, unknown>)["boundary"], "THIRD_PARTY_EGRESS");
    assert.ok(
      "requestedAt" in (created.payload as Record<string, unknown>),
      "payload must include requestedAt",
    );
    // Sentinel MUST NOT appear anywhere in any client call
    const allCallsJson = JSON.stringify(calls);
    assert.ok(
      !allCallsJson.includes(sentinel),
      `Egress payload sentinel "${sentinel}" must NOT appear in any client call; found in: ${allCallsJson}`,
    );

    // link called
    assert.equal(calls.linkIssueApproval.length, 1);
    assert.equal(calls.linkIssueApproval[0].issueId, "issue-42");
    assert.equal(calls.linkIssueApproval[0].approvalId, "appr-abc");

    // comment called; comment includes tool + approvalId; excludes payload sentinel
    assert.equal(calls.postIssueComment.length, 1);
    const comment = calls.postIssueComment[0];
    assert.equal(comment.issueId, "issue-42");
    assert.ok(comment.body.includes("send_email"), `comment should mention tool; got: ${comment.body}`);
    assert.ok(comment.body.includes("appr-abc"), `comment should mention approvalId; got: ${comment.body}`);
    assert.ok(!comment.body.includes(sentinel), `comment must not include payload sentinel; got: ${comment.body}`);
  });
});

// ---------------------------------------------------------------------------
// Test 2: First call without issueId — creates only, no link/comment
// ---------------------------------------------------------------------------

describe("humanGate — first call without issueId", () => {
  it("creates approval; no linkIssueApproval or postIssueComment calls", async () => {
    const { client, calls } = makeClient({ createApprovalResult: { id: "appr-xyz" } });

    const req = makeReq({ agentId: "agent-2" }); // no issueId
    const result = await humanGate(client, req, "MONEY_MOVEMENT", "sha-abc");

    assert.equal(result.status, "pending_approval");
    assert.equal(calls.createApproval.length, 1);
    assert.equal(calls.linkIssueApproval.length, 0);
    assert.equal(calls.postIssueComment.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Test 3: Re-entry approved + matching sha → approved
// ---------------------------------------------------------------------------

describe("humanGate — re-entry approved matching sha", () => {
  it("returns approved when sha matches stored payload", async () => {
    const sha = "correct-sha-123";
    const { client } = makeClient({
      getApprovalResult: {
        id: "appr-reentry",
        status: "approved",
        payload: { payloadSha256: sha, gate: "possiblaw-egress" },
      },
    });

    const req = makeReq({ approvalId: "appr-reentry" });
    const result = await humanGate(client, req, "THIRD_PARTY_EGRESS", sha);

    assert.equal(result.status, "approved");
  });
});

// ---------------------------------------------------------------------------
// Test 4: Re-entry approved + different sha → blocked, reason contains bait_and_switch_attempt
// ---------------------------------------------------------------------------

describe("humanGate — re-entry approved mismatched sha", () => {
  it("returns blocked with bait_and_switch_attempt when sha differs", async () => {
    const { client } = makeClient({
      getApprovalResult: {
        id: "appr-bait",
        status: "approved",
        payload: { payloadSha256: "original-sha", gate: "possiblaw-egress" },
      },
    });

    const req = makeReq({ approvalId: "appr-bait" });
    const result = await humanGate(client, req, "THIRD_PARTY_EGRESS", "different-sha");

    assert.equal(result.status, "blocked");
    const r = result as Extract<HumanGateResult, { status: "blocked" }>;
    assert.ok(
      r.reason.includes("bait_and_switch_attempt"),
      `reason should include "bait_and_switch_attempt"; got: ${r.reason}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 5: Re-entry rejected → blocked; revision_requested → blocked (distinct reasons)
// ---------------------------------------------------------------------------

describe("humanGate — re-entry rejected and revision_requested", () => {
  it("rejected → blocked with human-rejected reason", async () => {
    const { client } = makeClient({
      getApprovalResult: {
        id: "appr-rej",
        status: "rejected",
        payload: { payloadSha256: "sha-x" },
      },
    });

    const req = makeReq({ approvalId: "appr-rej" });
    const result = await humanGate(client, req, "COURT_FILING", "sha-x");

    assert.equal(result.status, "blocked");
    const r = result as Extract<HumanGateResult, { status: "blocked" }>;
    assert.ok(r.reason.toLowerCase().includes("reject"), `reason should mention reject; got: ${r.reason}`);
  });

  it("revision_requested → blocked with revision reason distinct from rejected", async () => {
    const { client } = makeClient({
      getApprovalResult: {
        id: "appr-rev",
        status: "revision_requested",
        payload: { payloadSha256: "sha-y" },
      },
    });

    const req = makeReq({ approvalId: "appr-rev" });
    const result = await humanGate(client, req, "COURT_FILING", "sha-y");

    assert.equal(result.status, "blocked");
    const r = result as Extract<HumanGateResult, { status: "blocked" }>;
    assert.ok(r.reason.toLowerCase().includes("revision"), `reason should mention revision; got: ${r.reason}`);
    // Must be distinct from the rejected reason
    assert.ok(
      !r.reason.toLowerCase().includes("reject"),
      `revision_requested reason must not say "reject"; got: ${r.reason}`,
    );
  });
});

// ---------------------------------------------------------------------------
// Test 6: Re-entry still pending → pending_approval, approvalId unchanged
// ---------------------------------------------------------------------------

describe("humanGate — re-entry still pending", () => {
  it("returns pending_approval with same approvalId when status is still pending", async () => {
    const { client } = makeClient({
      getApprovalResult: {
        id: "appr-still",
        status: "pending",
        payload: { payloadSha256: "sha-z" },
      },
    });

    const req = makeReq({ approvalId: "appr-still" });
    const result = await humanGate(client, req, "SIGNATURE", "sha-z");

    assert.equal(result.status, "pending_approval");
    const r = result as Extract<HumanGateResult, { status: "pending_approval" }>;
    assert.equal(r.approvalId, "appr-still");
  });
});
