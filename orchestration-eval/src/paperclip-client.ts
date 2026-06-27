// orchestration-eval/src/paperclip-client.ts
// Mirrors mcp-servers/firm-facade/src/paperclip-client.ts; adds putDocument,
// listAgents, budgets, and per-issue cost readback. Bearer-authed, company-scoped.
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
    const res = await this.fetchImpl(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.cfg.apiKey}`, "content-type": "application/json" },
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
    return this.req("PUT", `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`, { body }).then(() => undefined);
  }
  getIssue(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}`) as Promise<{ id: string; status: string; workProducts?: unknown[] }>;
  }
  listWorkProducts(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/work-products`) as Promise<Array<{ id: string; type?: string; title?: string; isPrimary?: boolean; metadata?: Record<string, unknown> }>>;
  }
  getDocument(issueId: string, key: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/documents/${encodeURIComponent(key)}`) as Promise<{ id: string; body?: string }>;
  }
  listAgents() {
    return this.req("GET", `/api/companies/${this.cfg.companyId}/agents`) as Promise<Array<{ id: string; slug?: string; name?: string }>>;
  }
  patchCompanyBudget(cents: number): Promise<void> {
    return this.req("PATCH", `/api/companies/${this.cfg.companyId}/budgets`, { budgetMonthlyCents: cents }).then(() => undefined);
  }
  patchAgentBudget(agentId: string, cents: number): Promise<void> {
    return this.req("PATCH", `/api/agents/${encodeURIComponent(agentId)}/budgets`, { budgetMonthlyCents: cents }).then(() => undefined);
  }
  getIssueCostSummary(issueId: string) {
    return this.req("GET", `/api/issues/${encodeURIComponent(issueId)}/cost-summary`) as Promise<{ totalCents?: number; [k: string]: unknown }>;
  }
}
