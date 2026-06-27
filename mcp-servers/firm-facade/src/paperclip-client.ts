// mcp-servers/firm-facade/src/paperclip-client.ts
//
// FirmFacadeClient — company-scoped REST client for the firm-facade MCP server.
//
// SECURITY INVARIANT: this client exposes NO approve/reject/decide capability.
// There is no method that calls /approve, /reject, or /request-revision —
// those endpoints are board-only and must never be reachable via the MCP facade.
// The invariant test (paperclip-client.test.ts) enumerates all prototype +
// own method names and asserts none match /^(approv|reject|decide)|request.?revision/i.
//
// Pattern mirrors gate-proxy/src/paperclip-client.ts: module-level request
// helper, Bearer auth on every call, structured error that NEVER leaks the key.

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export class FacadeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly urlPath: string,
  ) {
    // Message contains status + URL path ONLY. The bearer token is NEVER included.
    super(`FacadeApiError: ${status} ${urlPath}`);
    this.name = "FacadeApiError";
  }
}

// ---------------------------------------------------------------------------
// Input/output types
// ---------------------------------------------------------------------------

export interface CreateIssueBody {
  title: string;
  description?: string;
  projectId?: string;
  parentId?: string;
  [key: string]: unknown;
}

export interface CreateApprovalBody {
  /** Approval type — callers choose from board-approval enum values. */
  type: string;
  /** Structured payload for the human reviewer. */
  payload: Record<string, unknown>;
  requestedByAgentId?: string;
  issueIds?: string[];
}

export interface IssueRecord {
  id: string;
  status: string;
  workProducts?: unknown[];
  documentSummaries?: unknown[];
  [key: string]: unknown;
}

export interface WorkProductRecord {
  id: string;
  type: string;
  provider?: string;
  title?: string;
  url?: string;
  status?: string;
  reviewState?: string;
  summary?: string;
  isPrimary?: boolean;
  /**
   * Optional external identifier used to derive the document key for full-text
   * retrieval (Unit D spike). When set, getDocument is called with this value.
   */
  externalId?: string;
  /**
   * Optional metadata record. The document key may live here as
   * `metadata.documentKey` or `metadata.key` when externalId is absent.
   */
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DocumentRecord {
  id: string;
  body?: string;
  [key: string]: unknown;
}

export interface ApprovalRecord {
  id: string;
  status: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface FirmFacadeClientConfig {
  /** Base URL of the paperclip control plane, e.g. "http://127.0.0.1:3100". */
  baseUrl: string;
  /** Company (firm) id — scopes all resource-creation endpoints. */
  companyId: string;
  /** API key sent as Bearer token on every request. */
  apiKey: string;
  /** Injectable fetch — defaults to globalThis.fetch. Inject a fake in tests. */
  fetchImpl?: typeof fetch;
}

// ---------------------------------------------------------------------------
// Module-level helpers (not on the prototype — keeps method count exact)
// ---------------------------------------------------------------------------

function buildHeaders(apiKey: string, write = false): Record<string, string> {
  const h: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (write) {
    h["Content-Type"] = "application/json";
  }
  return h;
}

async function doRequest<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  method: "GET" | "POST",
  urlPath: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${baseUrl}${urlPath}`;
  const init: RequestInit = {
    method,
    headers: buildHeaders(apiKey, body !== undefined),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetchImpl(url, init);
  if (res.status < 200 || res.status >= 300) {
    // Throw a structured error. The apiKey is NEVER included in the message.
    throw new FacadeApiError(res.status, urlPath);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// FirmFacadeClient — exactly 5 public methods on the prototype.
// NONE of them approve, reject, or decide an approval.
// ---------------------------------------------------------------------------

export class FirmFacadeClient {
  private readonly baseUrl: string;
  private readonly companyId: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: FirmFacadeClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.companyId = cfg.companyId;
    this.apiKey = cfg.apiKey;
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  }

  /**
   * Create a new issue (matter) under this company.
   * POST /api/companies/{companyId}/issues
   */
  async createIssue(body: CreateIssueBody): Promise<IssueRecord> {
    return doRequest<IssueRecord>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "POST",
      `/api/companies/${encodeURIComponent(this.companyId)}/issues`,
      body as unknown as Record<string, unknown>,
    );
  }

  /**
   * Get an issue (matter) by id, including status, workProducts[], documentSummaries[].
   * GET /api/issues/{issueId}
   */
  async getIssue(issueId: string): Promise<IssueRecord> {
    return doRequest<IssueRecord>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}`,
    );
  }

  /**
   * List work-product metadata for an issue.  Returns metadata array only — NO document body.
   * GET /api/issues/{issueId}/work-products
   */
  async listWorkProducts(issueId: string): Promise<WorkProductRecord[]> {
    return doRequest<WorkProductRecord[]>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/work-products`,
    );
  }

  /**
   * Get a document WITH full body text for an issue.
   * This is the full-text path — handlers call it only under the opt-in policy.
   * GET /api/issues/{issueId}/documents/{key}
   */
  async getDocument(issueId: string, key: string): Promise<DocumentRecord> {
    return doRequest<DocumentRecord>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "GET",
      `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`,
    );
  }

  /**
   * Create an approval request.  The `type` field selects the board-approval
   * enum (e.g. "request_board_approval"); the handler chooses it — this method
   * passes it through without hardcoding.
   *
   * NOTE: this creates a REQUEST. The client has no approve/reject method.
   * POST /api/companies/{companyId}/approvals
   */
  async createApproval(body: CreateApprovalBody): Promise<ApprovalRecord> {
    const { type, payload, requestedByAgentId, issueIds } = body;
    const reqBody: Record<string, unknown> = { type, payload };
    if (requestedByAgentId !== undefined) reqBody["requestedByAgentId"] = requestedByAgentId;
    if (issueIds !== undefined) reqBody["issueIds"] = issueIds;
    return doRequest<ApprovalRecord>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "POST",
      `/api/companies/${encodeURIComponent(this.companyId)}/approvals`,
      reqBody,
    );
  }
}
