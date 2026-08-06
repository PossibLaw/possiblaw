// orchestration-eval/src/paperclip-client.ts
// Mirrors mcp-servers/firm-facade/src/paperclip-client.ts; adds putDocument,
// listAgents, budgets, per-issue cost readback, and child-issue listing. Bearer-authed, company-scoped.
export interface EvalClientConfig {
  baseUrl: string; companyId: string; apiKey: string; fetchImpl?: typeof fetch;
}
export class EvalApiError extends Error {
  constructor(public status: number, public urlPath: string) {
    super(`paperclip ${status} at ${urlPath}`); // never include the token
  }
}
export class PaperclipEvalClient {
  private fetchImpl: typeof fetch;
  constructor(private cfg: EvalClientConfig) { this.fetchImpl = cfg.fetchImpl ?? fetch; }

  private async req(method: string, path: string, body?: unknown): Promise<any> {
    // Empty apiKey = local_trusted board actor (credential-less loopback).
    // The eval must not authenticate as a working agent: agent keys are
    // session-scoped to that agent's live run boundary on the current pin,
    // which breaks a shared-identity harness racing its own Arm B agent.
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.cfg.apiKey) headers.Authorization = `Bearer ${this.cfg.apiKey}`;
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new EvalApiError(res.status, path);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  createIssue(body: { title: string; description?: string; assigneeAgentId?: string; requestDepth?: number }) {
    return this.req("POST", `/api/companies/${this.cfg.companyId}/issues`, body) as Promise<{ id: string; status: string }>;
  }
  putDocument(issueId: string, key: string, body: string): Promise<void> {
    // The 24aa2f51 pin's documents route validates keys as [a-z0-9_-] and
    // requires format:"markdown" — normalize here so every caller is safe.
    const safeKey = key.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    return this.req("PUT", `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(safeKey)}`, { body, format: "markdown" }).then(() => undefined);
  }
  /** Assign after furnishing: the 24aa2f51 pin scopes an assigned issue to
   * its agent's authorization boundary, so document setup must precede
   * assignment. The PATCH must ALSO move status to "todo" — the assignment
   * wake is skipped while status is "backlog" (routes/issues.ts:412), which
   * is the default for unassigned-created issues. */
  patchIssueAssignee(issueId: string, agentId: string): Promise<void> {
    return this.req("PATCH", `/api/issues/${encodeURIComponent(issueId)}`, { assigneeAgentId: agentId, status: "todo" }).then(() => undefined);
  }
  getIssue(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}`) as Promise<{ id: string; status: string; workProducts?: unknown[] }>;
  }
  /** Cancel-on-timeout hygiene: an abandoned matter keeps its agents working
   * (and consuming the plan) unless explicitly cancelled. */
  cancelIssue(issueId: string): Promise<void> {
    return this.req("PATCH", `/api/issues/${encodeURIComponent(issueId)}`, { status: "cancelled" }).then(() => undefined);
  }
  listWorkProducts(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/work-products`) as Promise<Array<{ id: string; type?: string; title?: string; isPrimary?: boolean; metadata?: Record<string, unknown> }>>;
  }
  getDocument(issueId: string, key: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`) as Promise<{ id: string; body?: string }>;
  }
  /** Agent rows carry no `slug` field. paperclip serializes `urlKey = normalizeAgentUrlKey(name)`
   * (paperclip/server/src/services/agents.ts withUrlKey), which for imported package agents
   * equals the package slug — see agent-resolver.ts for the resolution strategy. */
  listAgents() {
    return this.req("GET", `/api/companies/${this.cfg.companyId}/agents`) as Promise<Array<{ id: string; name?: string; urlKey?: string }>>;
  }
  patchCompanyBudget(cents: number): Promise<void> {
    return this.req("PATCH", `/api/companies/${this.cfg.companyId}/budgets`, { budgetMonthlyCents: cents }).then(() => undefined);
  }
  patchAgentBudget(agentId: string, cents: number): Promise<void> {
    return this.req("PATCH", `/api/agents/${encodeURIComponent(agentId)}/budgets`, { budgetMonthlyCents: cents }).then(() => undefined);
  }
  /** Subtree cost rollup. The route returns `costCents`
   * (paperclip/server/src/services/costs.ts issueTreeSummary via
   * GET /api/issues/:id/cost-summary); `totalCents` retained only as a legacy fallback key. */
  getIssueCostSummary(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/cost-summary`) as Promise<{ costCents?: number; totalCents?: number; [k: string]: unknown }>;
  }
  /** List child issues of a parent issue. Used to measure decomposition on both arms.
   * Calls GET /api/companies/:companyId/issues?parentId=<id> (fail-soft);
   * issue rows include `assigneeAgentId`. */
  listChildIssues(parentIssueId: string): Promise<Array<{ id: string; assigneeAgentId?: string | null }>> {
    return this.req("GET", `/api/companies/${this.cfg.companyId}/issues?parentId=${encodeURIComponent(parentIssueId)}`) as Promise<Array<{ id: string; assigneeAgentId?: string | null }>>;
  }
}
