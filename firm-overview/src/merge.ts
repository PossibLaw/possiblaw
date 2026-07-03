// ---------------------------------------------------------------------------
// merge.ts — pure board model for the Firm Overview dashboard.
//
// Merges raw paperclip client responses (issues, agents, approvals, work
// products) into per-client and firm-wide board shapes. No I/O, no
// Date.now() — the caller supplies `generatedAt`.
// ---------------------------------------------------------------------------

import type { Issue, Approval, WorkProduct } from "./paperclip.ts";

export const IN_FLIGHT_STATUSES = ["backlog", "todo", "in_progress", "in_review", "blocked"] as const;
export const OPEN_APPROVAL_STATUSES = ["pending", "revision_requested"] as const;

export interface ClientBoard {
  companyId: string;
  name: string;
  issuePrefix: string;
  dashboard: Record<string, unknown> | null;
  issues: Array<Issue & { assigneeAgentName: string | null; deepLink: string }>;
  approvals: Array<Approval & { deepLink: string }>;
  deliverables: Array<WorkProduct & { deepLink: string }>;
  deliverablesTruncated: boolean;
  error: string | null;
}

export interface FirmBoard {
  generatedAt: string;
  clients: ClientBoard[];
}

export function buildClientBoard(input: {
  company: { id: string; name: string; issuePrefix: string };
  publicUrl: string;
  dashboard: Record<string, unknown> | null;
  issues: Issue[];
  agents: Array<{ id: string; name: string }>;
  approvals: Approval[];
  workProducts: WorkProduct[];
  workProductsTruncated: boolean;
  error?: string | null;
}): ClientBoard {
  const { company, publicUrl, dashboard, issues, agents, approvals, workProducts, workProductsTruncated } = input;
  const inFlightStatuses: readonly string[] = IN_FLIGHT_STATUSES;
  const openApprovalStatuses: readonly string[] = OPEN_APPROVAL_STATUSES;
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));

  return {
    companyId: company.id,
    name: company.name,
    issuePrefix: company.issuePrefix,
    dashboard,
    issues: issues
      .filter((issue) => inFlightStatuses.includes(issue.status))
      .map((issue) => ({
        ...issue,
        assigneeAgentName:
          issue.assigneeAgentId != null ? (agentNameById.get(issue.assigneeAgentId) ?? null) : null,
        deepLink: `${publicUrl}/${company.issuePrefix}/issues/${issue.identifier ?? issue.id}`,
      })),
    approvals: approvals
      .filter((approval) => openApprovalStatuses.includes(approval.status))
      .map((approval) => ({
        ...approval,
        deepLink: `${publicUrl}/${company.issuePrefix}/approvals`,
      })),
    deliverables: workProducts.map((workProduct) => ({
      ...workProduct,
      deepLink: `${publicUrl}/${company.issuePrefix}/issues/${workProduct.issueId}`,
    })),
    deliverablesTruncated: workProductsTruncated,
    error: input.error ?? null,
  };
}

export function errorClientBoard(
  company: { id: string; name: string; issuePrefix: string },
  message: string,
): ClientBoard {
  return {
    companyId: company.id,
    name: company.name,
    issuePrefix: company.issuePrefix,
    dashboard: null,
    issues: [],
    approvals: [],
    deliverables: [],
    deliverablesTruncated: false,
    error: message,
  };
}

export function buildFirmBoard(clients: ClientBoard[], generatedAt: string): FirmBoard {
  return { generatedAt, clients };
}
