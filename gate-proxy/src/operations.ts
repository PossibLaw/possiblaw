import type { ReceiptChain } from "./receipts.ts";
import { canonicalJson, sha256hex } from "./receipts.ts";

export interface DispatchOperationInput {
  target: string;
  tool: string;
  payloadSha256?: string;
  issueId?: string;
  approvalId?: string;
}

/**
 * Derive a payload-free, restart-stable identity for one external side effect.
 * Optional fields are omitted rather than serialized as undefined so the
 * digest has a canonical representation across runtimes and restarts.
 */
export function dispatchOperationId(input: DispatchOperationInput): string {
  const identity: Record<string, unknown> = {
    version: 1,
    target: input.target,
    tool: input.tool,
  };
  if (input.payloadSha256 !== undefined) identity["payloadSha256"] = input.payloadSha256;
  if (input.issueId !== undefined) identity["issueId"] = input.issueId;
  if (input.approvalId !== undefined) identity["approvalId"] = input.approvalId;
  return sha256hex(canonicalJson(identity));
}

/**
 * True once an operation identity has ever been recorded. Stable operation
 * identities are one-shot: pending/indeterminate work fails closed, and a
 * terminal success cannot be replayed after a lost response. A deliberate
 * repeat must use a distinct semantic operation identity.
 */
export function hasUnresolvedDispatch(
  receipts: ReceiptChain,
  operationId: string,
): boolean {
  for (const entry of receipts.entries()) {
    if (entry.body.operationId !== operationId) continue;
    return true;
  }
  return false;
}
