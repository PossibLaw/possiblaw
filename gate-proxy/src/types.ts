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
  /**
   * C1/C2 — other matters whose context contributed to this payload.
   *
   * Declared by the calling agent. Declaring MORE can only raise the
   * confidentiality tier, never lower it, so an honest agent cannot hurt
   * itself and a dishonest one gains nothing by over-declaring. Omission is
   * the residual gap, and is what the trace store's contextRefs make
   * detectable after the fact.
   */
  contextIssueIds?: string[];
}

export interface EgressRequest {
  tool: string;
  payload: Record<string, unknown>;
  meta: EgressMeta;
}
