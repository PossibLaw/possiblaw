// ---------------------------------------------------------------------------
// poller.ts — Rejection poller for the gate-proxy.
//
// State is DERIVED FROM THE RECEIPT CHAIN (durable across restarts — no
// in-memory queue). For each unresolved pending approval whose paperclip status
// is rejected or revision_requested, we:
//   1. Post a comment on the issueId (if present) — names tool + approvalId +
//      decision, NO payload text.
//   2. Append a "blocked" receipt so findUnresolvedApprovals excludes it on
//      the next call.
//
// approved / pending approvals are left untouched — approved is handled by
// agent re-entry into the server; pending is still waiting.
// ---------------------------------------------------------------------------

import type { ReceiptChain, ReceiptBody } from "./receipts.ts";
import { sha256hex } from "./receipts.ts";
import type { PaperclipClient } from "./paperclip-client.ts";

// ---------------------------------------------------------------------------
// findUnresolvedApprovals
// ---------------------------------------------------------------------------

export interface UnresolvedApproval {
  approvalId: string;
  issueId?: string;
  tool: string;
}

/**
 * Return all "pending" receipts whose approvalId has NO later receipt
 * (performed or blocked) with the same approvalId.
 */
export function findUnresolvedApprovals(receipts: ReceiptChain): UnresolvedApproval[] {
  const entries = receipts.entries();

  // Collect all approvalIds that appear in a non-pending outcome (performed, blocked, etc.)
  const resolvedIds = new Set<string>();
  for (const entry of entries) {
    if (entry.body.approvalId && entry.body.outcome !== "pending") {
      resolvedIds.add(entry.body.approvalId);
    }
  }

  // Find "pending" receipts whose approvalId is NOT in resolvedIds
  const seen = new Set<string>();
  const result: UnresolvedApproval[] = [];
  for (const entry of entries) {
    const { outcome, approvalId, issueId, tool } = entry.body;
    if (outcome === "pending" && approvalId && !resolvedIds.has(approvalId) && !seen.has(approvalId)) {
      seen.add(approvalId);
      result.push({
        approvalId,
        issueId,
        tool,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// pollOnce
// ---------------------------------------------------------------------------

// minor: module-level reentrancy guard — overlapping calls no-op to avoid
// double-processing the same unresolved approvals concurrently.
let _pollInProgress = false;

/**
 * For each unresolved approval:
 *   - getApproval → rejected | revision_requested →
 *       postIssueComment (if issueId; names tool + approvalId + decision, no payload)
 *       + append "blocked" receipt (kind egress, outcome blocked, approvalId,
 *         meta:{resolvedBy:"poller", approvalStatus})
 *       so the next findUnresolvedApprovals excludes it.
 *   - approved / pending → do nothing (approved is handled by agent re-entry).
 *
 * minor: per-approval try/catch so one failing getApproval skips to the next sibling.
 * minor: module-level reentrancy guard so overlapping pollOnce calls no-op.
 */
export async function pollOnce(receipts: ReceiptChain, client: PaperclipClient): Promise<void> {
  if (_pollInProgress) return;
  _pollInProgress = true;
  try {
    const unresolved = findUnresolvedApprovals(receipts);

    for (const { approvalId, issueId, tool } of unresolved) {
      try {
        const record = await client.getApproval(approvalId);

        if (record.status === "rejected" || record.status === "revision_requested") {
          // Post comment on issue if we have one — NO payload text
          if (issueId) {
            await client.postIssueComment(
              issueId,
              `Egress approval resolved by poller. tool=${tool} approvalId=${approvalId} decision=${record.status}. ` +
                `The agent must handle this outcome and start a new request if needed.`,
            );
          }

          // Append blocked receipt so this approval is excluded from future polls
          const body: ReceiptBody = {
            kind: "egress",
            tool,
            boundary: null,
            decision: "human",
            outcome: "blocked",
            payloadSha256: sha256hex(`poller:${approvalId}`),
            approvalId,
            issueId,
            meta: {
              resolvedBy: "poller",
              approvalStatus: record.status,
            },
          };
          receipts.append(body);
        }
        // approved → do nothing (agent re-entry handles this)
        // pending → do nothing (still waiting)
      } catch {
        // minor: one approval failure skips to next sibling; outer caller logs
        continue;
      }
    }
  } finally {
    _pollInProgress = false;
  }
}
