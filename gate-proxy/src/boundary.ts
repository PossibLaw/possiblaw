import type { BoundaryType, EgressMeta } from "./types.ts";
import type { EgressRequest } from "./types.ts";

export class UnknownToolError extends Error {
  constructor(tool: string) {
    super(`Unknown egress tool: ${tool}`);
    this.name = "UnknownToolError";
  }
}

type BoundaryRule = BoundaryType | ((meta: EgressMeta) => BoundaryType | null);

export const TOOL_BOUNDARIES: Record<string, BoundaryRule> = {
  send_email: "THIRD_PARTY_EGRESS",
  share_external: "THIRD_PARTY_EGRESS",
  upload_document: "THIRD_PARTY_EGRESS",
  query_external_model: (meta: EgressMeta): BoundaryType | null =>
    meta.confidentiality === "confidential" || meta.confidentiality === "privileged"
      ? "CONFIDENTIAL_TO_CLOUD"
      : null,
  file_court_document: "COURT_FILING",
  sign_document: "SIGNATURE",
  send_payment: "MONEY_MOVEMENT",
  delete_external_resource: "IRREVERSIBLE_EXTERNAL_OP",
};

export function classify(req: EgressRequest): BoundaryType | null {
  const rule = TOOL_BOUNDARIES[req.tool];
  if (rule === undefined) {
    throw new UnknownToolError(req.tool);
  }
  return typeof rule === "function" ? rule(req.meta) : rule;
}
