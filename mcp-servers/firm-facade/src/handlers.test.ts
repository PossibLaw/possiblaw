// mcp-servers/firm-facade/src/handlers.test.ts
//
// Zero-network tests for firm-facade handlers — Unit C (Task 3.4 + 3.5).
// Injects a fake client and a fake receipts spy; no fetch/network I/O.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getMatterStatus,
  listWorkProducts,
  fetchWorkProduct,
  createMatter,
} from "./handlers.ts";
import type { FacadeClient, FacadeReceipts, HandlerDeps } from "./handlers.ts";
import type { FacadeReceiptInput } from "./receipts.ts";
import type { IssueRecord, WorkProductRecord } from "./paperclip-client.ts";
import { sha256hex, canonicalArgs } from "./hash.ts";

// ---------------------------------------------------------------------------
// Fake data fixtures
// ---------------------------------------------------------------------------

const FAKE_MATTER_ID = "matter-abc-123";
const FAKE_WP_ID = "wp-001";

const fakeIssue: IssueRecord = {
  id: FAKE_MATTER_ID,
  status: "open",
  workProducts: [{ id: "wp-001" }, { id: "wp-002" }],
  documentSummaries: [{ id: "ds-1" }],
  // planDocument with body simulates server returning privileged text — must never leak into receipt
  planDocument: { body: "PRIVILEGED_PLAN_TEXT_DO_NOT_LEAK" },
};

const fakeWorkProducts: WorkProductRecord[] = [
  {
    id: FAKE_WP_ID,
    type: "brief",
    title: "PRIVILEGED_BRIEF_TITLE",
    url: "https://paperclip.example/wp/001",
    status: "draft",
    reviewState: "pending",
    isPrimary: true,
  },
  {
    id: "wp-002",
    type: "memo",
    title: "PRIVILEGED_MEMO_TITLE",
    url: "https://paperclip.example/wp/002",
    status: "final",
    reviewState: "approved",
    isPrimary: false,
  },
];

// ---------------------------------------------------------------------------
// Fake receipts spy
// ---------------------------------------------------------------------------

type ReceiptSpy = FacadeReceipts & { calls: FacadeReceiptInput[] };

function makeReceiptsSpy(opts?: { throws?: boolean }): ReceiptSpy {
  const calls: FacadeReceiptInput[] = [];
  return {
    calls,
    async record(input: FacadeReceiptInput): Promise<void> {
      if (opts?.throws) throw new Error("gate proxy unreachable");
      calls.push(structuredClone(input));
    },
  };
}

// ---------------------------------------------------------------------------
// Fake client
// ---------------------------------------------------------------------------

type TestClient = FacadeClient & { createIssueCalls: unknown[] };

function makeClient(overrides?: Partial<FacadeClient>): TestClient {
  const createIssueCalls: unknown[] = [];
  return {
    createIssueCalls,
    async createIssue(body) {
      createIssueCalls.push(structuredClone(body));
      return { id: "matter-new", status: "created" };
    },
    async getIssue(_issueId: string): Promise<IssueRecord> {
      return fakeIssue;
    },
    async listWorkProducts(_issueId: string): Promise<WorkProductRecord[]> {
      return fakeWorkProducts;
    },
    async getDocument(_issueId: string, _key: string) {
      return { id: _key, body: "DOCUMENT_BODY_TEXT" };
    },
    async createApproval(_body) {
      return { id: "approval-1", status: "pending" };
    },
    ...overrides,
  };
}

function makeDeps(overrides?: { client?: Partial<FacadeClient>; throws?: boolean }): HandlerDeps & { client: TestClient; receipts: ReceiptSpy } {
  return {
    client: makeClient(overrides?.client),
    receipts: makeReceiptsSpy({ throws: overrides?.throws }),
  };
}

// ---------------------------------------------------------------------------
// Tests: getMatterStatus
// ---------------------------------------------------------------------------

describe("getMatterStatus", () => {
  it("returns matterId, status, workProductCount, documentCount", async () => {
    const deps = makeDeps();
    const result = await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);

    assert.equal(result.matterId, FAKE_MATTER_ID);
    assert.equal(result.status, "open");
    assert.equal(result.workProductCount, 2);
    assert.equal(result.documentCount, 1);
  });

  it("omits raw arrays and planDocument body from result (metadata only)", async () => {
    const deps = makeDeps();
    const result = await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);

    const serialized = JSON.stringify(result);
    assert.ok(!("workProducts" in result), "must not expose workProducts array");
    assert.ok(!("documentSummaries" in result), "must not expose documentSummaries array");
    assert.ok(!serialized.includes("PRIVILEGED_PLAN_TEXT_DO_NOT_LEAK"), "must not leak planDocument body");
  });

  it("writes exactly one get_matter_status performed receipt with matterId", async () => {
    const deps = makeDeps();
    await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "get_matter_status");
    assert.equal(r.outcome, "performed");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.match(r.payloadSha256, /^[0-9a-f]{64}$/, "payloadSha256 must be 64 lowercase hex chars");
  });

  it("receipt contains no privileged text (title / body / planDocument)", async () => {
    const deps = makeDeps();
    await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);

    const serialized = JSON.stringify(deps.receipts.calls[0]);
    assert.ok(!serialized.includes("PRIVILEGED"), "receipt must not contain any PRIVILEGED text");
  });

  it("propagates receipt error when spy throws — fail-closed", async () => {
    const deps = makeDeps({ throws: true });
    await assert.rejects(
      () => getMatterStatus({ matterId: FAKE_MATTER_ID }, deps),
      /gate proxy unreachable/,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: listWorkProducts
// ---------------------------------------------------------------------------

describe("listWorkProducts", () => {
  it("returns mapped metadata array with id/type/title/status/reviewState/isPrimary/url", async () => {
    const deps = makeDeps();
    const result = await listWorkProducts({ matterId: FAKE_MATTER_ID }, deps);

    assert.equal(result.length, 2);
    assert.equal(result[0].id, FAKE_WP_ID);
    assert.equal(result[0].type, "brief");
    assert.equal(result[0].title, "PRIVILEGED_BRIEF_TITLE");
    assert.equal(result[0].url, "https://paperclip.example/wp/001");
    assert.equal(result[0].status, "draft");
    assert.equal(result[0].reviewState, "pending");
    assert.equal(result[0].isPrimary, true);
    assert.equal(result[1].id, "wp-002");
    assert.equal(result[1].isPrimary, false);
  });

  it("writes exactly one list_work_products performed receipt with matterId", async () => {
    const deps = makeDeps();
    await listWorkProducts({ matterId: FAKE_MATTER_ID }, deps);

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "list_work_products");
    assert.equal(r.outcome, "performed");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.match(r.payloadSha256, /^[0-9a-f]{64}$/);
  });

  it("receipt does not contain work product titles or document bodies", async () => {
    const deps = makeDeps();
    await listWorkProducts({ matterId: FAKE_MATTER_ID }, deps);

    const serialized = JSON.stringify(deps.receipts.calls[0]);
    assert.ok(!serialized.includes("PRIVILEGED_BRIEF_TITLE"), "receipt must not include work product titles");
    assert.ok(!serialized.includes("PRIVILEGED_MEMO_TITLE"), "receipt must not include work product titles");
    assert.ok(!serialized.includes("DOCUMENT_BODY"), "receipt must not include document body text");
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchWorkProduct
// ---------------------------------------------------------------------------

describe("fetchWorkProduct", () => {
  it("returns metadata with textWithheld:true even when include_text:true", async () => {
    const deps = makeDeps();
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID, include_text: true },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    assert.equal(result.id, FAKE_WP_ID);
    assert.equal(result.type, "brief");
    assert.equal(result.textWithheld, true);
    assert.equal(result.note, "full text withheld — opt-in policy applies");
    assert.equal(result.link, "https://paperclip.example/wp/001");
    assert.ok(!("body" in result), "body must not be present on result");
  });

  it("returns metadata with textWithheld:true when include_text is omitted", async () => {
    const deps = makeDeps();
    const result = await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    assert.equal(result.textWithheld, true);
    assert.ok(!("body" in result), "body must not be present");
  });

  it("link uses the work product's own url (not a constructed deep link)", async () => {
    const deps = makeDeps();
    const result = await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    // Must be the raw URL from the work product record — NOT a reconstructed paperclip dashboard link
    assert.equal(result.link, "https://paperclip.example/wp/001");
  });

  it("link is null when work product has no url", async () => {
    const deps = makeDeps({
      client: {
        async listWorkProducts(_id: string) {
          return [{ id: FAKE_WP_ID, type: "brief" }]; // no url field
        },
      },
    });
    const result = await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    assert.equal(result.link, null);
  });

  it("writes exactly one fetch_work_product performed receipt with matterId + workProductId + meta:{textWithheld:true}", async () => {
    const deps = makeDeps();
    await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "fetch_work_product");
    assert.equal(r.outcome, "performed");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.equal(r.workProductId, FAKE_WP_ID);
    assert.match(r.payloadSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(r.meta, { textWithheld: true });
  });

  it("returns work_product_not_found error and writes error receipt for unknown id", async () => {
    const deps = makeDeps();
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "nonexistent-id" },
      deps,
    );

    assert.deepEqual(result, { error: "work_product_not_found" });

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "fetch_work_product");
    assert.equal(r.outcome, "error");
    assert.equal(r.workProductId, "nonexistent-id");
    assert.equal(r.matterId, FAKE_MATTER_ID);
  });

  it("receipt does not contain document body or work product title in payload", async () => {
    const deps = makeDeps();
    await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID, include_text: true },
      deps,
    );

    const serialized = JSON.stringify(deps.receipts.calls[0]);
    assert.ok(!serialized.includes("PRIVILEGED_BRIEF_TITLE"), "receipt must not include work product title");
    assert.ok(!serialized.includes("DOCUMENT_BODY_TEXT"), "receipt must not include document body");
  });
});

// ---------------------------------------------------------------------------
// Tests: createMatter
// ---------------------------------------------------------------------------

describe("createMatter", () => {
  it("calls createIssue with title, description, projectId and returns matterId + status", async () => {
    const deps = makeDeps();
    const result = await createMatter(
      { title: "Acme v. Globex", description: "Contract dispute", projectId: "proj-1" },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    assert.equal(result.matterId, "matter-new");
    assert.equal(result.status, "created");

    assert.equal(deps.client.createIssueCalls.length, 1);
    assert.deepEqual(deps.client.createIssueCalls[0], {
      title: "Acme v. Globex",
      description: "Contract dispute",
      projectId: "proj-1",
    });
  });

  it("works without description or projectId", async () => {
    const deps = makeDeps();
    const result = await createMatter({ title: "Quick Matter" }, deps);

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    assert.equal(result.matterId, "matter-new");
    assert.equal(deps.client.createIssueCalls.length, 1);
  });

  it("writes exactly one create_matter performed receipt with matterId", async () => {
    const deps = makeDeps();
    await createMatter({ title: "Test Matter" }, deps);

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "create_matter");
    assert.equal(r.outcome, "performed");
    assert.equal(r.matterId, "matter-new");
    assert.match(r.payloadSha256, /^[0-9a-f]{64}$/);
  });

  it("payloadSha256 is derived from the returned matterId (bound per-action)", async () => {
    const deps = makeDeps();
    await createMatter({ title: "Test Matter" }, deps);

    const r = deps.receipts.calls[0];
    // The fake createIssue returns id "matter-new" — the sha must hash { matterId, tool }
    // over that returned id, NOT a constant { tool }-only descriptor.
    assert.equal(
      r.payloadSha256,
      sha256hex(canonicalArgs({ matterId: "matter-new", tool: "create_matter" })),
    );
    // Sanity: it must DIFFER from the constant tool-only sha used on the error path.
    assert.notEqual(
      r.payloadSha256,
      sha256hex(canonicalArgs({ tool: "create_matter" })),
    );
  });

  it("receipt does not include title or description (privileged text)", async () => {
    const deps = makeDeps();
    await createMatter(
      { title: "SENSITIVE_TITLE_TEXT", description: "SENSITIVE_DESCRIPTION_TEXT" },
      deps,
    );

    const serialized = JSON.stringify(deps.receipts.calls[0]);
    assert.ok(!serialized.includes("SENSITIVE_TITLE_TEXT"), "receipt must not include title");
    assert.ok(!serialized.includes("SENSITIVE_DESCRIPTION_TEXT"), "receipt must not include description");
  });

  it("returns invalid_title error + error receipt for empty string, does NOT call createIssue", async () => {
    const deps = makeDeps();
    const result = await createMatter({ title: "" }, deps);

    assert.deepEqual(result, { error: "invalid_title" });
    assert.equal(deps.client.createIssueCalls.length, 0, "createIssue must not be called on validation failure");

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "create_matter");
    assert.equal(r.outcome, "error");
  });

  it("returns invalid_title error + error receipt for whitespace-only title, does NOT call createIssue", async () => {
    const deps = makeDeps();
    const result = await createMatter({ title: "   " }, deps);

    assert.deepEqual(result, { error: "invalid_title" });
    assert.equal(deps.client.createIssueCalls.length, 0, "createIssue must not be called on validation failure");

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "create_matter");
    assert.equal(r.outcome, "error");
    // No matterId exists on the validation-error path — sha is over { tool } only.
    assert.equal(r.matterId, undefined);
    assert.equal(r.payloadSha256, sha256hex(canonicalArgs({ tool: "create_matter" })));
  });

  it("propagates receipt error when spy throws after successful create — fail-closed", async () => {
    // The create succeeds, but the receipt write fails. Must propagate, not silently return.
    const client = makeClient();
    const receipts = makeReceiptsSpy({ throws: true });
    const deps: HandlerDeps = { client, receipts };

    await assert.rejects(
      () => createMatter({ title: "Auditable Matter" }, deps),
      /gate proxy unreachable/,
    );
    // createIssue WAS called (the issue was created before the receipt write attempt)
    assert.equal(client.createIssueCalls.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting: no privileged text in ANY receipt across all handlers
// ---------------------------------------------------------------------------

describe("no privileged text in any receipt — cross-cutting", () => {
  it("getMatterStatus receipt: only ids + flags, no titles/bodies", async () => {
    const deps = makeDeps();
    await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);

    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(!serialized.includes("PRIVILEGED"), "no privileged text in getMatterStatus receipt");
    assert.ok(!serialized.includes("SENSITIVE"), "no sensitive text in getMatterStatus receipt");
  });

  it("listWorkProducts receipt: only ids + flags, no work product titles", async () => {
    const deps = makeDeps();
    await listWorkProducts({ matterId: FAKE_MATTER_ID }, deps);

    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(!serialized.includes("PRIVILEGED_BRIEF_TITLE"), "no work product titles in listWorkProducts receipt");
    assert.ok(!serialized.includes("PRIVILEGED_MEMO_TITLE"), "no work product titles in listWorkProducts receipt");
  });

  it("fetchWorkProduct receipt: only ids + {textWithheld} flag, no document body or title in payload", async () => {
    const deps = makeDeps();
    await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID, include_text: true },
      deps,
    );

    const r = deps.receipts.calls[0];
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes("PRIVILEGED_BRIEF_TITLE"), "no work product title in fetchWorkProduct receipt");
    assert.ok(!serialized.includes("DOCUMENT_BODY_TEXT"), "no document body in fetchWorkProduct receipt");
    // meta must be only { textWithheld: true }
    assert.deepEqual(r.meta, { textWithheld: true });
  });

  it("createMatter receipt: only ids + flags, no title or description", async () => {
    const deps = makeDeps();
    await createMatter(
      { title: "PRIVILEGED_MATTER_TITLE", description: "PRIVILEGED_MATTER_DESCRIPTION" },
      deps,
    );

    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(!serialized.includes("PRIVILEGED_MATTER_TITLE"), "no title in createMatter receipt");
    assert.ok(!serialized.includes("PRIVILEGED_MATTER_DESCRIPTION"), "no description in createMatter receipt");
  });
});
