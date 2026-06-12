export type BoundaryType =
  | "THIRD_PARTY_EGRESS"
  | "CONFIDENTIAL_TO_CLOUD"
  | "COURT_FILING"
  | "SIGNATURE"
  | "MONEY_MOVEMENT"
  | "IRREVERSIBLE_EXTERNAL_OP";

export type Decision = "allow" | "anonymize" | "human" | "block";

export type Confidentiality = "standard" | "confidential" | "privileged";

export interface EgressMeta {
  agentId?: string;
  issueId?: string;
  confidentiality?: Confidentiality;
  entities?: string[];
  approvalId?: string;
}

export interface EgressRequest {
  tool: string;
  payload: Record<string, unknown>;
  meta: EgressMeta;
}
