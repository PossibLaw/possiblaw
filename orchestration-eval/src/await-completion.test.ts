import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitIssueClosed, extractDeliverable } from "./await-completion.ts";

function clientWithStatuses(statuses: string[]) {
  let i = 0;
  return {
    async getIssue() { return { id: "iss", status: statuses[Math.min(i++, statuses.length - 1)] }; },
    async listWorkProducts() { return [{ id: "wp1", isPrimary: true, metadata: { documentKey: "memo" } }]; },
    async getDocument(_id: string, key: string) { return { id: key, body: `BODY:${key}` }; },
  } as any;
}

test("awaitIssueClosed resolves when status reaches done", async () => {
  const client = clientWithStatuses(["in_progress", "in_progress", "done"]);
  const r = await awaitIssueClosed(client, "iss", { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} });
  assert.equal(r.status, "done");
  assert.equal(r.timedOut, false);
});

test("awaitIssueClosed reports timeout without throwing", async () => {
  const client = clientWithStatuses(["in_progress"]);
  let t = 0;
  const r = await awaitIssueClosed(client, "iss", { intervalMs: 10, timeoutMs: 25, now: () => (t += 10), sleep: async () => {} });
  assert.equal(r.timedOut, true);
});

test("extractDeliverable reads the primary work product's document", async () => {
  const client = clientWithStatuses(["done"]);
  const r = await extractDeliverable(client, "iss");
  assert.equal(r.text, "BODY:memo");
  assert.equal(r.source, "work-product");
});

test("1.3: failureReasonFor — done is judgeable, cancelled and timeout are failures", async () => {
  const { failureReasonFor } = await import("./await-completion.ts");
  assert.equal(failureReasonFor({ status: "done", timedOut: false }), null);
  assert.equal(failureReasonFor({ status: "cancelled", timedOut: false }), "cancelled");
  assert.equal(failureReasonFor({ status: "in_progress", timedOut: true }), "timed_out");
});

test("1.3: awaitIssueClosed still stops polling on cancelled (terminal for polling, failed for scoring)", async () => {
  const client = clientWithStatuses(["in_progress", "cancelled"]);
  const r = await awaitIssueClosed(client, "iss", { intervalMs: 0, timeoutMs: 1000, sleep: async () => {} });
  assert.equal(r.status, "cancelled");
  assert.equal(r.timedOut, false);
});
