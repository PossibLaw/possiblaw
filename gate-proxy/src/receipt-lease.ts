import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class ReceiptStoreLeaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptStoreLeaseError";
  }
}

interface LeaseRecord {
  version: 1;
  instanceId: string;
  token: string;
  pid: number;
  hostname: string;
  acquiredAt: string;
}

export interface ReceiptStoreLease {
  readonly path: string;
  readonly instanceId: string;
  release(): void;
}

export function receiptStoreLeasePath(receiptsPath: string): string {
  return `${receiptsPath}.writer.lock`;
}

function existingLeaseError(): ReceiptStoreLeaseError {
  return new ReceiptStoreLeaseError(
    "Receipt store writer lease already exists. Stale leases are never broken automatically; " +
      "manual verification and removal are required before restart.",
  );
}

/**
 * Atomically acquire the single-writer lease for one receipt ledger.
 *
 * A crash intentionally leaves the record behind. PID/hostname/age are
 * diagnostic only: PID reuse, shared volumes, and clock skew make automated
 * stale-lock breaking unsafe. Operators must verify and remove stale records.
 */
export function acquireReceiptStoreLease(
  receiptsPath: string,
  instanceId: string,
): ReceiptStoreLease {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(instanceId)) {
    throw new ReceiptStoreLeaseError("Invalid gate instance identity");
  }

  const leasePath = receiptStoreLeasePath(receiptsPath);
  fs.mkdirSync(path.dirname(leasePath), { recursive: true });
  let fd: number;
  try {
    fd = fs.openSync(leasePath, "wx", 0o600);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") throw existingLeaseError();
    throw new ReceiptStoreLeaseError("Receipt store writer lease could not be created");
  }

  const record: LeaseRecord = {
    version: 1,
    instanceId,
    token: crypto.randomUUID(),
    pid: process.pid,
    hostname: os.hostname(),
    acquiredAt: new Date().toISOString(),
  };

  try {
    fs.writeSync(fd, JSON.stringify(record) + "\n", undefined, "utf8");
    fs.fsyncSync(fd);
  } catch {
    try { fs.closeSync(fd); } catch { /* best effort after failed acquisition */ }
    try { fs.unlinkSync(leasePath); } catch { /* preserve original failure */ }
    throw new ReceiptStoreLeaseError("Receipt store writer lease could not be persisted");
  }

  let released = false;
  return {
    path: leasePath,
    instanceId,
    release(): void {
      if (released) return;

      let current: unknown;
      try {
        current = JSON.parse(fs.readFileSync(leasePath, "utf8"));
      } catch {
        throw new ReceiptStoreLeaseError("Receipt store lease ownership changed; refusing removal");
      }
      const owner = current as Partial<LeaseRecord>;
      if (owner.instanceId !== record.instanceId || owner.token !== record.token) {
        throw new ReceiptStoreLeaseError("Receipt store lease ownership changed; refusing removal");
      }

      try {
        fs.unlinkSync(leasePath);
        fs.closeSync(fd);
      } catch {
        throw new ReceiptStoreLeaseError("Receipt store writer lease could not be released");
      }
      released = true;
    },
  };
}
