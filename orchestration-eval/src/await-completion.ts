// orchestration-eval/src/await-completion.ts
import type { PaperclipEvalClient } from "./paperclip-client.ts";

// `cancelled` is terminal for POLLING (we must stop waiting), but it is a
// FAILED outcome for SCORING — see failureReasonFor below.
export const CLOSED_STATUSES = ["done", "cancelled"] as const;

/** Task 1.3: a root issue that ends `cancelled`, or a run that hit the await
 * timeout, is scored as FAILED for that run. It is NOT judged on whatever
 * partial deliverable exists and is NOT skipped — it counts against the
 * arm's all-pass rate. Returns null for a normally-closed (`done`) run. */
export function failureReasonFor(closed: { status: string; timedOut: boolean }): "timed_out" | "cancelled" | null {
  if (closed.timedOut) return "timed_out";
  if (closed.status === "cancelled") return "cancelled";
  return null;
}

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
