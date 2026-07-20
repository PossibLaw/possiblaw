import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  acquireReceiptStoreLease,
  ReceiptStoreLeaseError,
  receiptStoreLeasePath,
} from "./receipt-lease.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-receipt-lease-test-"));
}

describe("receipt-store single-writer lease", () => {
  it("atomically rejects a competing writer while the first lease is held", () => {
    const receiptsPath = path.join(tmpDir(), "receipts.jsonl");
    const first = acquireReceiptStoreLease(receiptsPath, "instance-one");
    try {
      assert.throws(
        () => acquireReceiptStoreLease(receiptsPath, "instance-two"),
        ReceiptStoreLeaseError,
      );
      const record = JSON.parse(fs.readFileSync(receiptStoreLeasePath(receiptsPath), "utf8")) as Record<string, unknown>;
      assert.equal(record["instanceId"], "instance-one");
    } finally {
      first.release();
    }
  });

  it("releases on shutdown so a restarted process can acquire", () => {
    const receiptsPath = path.join(tmpDir(), "receipts.jsonl");
    const first = acquireReceiptStoreLease(receiptsPath, "instance-one");
    first.release();
    first.release(); // idempotent graceful-shutdown cleanup

    const second = acquireReceiptStoreLease(receiptsPath, "instance-two");
    try {
      assert.ok(fs.existsSync(receiptStoreLeasePath(receiptsPath)));
    } finally {
      second.release();
    }
    assert.equal(fs.existsSync(receiptStoreLeasePath(receiptsPath)), false);
  });

  it("never auto-breaks a stale-looking or malformed lease", () => {
    const receiptsPath = path.join(tmpDir(), "receipts.jsonl");
    const lockPath = receiptStoreLeasePath(receiptsPath);
    fs.writeFileSync(lockPath, JSON.stringify({
      instanceId: "dead-instance",
      pid: 999_999_999,
      hostname: os.hostname(),
      acquiredAt: "2000-01-01T00:00:00.000Z",
    }) + "\n", { mode: 0o600 });
    const before = fs.readFileSync(lockPath);

    assert.throws(
      () => acquireReceiptStoreLease(receiptsPath, "replacement"),
      /manual verification and removal/,
    );
    assert.deepEqual(fs.readFileSync(lockPath), before);

    fs.writeFileSync(lockPath, "not-json\n");
    assert.throws(
      () => acquireReceiptStoreLease(receiptsPath, "replacement"),
      /manual verification and removal/,
    );
    assert.equal(fs.readFileSync(lockPath, "utf8"), "not-json\n");
  });

  it("an owner refuses to remove a lease file replaced with another identity", () => {
    const receiptsPath = path.join(tmpDir(), "receipts.jsonl");
    const lease = acquireReceiptStoreLease(receiptsPath, "instance-one");
    const lockPath = receiptStoreLeasePath(receiptsPath);
    const original = fs.readFileSync(lockPath);
    fs.writeFileSync(lockPath, JSON.stringify({ instanceId: "instance-two", token: "replacement" }) + "\n");

    assert.throws(() => lease.release(), /ownership changed/);
    assert.ok(fs.existsSync(lockPath), "release must not unlink another owner's record");
    fs.writeFileSync(lockPath, original);
    lease.release();
  });
});
