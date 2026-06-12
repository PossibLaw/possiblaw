// ---------------------------------------------------------------------------
// PaperclipClient — thin REST client for the paperclip control plane.
//
// SECURITY INVARIANT: this module contains ONLY these 4 public methods:
//   createApproval, getApproval, postIssueComment, linkIssueApproval
// It must NEVER contain action path segments /approve, /reject, or /request-revision —
// those endpoints are board-only and the human gate must never call them.
// The integrity invariant test (paperclip-client.test.ts) statically asserts this.
// ---------------------------------------------------------------------------

export class PaperclipApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly urlPath: string,
  ) {
    // Message intentionally contains status + URL PATH ONLY.
    // Request/response bodies are NEVER included — privileged payload could be echoed.
    super(`PaperclipApiError: ${status} ${urlPath}`);
    this.name = "PaperclipApiError";
  }
}

export interface PaperclipClientConfig {
  baseUrl: string;       // e.g. http://127.0.0.1:3100
  companyId: string;
  apiKey?: string;       // optional: local_trusted mode needs none
  fetchImpl?: typeof fetch;
}

export interface ApprovalRecord {
  id: string;
  status: "pending" | "approved" | "rejected" | "revision_requested";
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Module-level helpers (not on prototype — keeps method count at exactly 4)
// ---------------------------------------------------------------------------

function buildHeaders(apiKey?: string, write = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (apiKey) {
    h["Authorization"] = `Bearer ${apiKey}`;
  }
  if (write) {
    h["content-type"] = "application/json";
  }
  return h;
}

async function doRequest<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string | undefined,
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
    throw new PaperclipApiError(res.status, urlPath);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// PaperclipClient — exactly 4 public methods on the prototype
// ---------------------------------------------------------------------------

export class PaperclipClient {
  private readonly baseUrl: string;
  private readonly companyId: string;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: PaperclipClientConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, "");
    this.companyId = cfg.companyId;
    this.apiKey = cfg.apiKey;
    this.fetchImpl = cfg.fetchImpl ?? globalThis.fetch;
  }

  async createApproval(input: {
    requestedByAgentId?: string;
    issueIds?: string[];
    payload: Record<string, unknown>;
  }): Promise<{ id: string }> {
    return doRequest<{ id: string }>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "POST",
      `/api/companies/${encodeURIComponent(this.companyId)}/approvals`,
      {
        type: "request_board_approval", // hardcoded — never a caller parameter
        ...(input.requestedByAgentId !== undefined
          ? { requestedByAgentId: input.requestedByAgentId }
          : {}),
        ...(input.issueIds !== undefined ? { issueIds: input.issueIds } : {}),
        payload: input.payload,
      },
    );
  }

  async getApproval(id: string): Promise<ApprovalRecord> {
    // I1 (b): encodeURIComponent every interpolated path segment
    return doRequest<ApprovalRecord>(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "GET",
      `/api/approvals/${encodeURIComponent(id)}`,
    );
  }

  async postIssueComment(issueId: string, body: string): Promise<void> {
    await doRequest(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "POST",
      `/api/issues/${encodeURIComponent(issueId)}/comments`,
      { body },
    );
  }

  async linkIssueApproval(issueId: string, approvalId: string): Promise<void> {
    await doRequest(
      this.fetchImpl,
      this.baseUrl,
      this.apiKey,
      "POST",
      `/api/issues/${encodeURIComponent(issueId)}/approvals`,
      { approvalId },
    );
  }
}
