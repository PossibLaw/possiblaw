// ---------------------------------------------------------------------------
// humanGate — async human approval gate using the paperclip control plane.
//
// SECURITY INVARIANT: the egress payload (req.payload) is NEVER passed to any
// paperclip API call, comment, or error message. It is represented solely by
// payloadSha256. Bait-and-switch defense: on re-entry the stored sha is compared
// to the re-submitted sha; mismatch → blocked.
//
// Flow:
//   First call  (no meta.approvalId): create approval, optionally link + comment,
//               return pending_approval. Agent MUST end its turn; paperclip wakes
//               it via heartbeat reason "approval_approved".
//   Re-entry    (meta.approvalId present): read approval status → approved/blocked/pending.
// ---------------------------------------------------------------------------

import type { EgressRequest, BoundaryType } from "../types.ts";
import type { PaperclipClient } from "../paperclip-client.ts";

export type HumanGateResult =
  | { status: "pending_approval"; approvalId: string; resumeHint: string }
  | { status: "approved" }
  | { status: "blocked"; reason: string };

const RESUME_HINT =
  "End your turn now. You will be woken when a human decides in the paperclip dashboard " +
  "(heartbeat reason: approval_approved). On wake, re-call the same egress endpoint with " +
  "the IDENTICAL payload plus meta.approvalId set to the approvalId returned here.";

export async function humanGate(
  client: PaperclipClient,
  req: EgressRequest,
  boundary: BoundaryType,
  payloadSha256: string,
): Promise<HumanGateResult> {
  // ------------------------------------------------------------------
  // Re-entry path
  // ------------------------------------------------------------------
  if (req.meta.approvalId) {
    const record = await client.getApproval(req.meta.approvalId);

    switch (record.status) {
      case "approved": {
        const storedSha = record.payload["payloadSha256"];
        if (storedSha !== payloadSha256) {
          return {
            status: "blocked",
            reason:
              `bait_and_switch_attempt: approval was granted for payload sha=${String(storedSha)} ` +
              `but re-entry presents sha=${payloadSha256}. These must be identical.`,
          };
        }
        return { status: "approved" };
      }

      case "rejected":
        return {
          status: "blocked",
          reason: "A human rejected this egress request in the paperclip dashboard.",
        };

      case "revision_requested":
        return {
          status: "blocked",
          reason:
            "A human requested revision for this egress request. " +
            "Revise the payload and start a NEW gate pass (do not reuse this approvalId).",
        };

      case "pending":
        return {
          status: "pending_approval",
          approvalId: req.meta.approvalId,
          resumeHint: RESUME_HINT,
        };
    }
  }

  // ------------------------------------------------------------------
  // First call path — never include req.payload content in API calls
  // ------------------------------------------------------------------
  const approvalPayload: Record<string, unknown> = {
    gate: "possiblaw-egress",
    tool: req.tool,
    boundary,
    payloadSha256,
    requestedAt: new Date().toISOString(),
  };

  const created = await client.createApproval({
    requestedByAgentId: req.meta.agentId,
    ...(req.meta.issueId !== undefined ? { issueIds: [req.meta.issueId] } : {}),
    payload: approvalPayload,
  });

  if (req.meta.issueId) {
    await client.linkIssueApproval(req.meta.issueId, created.id);
    await client.postIssueComment(
      req.meta.issueId,
      `Egress approval required. tool=${req.tool} boundary=${boundary} approvalId=${created.id}. ` +
        `A human must approve or reject this request in the paperclip dashboard before the agent can proceed.`,
    );
  }

  return {
    status: "pending_approval",
    approvalId: created.id,
    resumeHint: RESUME_HINT,
  };
}
