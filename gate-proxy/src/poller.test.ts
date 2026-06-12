import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ReceiptChain,
  sha256hex,
  canonicalJson,
  type ReceiptBody,
} from "./receipts.ts";
import type { PaperclipClient, ApprovalRecord } from "./paperclip-client.ts";
import { findUnresolvedApprovals, pollOnce } from "./poller.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-poller-test-"));
}

function mkBody(overrides: Partial<ReceiptBody> = {}): ReceiptBody {
  return {
    kind: "egress",
    tool: "file_court_document",
    boundary: "COURT_FILING",
    decision: "human",
    outcome: "performed",
    payloadSha256: sha256hex("test"),
    ...overrides,
  };
}

/** Fake client: map of approvalId → ApprovalRecord; comments log */
function makeFakeClient(
  approvals: Map<string, ApprovalRecord>,
  comments: Array<{ issueId: string; body: string }> = [],
): PaperclipClient {
  return {
    async createApproval(_input: unknown) { return { id: "ignored" }; },
    async getApproval(id: string) {
      const r = approvals.get(id);
      if (!r) throw new Error(`unknown approval ${id}`);
      return r;
    },
    async postIssueComment(issueId: string, body: string) {
      comments.push({ issueId, body });
    },
    async linkIssueApproval(_issueId: string, _approvalId: string) {},
  } as unknown as PaperclipClient;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("poller", () => {
  // 1. findUnresolvedApprovals: pending with no later receipt → unresolved
  it("findUnresolvedApprovals returns pending with no later receipt", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "A1", issueId: "I1" }));
    chain.append(mkBody({ outcome: "pending", approvalId: "A2" }));

    const unresolved = findUnresolvedApprovals(chain);
    assert.equal(unresolved.length, 2);
    const ids = unresolved.map((u) => u.approvalId);
    assert.ok(ids.includes("A1"));
    assert.ok(ids.includes("A2"));
    const a1 = unresolved.find((u) => u.approvalId === "A1");
    assert.equal(a1?.issueId, "I1");
  });

  // pending with a later "blocked" receipt for same approvalId → resolved
  it("findUnresolvedApprovals excludes approvals resolved by later receipt", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "A1" }));
    chain.append(mkBody({ outcome: "blocked", approvalId: "A1" })); // resolved
    chain.append(mkBody({ outcome: "pending", approvalId: "A2" })); // still pending

    const unresolved = findUnresolvedApprovals(chain);
    assert.equal(unresolved.length, 1);
    assert.equal(unresolved[0].approvalId, "A2");
  });

  // pending with a later "performed" receipt for same approvalId → resolved
  it("findUnresolvedApprovals excludes approvals resolved by performed receipt", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "A1" }));
    chain.append(mkBody({ outcome: "performed", approvalId: "A1" })); // resolved by perform

    const unresolved = findUnresolvedApprovals(chain);
    assert.equal(unresolved.length, 0);
  });

  // empty chain → no unresolved
  it("findUnresolvedApprovals on empty chain → empty array", () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));
    assert.deepEqual(findUnresolvedApprovals(chain), []);
  });

  // 15a. pollOnce: rejected → posts comment (contains A1, no payload), appends blocked receipt
  it("pollOnce: rejected approval → posts comment + appends blocked receipt", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "A1", issueId: "I1", tool: "file_court_document" }));

    const comments: Array<{ issueId: string; body: string }> = [];
    const approvals = new Map<string, ApprovalRecord>([
      ["A1", { id: "A1", status: "rejected", payload: {} }],
    ]);
    const client = makeFakeClient(approvals, comments);

    await pollOnce(chain, client);

    // Comment posted with approvalId but no payload text
    assert.equal(comments.length, 1, "must post exactly one comment");
    assert.equal(comments[0].issueId, "I1");
    assert.ok(comments[0].body.includes("A1"), "comment must contain approvalId");
    assert.ok(!comments[0].body.includes("test payload"), "comment must not contain payload text");

    // Blocked receipt appended
    const entries = chain.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.approvalId, "A1");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["resolvedBy"], "poller");
    assert.equal(meta["approvalStatus"], "rejected");
  });

  // 15b. second pollOnce makes NO further client calls for already-resolved A1
  it("pollOnce: second call for already-resolved approval → no further client calls", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "A1", issueId: "I1" }));

    let callCount = 0;
    const approvals = new Map<string, ApprovalRecord>([
      ["A1", { id: "A1", status: "rejected", payload: {} }],
    ]);
    const comments: Array<{ issueId: string; body: string }> = [];
    const client: PaperclipClient = {
      async createApproval(_input: unknown) { return { id: "x" }; },
      async getApproval(id: string) {
        callCount++;
        const r = approvals.get(id);
        if (!r) throw new Error(`unknown ${id}`);
        return r;
      },
      async postIssueComment(issueId: string, body: string) { comments.push({ issueId, body }); },
      async linkIssueApproval(_issueId: string, _approvalId: string) {},
    } as unknown as PaperclipClient;

    await pollOnce(chain, client); // first call resolves A1
    const callsAfterFirst = callCount;

    await pollOnce(chain, client); // second call should not touch A1

    assert.equal(callCount, callsAfterFirst, "no additional getApproval calls for resolved A1");
    assert.equal(comments.length, 1, "only one comment should have been posted");
  });

  // 15c. revision_requested → also triggers blocked receipt
  it("pollOnce: revision_requested → posts comment + appends blocked receipt", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "B1", issueId: "I2", tool: "sign_document" }));

    const comments: Array<{ issueId: string; body: string }> = [];
    const approvals = new Map<string, ApprovalRecord>([
      ["B1", { id: "B1", status: "revision_requested", payload: {} }],
    ]);
    const client = makeFakeClient(approvals, comments);

    await pollOnce(chain, client);

    assert.equal(comments.length, 1);
    assert.ok(comments[0].body.includes("B1"));
    const entries = chain.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.approvalId, "B1");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["approvalStatus"], "revision_requested");
  });

  // 15d. approved-status approval → untouched (do nothing)
  it("pollOnce: approved approval → untouched, no receipt appended", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "C1" }));
    const lengthBefore = chain.entries().length;

    const approvals = new Map<string, ApprovalRecord>([
      ["C1", { id: "C1", status: "approved", payload: {} }],
    ]);
    const comments: Array<{ issueId: string; body: string }> = [];
    const client = makeFakeClient(approvals, comments);

    await pollOnce(chain, client);

    // Chain should not have grown — approved is handled by agent re-entry
    assert.equal(chain.entries().length, lengthBefore, "no receipt appended for approved");
    assert.equal(comments.length, 0, "no comment for approved");
  });

  // 15e. pending approval → untouched (still waiting)
  it("pollOnce: still-pending approval → untouched", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "D1" }));
    const lengthBefore = chain.entries().length;

    const approvals = new Map<string, ApprovalRecord>([
      ["D1", { id: "D1", status: "pending", payload: {} }],
    ]);
    const client = makeFakeClient(approvals);

    await pollOnce(chain, client);

    assert.equal(chain.entries().length, lengthBefore);
  });

  // No issueId → no comment, but still appends blocked receipt
  it("pollOnce: rejected with no issueId → blocked receipt, no comment", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    // No issueId in pending receipt
    chain.append(mkBody({ outcome: "pending", approvalId: "E1", tool: "send_payment" }));

    const comments: Array<{ issueId: string; body: string }> = [];
    const approvals = new Map<string, ApprovalRecord>([
      ["E1", { id: "E1", status: "rejected", payload: {} }],
    ]);
    const client = makeFakeClient(approvals, comments);

    await pollOnce(chain, client);

    assert.equal(comments.length, 0, "no comment when no issueId");
    const entries = chain.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.approvalId, "E1");
  });

  // minor: per-approval isolation — first getApproval throws → second still processed
  it("minor: first approval getApproval throws → second approval still processed", async () => {
    const dir = tmpDir();
    const chain = new ReceiptChain(path.join(dir, "r.jsonl"));

    chain.append(mkBody({ outcome: "pending", approvalId: "FAIL1", tool: "sign_document" }));
    chain.append(mkBody({ outcome: "pending", approvalId: "OK2", issueId: "I_OK2", tool: "send_payment" }));

    const comments: Array<{ issueId: string; body: string }> = [];
    const approvals = new Map<string, ApprovalRecord>([
      // FAIL1 is not in the map → getApproval will throw
      ["OK2", { id: "OK2", status: "rejected", payload: {} }],
    ]);
    const client = makeFakeClient(approvals, comments);

    await pollOnce(chain, client);

    // OK2 must still be resolved even though FAIL1 threw
    const entries = chain.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.approvalId, "OK2", "second approval must be processed despite first throwing");
    assert.equal(last.body.outcome, "blocked");
    assert.equal(comments.length, 1, "comment for OK2 must be posted");
    assert.equal(comments[0].issueId, "I_OK2");
  });
});
