// orchestration-eval/src/await-completion.ts
import type { PaperclipEvalClient } from "./paperclip-client.ts";

export const CLOSED_STATUSES = ["done", "cancelled"] as const;

interface AwaitOpts { intervalMs?: number; timeoutMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void>; }

export async function awaitIssueClosed(
  client: Pick<PaperclipEvalClient, "getIssue">, issueId: string, opts: AwaitOpts = {},
): Promise<{ status: string; timedOut: boolean }> {
  const intervalMs = opts.intervalMs ?? 5000;
  const timeoutMs = opts.timeoutMs ?? 30 * 60 * 1000;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const start = now();
  for (;;) {
    const issue = await client.getIssue(issueId);
    if ((CLOSED_STATUSES as readonly string[]).includes(issue.status)) return { status: issue.status, timedOut: false };
    if (now() - start >= timeoutMs) return { status: issue.status, timedOut: true };
    await sleep(intervalMs);
  }
}

export async function extractDeliverable(
  client: Pick<PaperclipEvalClient, "listWorkProducts" | "getDocument" | "getIssue">, issueId: string,
): Promise<{ text: string; source: "work-product" | "document" | "none" }> {
  const wps = await client.listWorkProducts(issueId).catch(() => []);
  const primary = wps.find(w => w.isPrimary) ?? wps[0];
  const key = (primary?.metadata?.["documentKey"] as string | undefined) ?? undefined;
  if (key) {
    const doc = await client.getDocument(issueId, key).catch(() => ({ body: undefined }));
    if (doc.body) return { text: doc.body, source: "work-product" };
  }
  // Fallback: any document summary on the issue.
  const issue: any = await client.getIssue(issueId).catch(() => ({}));
  const firstKey = issue?.documentPayload?.[0]?.key ?? issue?.documentSummaries?.[0]?.key;
  if (firstKey) {
    const doc = await client.getDocument(issueId, firstKey).catch(() => ({ body: undefined }));
    if (doc.body) return { text: doc.body, source: "document" };
  }
  return { text: "", source: "none" };
}
