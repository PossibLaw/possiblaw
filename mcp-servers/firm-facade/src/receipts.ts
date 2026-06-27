// mcp-servers/firm-facade/src/receipts.ts
//
// FacadeReceiptWriter — facade end of the S6 audit-receipt channel.
//
// DESIGN (S6): The gate proxy is the sole ReceiptChain writer. The facade
// process MUST NOT open a second ReceiptChain against the shared file —
// two concurrent writers corrupt the hash-chained ledger. Instead, the
// facade POSTs receipt data here, and the gate proxy appends to the chain.
//
// FAIL-CLOSED: if the POST fails (gate unreachable, non-2xx), record()
// throws. Callers (built in later units) must fail the user-facing action
// when the receipt cannot be recorded for any state-changing facade tool call.

// ---------------------------------------------------------------------------
// Types (local — avoids cross-package import of gate-proxy's ReceiptChain)
// ---------------------------------------------------------------------------

export type FacadeOutcome =
  | "performed"
  | "anonymized_performed"
  | "pending"
  | "blocked"
  | "error";

export type FacadeTool =
  | "create_matter"
  | "get_matter_status"
  | "list_work_products"
  | "fetch_work_product"
  | "request_approval";

export interface FacadeReceiptInput {
  tool: FacadeTool;
  outcome: FacadeOutcome;
  payloadSha256: string;
  /** Optional matter identifier — forwarded to gate proxy, mapped into meta. */
  matterId?: string;
  /** Optional work-product identifier — forwarded to gate proxy, mapped into meta. */
  workProductId?: string;
  /** Optional approval identifier — forwarded to gate proxy as approvalId. */
  approvalId?: string;
  /** Optional agent identifier. */
  agentId?: string;
  /** Optional issue/matter-ticket identifier. */
  issueId?: string;
  /**
   * Caller-supplied audit metadata. Callers MUST NOT place payload text here;
   * payload is represented by payloadSha256 only.
   */
  meta?: Record<string, unknown>;
}

export interface FacadeReceiptWriterOptions {
  /** Base URL of the running gate-proxy (e.g. "http://localhost:9000"). */
  gateProxyUrl: string;
  /**
   * Injectable fetch implementation. Defaults to global `fetch`.
   * Inject a fake in tests to avoid network I/O.
   */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// FacadeReceiptWriter
// ---------------------------------------------------------------------------

export class FacadeReceiptWriter {
  private readonly gateProxyUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: FacadeReceiptWriterOptions) {
    this.gateProxyUrl = opts.gateProxyUrl;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  /**
   * Record a facade action receipt by POSTing to the gate proxy.
   *
   * FAIL-CLOSED: throws if the gate is unreachable or returns non-2xx.
   * The caller must not proceed with (or claim success of) a state-changing
   * action when the receipt cannot be durably recorded.
   */
  async record(input: FacadeReceiptInput): Promise<void> {
    const { tool, outcome, payloadSha256, matterId, workProductId, approvalId, agentId, issueId, meta } = input;

    // Build body — omit undefined fields to keep POST body clean
    const body: Record<string, unknown> = { tool, outcome, payloadSha256 };
    if (matterId !== undefined) body["matterId"] = matterId;
    if (workProductId !== undefined) body["workProductId"] = workProductId;
    if (approvalId !== undefined) body["approvalId"] = approvalId;
    if (agentId !== undefined) body["agentId"] = agentId;
    if (issueId !== undefined) body["issueId"] = issueId;
    if (meta !== undefined) body["meta"] = meta;

    const endpoint = `${this.gateProxyUrl}/receipts/facade`;

    // fetch itself may throw (network error, ECONNREFUSED) — let it propagate
    const res = await this.fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    // Fail-closed: non-2xx means receipt was NOT recorded
    if (!res.ok) {
      let detail = "";
      try {
        const json = await res.json() as Record<string, unknown>;
        detail = typeof json["error"] === "string" ? `: ${json["error"]}` : "";
      } catch { /* ignore parse failure */ }
      throw new Error(`FacadeReceiptWriter: gate proxy returned ${res.status}${detail}`);
    }
  }
}
