// ---------------------------------------------------------------------------
// PaperclipClient — thin, typed REST client for the paperclip control plane,
// used by the firm-overview dashboard server (built in later tasks).
//
// Contract: every method calls `fetch` against `${baseUrl}${path}` with
// header `Authorization: Bearer ${token}` only when `token` is set, and
// `accept: application/json`. Non-2xx responses throw `PaperclipHttpError`
// EXCEPT `decideApproval`, which returns `{ status, body }` without
// throwing — the server proxies the (possibly non-2xx) result verbatim.
// ---------------------------------------------------------------------------

export interface PaperclipClientOpts {
  baseUrl: string;
  token?: string;
}

export interface Issue {
  id: string;
  title: string;
  status: string;
  priority: number | null;
  assigneeAgentId: string | null;
  identifier: string | null;
  updatedAt: string;
}

export interface Approval {
  id: string;
  companyId: string;
  type: string;
  status: string;
  requestedByAgentId: string | null;
  createdAt: string;
}

export interface WorkProduct {
  id: string;
  issueId: string;
  type: string;
  title: string;
  status: string | null;
  url: string | null;
  createdAt: string;
}

export class PaperclipHttpError extends Error {
  constructor(
    public status: number,
    public path: string,
  ) {
    super(`PaperclipHttpError: ${status} ${path}`);
    this.name = "PaperclipHttpError";
  }
}

export class PaperclipClient {
  private readonly baseUrl: string;
  private readonly token?: string;

  constructor(opts: PaperclipClientOpts) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
  }

  private headers(hasBody: boolean): Record<string, string> {
    const h: Record<string, string> = { accept: "application/json" };
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    if (hasBody) h["content-type"] = "application/json";
    return h;
  }

  /**
   * Shared request helper: fetch `${baseUrl}${path}`, attach the
   * Authorization header only when a token is set, and throw
   * PaperclipHttpError on any non-2xx response.
   */
  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method, headers: this.headers(body !== undefined) };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(`${this.baseUrl}${path}`, init);
    if (res.status < 200 || res.status >= 300) {
      throw new PaperclipHttpError(res.status, path);
    }
    return (await res.json()) as T;
  }

  async listCompanies(): Promise<Array<{ id: string; name: string; issuePrefix: string }>> {
    return this.request("GET", "/api/companies");
  }

  async getDashboard(companyId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/api/companies/${encodeURIComponent(companyId)}/dashboard`);
  }

  async listIssues(companyId: string, statuses: string[]): Promise<Issue[]> {
    const params = new URLSearchParams({
      status: statuses.join(","),
      sortField: "updated",
      sortDir: "desc",
      limit: "100",
    });
    return this.request(
      "GET",
      `/api/companies/${encodeURIComponent(companyId)}/issues?${params.toString()}`,
    );
  }

  async listAgents(companyId: string): Promise<Array<{ id: string; name: string }>> {
    return this.request("GET", `/api/companies/${encodeURIComponent(companyId)}/agents`);
  }

  async listApprovals(companyId: string): Promise<Approval[]> {
    return this.request("GET", `/api/companies/${encodeURIComponent(companyId)}/approvals`);
  }

  async listWorkProducts(issueId: string): Promise<WorkProduct[]> {
    return this.request("GET", `/api/issues/${encodeURIComponent(issueId)}/work-products`);
  }

  /**
   * Exception to the shared request() contract: the server proxies this
   * result to the caller verbatim, including non-2xx statuses, so this
   * method never throws — it always resolves with {status, body}.
   */
  async decideApproval(
    approvalId: string,
    action: "approve" | "reject",
    decisionNote?: string,
  ): Promise<{ status: number; body: unknown }> {
    const path = `/api/approvals/${encodeURIComponent(approvalId)}/${action}`;
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ decisionNote: decisionNote ?? null }),
    });
    const body = await res.json().catch(() => undefined);
    return { status: res.status, body };
  }

  async createCliAuthChallenge(): Promise<{
    id: string;
    token: string;
    boardApiToken: string;
    approvalUrl: string;
  }> {
    return this.request("POST", "/api/cli-auth/challenges", {
      command: "possiblaw firm-overview",
      clientName: "Firm Overview",
      requestedAccess: "board",
    });
  }

  async getCliAuthChallenge(id: string, challengeToken: string): Promise<{ status: string }> {
    const params = new URLSearchParams({ token: challengeToken });
    return this.request(
      "GET",
      `/api/cli-auth/challenges/${encodeURIComponent(id)}?${params.toString()}`,
    );
  }
}
