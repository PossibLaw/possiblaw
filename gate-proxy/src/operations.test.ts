import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { dispatchOperationId, hasUnresolvedDispatch } from "./operations.ts";
import { ReceiptChain, sha256hex } from "./receipts.ts";

describe("dispatch operation identity", () => {
  it("is deterministic and changes when a semantic identity field changes", () => {
    const input = {
      target: "performer",
      tool: "send_email",
      payloadSha256: sha256hex("payload"),
      issueId: "ISSUE-1",
    };
    assert.equal(dispatchOperationId(input), dispatchOperationId({ ...input }));
    assert.notEqual(
      dispatchOperationId(input),
      dispatchOperationId({ ...input, issueId: "ISSUE-2" }),
    );
  });

  it("derives unresolved state from the persisted chain across instances", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-operations-test-"));
    const receiptsPath = path.join(dir, "receipts.jsonl");
    const receipts = new ReceiptChain(receiptsPath);
    const operationId = dispatchOperationId({
      target: "performer",
      tool: "send_email",
      payloadSha256: sha256hex("payload"),
    });
    receipts.append({
      kind: "egress",
      tool: "send_email",
      boundary: "THIRD_PARTY_EGRESS",
      decision: "allow",
      outcome: "reserved",
      payloadSha256: sha256hex("payload"),
      operationId,
      meta: { dispatchReservation: true },
    });
    assert.equal(hasUnresolvedDispatch(new ReceiptChain(receiptsPath), operationId), true);

    receipts.append({
      kind: "egress",
      tool: "send_email",
      boundary: "THIRD_PARTY_EGRESS",
      decision: "allow",
      outcome: "performed",
      payloadSha256: sha256hex("payload"),
      operationId,
    });
    assert.equal(
      hasUnresolvedDispatch(new ReceiptChain(receiptsPath), operationId),
      true,
      "a completed side effect remains idempotently closed to response-loss replay",
    );
  });

  it("keeps a created human approval fail-closed until its approvalId is used", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-operations-pending-test-"));
    const receipts = new ReceiptChain(path.join(dir, "receipts.jsonl"));
    const operationId = dispatchOperationId({
      target: "paperclip_approval",
      tool: "file_court_document",
      payloadSha256: sha256hex("payload"),
      issueId: "ISSUE-1",
    });
    receipts.append({
      kind: "egress",
      tool: "file_court_document",
      boundary: "COURT_FILING",
      decision: "human",
      outcome: "pending",
      payloadSha256: sha256hex("payload"),
      issueId: "ISSUE-1",
      approvalId: "APPROVAL-1",
      operationId,
    });
    assert.equal(hasUnresolvedDispatch(receipts, operationId), true);
  });
});
