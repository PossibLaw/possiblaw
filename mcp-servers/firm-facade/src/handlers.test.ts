// mcp-servers/firm-facade/src/handlers.test.ts
//
// Zero-network tests for firm-facade handlers — Units C + D (Tasks 3.4–3.7).
// Injects a fake client and a fake receipts spy; no fetch/network I/O.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getMatterStatus,
  listWorkProducts,
  fetchWorkProduct,
  createMatter,
  requestApproval,
} from "./handlers.ts";
import type { FacadeClient, FacadeReceipts, HandlerDeps } from "./handlers.ts";
import type { FacadeReceiptInput } from "./receipts.ts";
import type { IssueRecord, WorkProductRecord } from "./paperclip-client.ts";
import { sha256hex, canonicalArgs } from "./hash.ts";

// Static-invariant imports (no runtime behavior — just imported for enumeration)
import { FACADE_TOOLS } from "./catalog.ts";
import { FirmFacadeClient } from "./paperclip-client.ts";

// ---------------------------------------------------------------------------
// Fake data fixtures
// ---------------------------------------------------------------------------

const FAKE_MATTER_ID = "matter-abc-123";
const FAKE_WP_ID = "wp-001";
// Follow-up #3: company id used by deps and matching fakeIssue — so existing tests pass the scope check.
const FAKE_COMPANY_ID = "company-abc-456";

const fakeIssue: IssueRecord = {
  id: FAKE_MATTER_ID,
  status: "open",
  companyId: FAKE_COMPANY_ID,   // Follow-up #3: required for cross-company read isolation check
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
    // No externalId/metadata → no docKey → cannot disclose full text
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

/** Work product WITH a docKey via externalId — used in Unit D full-text tests. */
const fakeDocWorkProduct: WorkProductRecord = {
  id: "wp-doc-001",
  type: "document",
  title: "PRIVILEGED_DOC_TITLE",
  externalId: "doc-key-abc",
  status: "draft",
  reviewState: "pending",
  isPrimary: true,
};

/** Work product with docKey in metadata.documentKey only. */
const fakeDocMetaWorkProduct: WorkProductRecord = {
  id: "wp-doc-002",
  type: "document",
  metadata: { documentKey: "doc-key-from-meta" },
  status: "draft",
};

/** Work product WITHOUT any docKey — e.g. a PR url, no document body. */
const fakeNonDocWorkProduct: WorkProductRecord = {
  id: "wp-pr-001",
  type: "pull_request",
  url: "https://github.com/example/repo/pull/42",
  status: "open",
};

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

type TestClient = FacadeClient & {
  createIssueCalls: unknown[];
  createApprovalCalls: unknown[];
  getDocumentCalls: Array<{ issueId: string; key: string }>;
};

function makeClient(overrides?: Partial<FacadeClient>): TestClient {
  const createIssueCalls: unknown[] = [];
  const createApprovalCalls: unknown[] = [];
  const getDocumentCalls: Array<{ issueId: string; key: string }> = [];
  return {
    createIssueCalls,
    createApprovalCalls,
    getDocumentCalls,
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
    async getDocument(issueId: string, key: string) {
      getDocumentCalls.push({ issueId, key });
      return { id: key, body: "DOCUMENT_BODY_TEXT" };
    },
    async createApproval(body) {
      createApprovalCalls.push(structuredClone(body));
      return { id: "approval-1", status: "pending" };
    },
    ...overrides,
  };
}

function makeDeps(overrides?: {
  client?: Partial<FacadeClient>;
  throws?: boolean;
  policy?: { allowWorkProductText: boolean };
  publicBaseUrl?: string;
  companyPrefix?: string;
  companyId?: string;
}): HandlerDeps & { client: TestClient; receipts: ReceiptSpy } {
  return {
    client: makeClient(overrides?.client),
    receipts: makeReceiptsSpy({ throws: overrides?.throws }),
    policy: overrides?.policy,
    publicBaseUrl: overrides?.publicBaseUrl,
    companyPrefix: overrides?.companyPrefix,
    // Follow-up #3: include companyId by default so the scope check is exercised.
    // fakeIssue.companyId === FAKE_COMPANY_ID, so existing tests pass.
    companyId: overrides?.companyId !== undefined ? overrides.companyId : FAKE_COMPANY_ID,
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
  it("returns metadata with textWithheld:true when policy absent and include_text:true", async () => {
    // No policy in deps → treat as {allowWorkProductText:false} (fail-closed)
    const deps = makeDeps();
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID, include_text: true },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    // Narrow to withhold variant
    if (!("textWithheld" in result)) assert.fail("expected textWithheld result, not full-text disclosure");

    assert.equal(result.id, FAKE_WP_ID);
    assert.equal(result.type, "brief");
    assert.equal(result.textWithheld, true);
    // Note must mention the policy flag (policy was absent/off but include_text was true)
    assert.ok(
      typeof result.note === "string" && result.note.includes("enable firmFacade.allowWorkProductText"),
      `note should mention policy flag, got: ${result.note}`,
    );
    assert.equal(result.link, "https://paperclip.example/wp/001");
    assert.ok(!("body" in result), "body must not be present on result");
    assert.ok(!("text" in result), "text must not be present when policy off");
  });

  it("returns metadata with textWithheld:true when include_text is omitted", async () => {
    const deps = makeDeps();
    const result = await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);

    if ("error" in result) assert.fail(`expected no error, got: ${result.error}`);
    if (!("textWithheld" in result)) assert.fail("expected textWithheld result");
    assert.equal(result.textWithheld, true);
    assert.ok(!("body" in result), "body must not be present");
    assert.ok(!("text" in result), "text must not be present when include_text omitted");
    // No note when include_text was not requested
    assert.equal(result.note, undefined, "note must be absent when include_text not true");
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

  it("writes exactly one fetch_work_product performed receipt with matterId + workProductId + meta:{textDisclosed:false}", async () => {
    const deps = makeDeps();
    await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "fetch_work_product");
    assert.equal(r.outcome, "performed");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.equal(r.workProductId, FAKE_WP_ID);
    assert.match(r.payloadSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(r.meta, { textDisclosed: false });
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
// Tests: requestApproval (Unit D, Task 3.6)
// ---------------------------------------------------------------------------

describe("requestApproval", () => {
  it("rejects a cross-company matter before creating an approval", async () => {
    const deps = makeDeps({
      client: {
        async getIssue(_id: string): Promise<IssueRecord> {
          return { ...fakeIssue, companyId: "company-foreign-999" };
        },
      },
    });

    await assert.rejects(
      () => requestApproval(
        { matterId: FAKE_MATTER_ID, action: "file_motion", summary: "File motion" },
        deps,
      ),
      /company_scope_violation/,
    );
    assert.equal(deps.client.createApprovalCalls.length, 0);
    assert.equal(deps.receipts.calls.length, 1);
    assert.equal(deps.receipts.calls[0].outcome, "error");
    assert.deepEqual(deps.receipts.calls[0].meta, { reason: "company_scope_violation" });
  });

  it("calls createApproval with type:'request_board_approval', issueIds:[matterId], payload carrying action+summary", async () => {
    const deps = makeDeps({
      publicBaseUrl: "https://app.possiblaw.io",
      companyPrefix: "acme-law",
    });
    await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "file_motion", summary: "File motion to dismiss" },
      deps,
    );

    assert.equal(deps.client.createApprovalCalls.length, 1);
    const callBody = deps.client.createApprovalCalls[0] as Record<string, unknown>;
    assert.equal(callBody["type"], "request_board_approval");
    assert.deepEqual(callBody["issueIds"], [FAKE_MATTER_ID]);
    const payload = callBody["payload"] as Record<string, unknown>;
    assert.equal(payload["action"], "file_motion");
    assert.equal(payload["summary"], "File motion to dismiss");
    assert.equal(payload["matterId"], FAKE_MATTER_ID);
    assert.equal(payload["source"], "firm-facade");
  });

  it("returns status:'pending_approval', approvalId, and constructed deepLink when config present", async () => {
    const deps = makeDeps({
      publicBaseUrl: "https://app.possiblaw.io",
      companyPrefix: "acme-law",
    });
    const result = await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "file_motion", summary: "Motion to dismiss" },
      deps,
    );

    assert.equal(result.status, "pending_approval");
    assert.equal(result.approvalId, "approval-1");
    assert.equal(
      result.deepLink,
      "https://app.possiblaw.io/acme-law/approvals/approval-1",
    );
    assert.equal(result.note, undefined, "note must be absent when deepLink is present");
  });

  it("returns deepLink:null and fallback note when publicBaseUrl/companyPrefix absent", async () => {
    const deps = makeDeps(); // no publicBaseUrl or companyPrefix
    const result = await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "send_letter", summary: "Demand letter" },
      deps,
    );

    assert.equal(result.status, "pending_approval");
    assert.equal(result.approvalId, "approval-1");
    assert.equal(result.deepLink, null);
    assert.ok(
      typeof result.note === "string" && result.note.length > 0,
      "note must be present when deepLink is null",
    );
    assert.ok(
      result.note!.includes("PAPERCLIP_PUBLIC_URL"),
      `note should mention PAPERCLIP_PUBLIC_URL, got: ${result.note}`,
    );
  });

  it("writes exactly one 'pending' receipt with approvalId + matterId; NO action/summary text in receipt", async () => {
    const deps = makeDeps({
      publicBaseUrl: "https://app.possiblaw.io",
      companyPrefix: "acme-law",
    });
    await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "SENSITIVE_ACTION", summary: "SENSITIVE_SUMMARY_TEXT" },
      deps,
    );

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "request_approval");
    assert.equal(r.outcome, "pending");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.equal(r.approvalId, "approval-1");
    assert.match(r.payloadSha256, /^[0-9a-f]{64}$/);

    // CRITICAL: no action or summary text must appear in the receipt
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes("SENSITIVE_ACTION"), "action must not appear in receipt");
    assert.ok(!serialized.includes("SENSITIVE_SUMMARY_TEXT"), "summary must not appear in receipt");
  });

  it("payloadSha256 is sha256(canonicalArgs({tool,matterId,approvalId})) — no action/summary", async () => {
    const deps = makeDeps();
    await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "act", summary: "sum" },
      deps,
    );

    const r = deps.receipts.calls[0];
    const expectedSha = sha256hex(
      canonicalArgs({ tool: "request_approval", matterId: FAKE_MATTER_ID, approvalId: "approval-1" }),
    );
    assert.equal(r.payloadSha256, expectedSha);
  });
});

// ---------------------------------------------------------------------------
// Tests: human-only invariant (static — load-bearing security property #1)
// ---------------------------------------------------------------------------

describe("human-only approval invariant (static)", () => {
  it("FACADE_TOOLS catalog has no approve/decide/reject tool", () => {
    // Check that no tool NAME starts with an approve/reject/decide verb.
    // "request_approval" is intentionally allowed — it REQUESTS a human to approve;
    // it does not itself approve. The regex is anchored to start-of-name to match
    // the same convention as paperclip-client.test.ts (no ^approve-starting tool).
    const names = FACADE_TOOLS.map((t) => t.name);
    for (const name of names) {
      assert.ok(
        !/^(approv|reject|decide)/i.test(name),
        `catalog MUST NOT contain an approve/reject/decide tool (name must not start with those verbs) — found: "${name}"`,
      );
    }
  });

  it("FirmFacadeClient prototype exposes no approve/reject/decide/request-revision method", () => {
    const proto = FirmFacadeClient.prototype;
    const methods = Object.getOwnPropertyNames(proto);
    for (const m of methods) {
      assert.ok(
        !/^(approv|reject|decide)|request.?revision/i.test(m),
        `FirmFacadeClient MUST NOT have an approve/reject/decide method — found: "${m}"`,
      );
    }
  });

  it("requestApproval always returns status 'pending_approval' — never approves or rejects", async () => {
    const deps = makeDeps();
    const result = await requestApproval(
      { matterId: "m-test", action: "act", summary: "summary" },
      deps,
    );
    assert.equal(result.status, "pending_approval", "status MUST always be pending_approval");
    assert.ok(!("approved" in result), "result MUST NOT contain an 'approved' field");
    assert.ok(!("rejected" in result), "result MUST NOT contain a 'rejected' field");
    assert.ok(!("decided" in result), "result MUST NOT contain a 'decided' field");
  });

  it("handlers module exports no approve/reject/decide function", async () => {
    // Check that no exported function NAME starts with an approve/reject/decide verb.
    // "requestApproval" is intentionally allowed — it submits a request; it does not
    // approve. Anchored to start-of-name to avoid false-positives on "request*" names.
    const mod = await import("./handlers.ts");
    const exports = Object.keys(mod);
    for (const name of exports) {
      assert.ok(
        !/^(approv|reject|decide)/i.test(name),
        `handlers module MUST NOT export an approve/reject/decide function (name must not start with those verbs) — found: "${name}"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchWorkProduct full-text opt-in (Unit D, Task 3.7 — risk #2)
// ---------------------------------------------------------------------------

describe("fetchWorkProduct full-text opt-in (Unit D)", () => {
  it("EDGE: policy OFF, include_text:true → withheld, getDocument NOT called, policy-off note returned", async () => {
    // No policy → treat as {allowWorkProductText:false}
    const deps = makeDeps({
      client: {
        async listWorkProducts(_id: string) {
          return [fakeDocWorkProduct];
        },
      },
    });
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-001", include_text: true },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error: ${result.error}`);
    if (!("textWithheld" in result)) assert.fail("expected withhold, not full-text disclosure");
    assert.equal(result.textWithheld, true);
    assert.ok(!("text" in result), "text must not be present when policy off");
    assert.ok(
      typeof result.note === "string" && result.note.includes("enable firmFacade.allowWorkProductText"),
      `note must reference the policy flag; got: ${result.note}`,
    );
    // getDocument MUST NOT be called when policy is off
    assert.equal(deps.client.getDocumentCalls.length, 0, "getDocument must NOT be called when policy off");
    // Receipt: textDisclosed:false
    assert.equal(deps.receipts.calls.length, 1);
    assert.deepEqual(deps.receipts.calls[0].meta, { textDisclosed: false });
  });

  it("policy ON + include_text:true + externalId docKey → getDocument called, text returned, textDisclosed receipt", async () => {
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeDocWorkProduct]; // has externalId: "doc-key-abc"
        },
      },
    });
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-001", include_text: true },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error: ${result.error}`);
    if (!("textDisclosed" in result)) assert.fail("expected full-text disclosure result");
    assert.equal(result.textDisclosed, true);
    assert.ok("text" in result, "text must be present when policy on and docKey present");
    assert.equal((result as { text?: string }).text, "DOCUMENT_BODY_TEXT");
    assert.ok(!("textWithheld" in result), "textWithheld must not be present on full-text result");

    // getDocument must be called exactly once with the correct docKey
    assert.equal(deps.client.getDocumentCalls.length, 1);
    assert.equal(deps.client.getDocumentCalls[0].issueId, FAKE_MATTER_ID);
    assert.equal(deps.client.getDocumentCalls[0].key, "doc-key-abc");

    // Receipt: textDisclosed:true, workProductId in meta
    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.outcome, "performed");
    assert.deepEqual(r.meta, { textDisclosed: true, workProductId: "wp-doc-001" });
  });

  it("policy ON + include_text:true + metadata.documentKey → docKey resolved from metadata", async () => {
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeDocMetaWorkProduct]; // has metadata.documentKey
        },
      },
    });
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-002", include_text: true },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error: ${result.error}`);
    if (!("textDisclosed" in result)) assert.fail("expected full-text disclosure");
    assert.equal(result.textDisclosed, true);
    assert.equal(deps.client.getDocumentCalls.length, 1);
    assert.equal(deps.client.getDocumentCalls[0].key, "doc-key-from-meta");
  });

  it("policy ON + include_text:false → withheld, getDocument NOT called, no note", async () => {
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeDocWorkProduct];
        },
      },
    });
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-001", include_text: false },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error: ${result.error}`);
    if (!("textWithheld" in result)) assert.fail("expected withhold when include_text:false");
    assert.equal(result.textWithheld, true);
    assert.ok(!("text" in result), "text must not be present when include_text:false");
    assert.equal(result.note, undefined, "note must be absent when include_text:false");
    assert.equal(deps.client.getDocumentCalls.length, 0, "getDocument must NOT be called when include_text:false");
    // Receipt: textDisclosed:false
    assert.deepEqual(deps.receipts.calls[0].meta, { textDisclosed: false });
  });

  it("policy ON + include_text:true + NO docKey → withheld + 'no linked document' note", async () => {
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeNonDocWorkProduct]; // pull_request — no externalId/metadata.documentKey
        },
      },
    });
    const result = await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-pr-001", include_text: true },
      deps,
    );

    if ("error" in result) assert.fail(`expected no error: ${result.error}`);
    if (!("textWithheld" in result)) assert.fail("expected withhold when no docKey");
    assert.equal(result.textWithheld, true);
    assert.ok(!("text" in result), "text must not be present when no docKey");
    assert.ok(
      typeof result.note === "string" && result.note.includes("no linked document"),
      `note must mention 'no linked document'; got: ${result.note}`,
    );
    assert.equal(deps.client.getDocumentCalls.length, 0, "getDocument must NOT be called when no docKey");
    // Receipt: textDisclosed:false with reason
    assert.deepEqual(
      deps.receipts.calls[0].meta,
      { textDisclosed: false, reason: "no_linked_document" },
    );
  });

  it("SECURITY: no document body text ever appears in any receipt — full-text disclosed path", async () => {
    // Policy on + docKey → text IS returned to caller; body must NOT appear in receipt
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeDocWorkProduct];
        },
        async getDocument(_issueId: string, _key: string) {
          return { id: _key, body: "SECRET_PRIVILEGED_DOCUMENT_BODY_XYZ" };
        },
      },
    });
    await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-001", include_text: true },
      deps,
    );

    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(
      !serialized.includes("SECRET_PRIVILEGED_DOCUMENT_BODY_XYZ"),
      "document body MUST NEVER appear in any receipt — security invariant violated",
    );
  });

  it("SECURITY: no document body text in receipt on no-docKey path", async () => {
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeNonDocWorkProduct];
        },
      },
    });
    await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-pr-001", include_text: true },
      deps,
    );

    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(!serialized.includes("DOCUMENT_BODY"), "no document body in receipt on no-docKey path");
  });

  it("getDocument throws → exactly ONE error receipt, no text returned, error propagates (fail-closed audit)", async () => {
    const deps = makeDeps({
      policy: { allowWorkProductText: true },
      client: {
        async listWorkProducts(_id: string) {
          return [fakeDocWorkProduct]; // resolvable docKey → dual gate satisfied
        },
        async getDocument(_issueId: string, _key: string): Promise<never> {
          throw new Error("document fetch boom");
        },
      },
    });

    await assert.rejects(
      () =>
        fetchWorkProduct(
          { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-001", include_text: true },
          deps,
        ),
      /document fetch boom/,
    );

    // Exactly ONE receipt — the error receipt — even though getDocument threw.
    assert.equal(deps.receipts.calls.length, 1, "must write exactly one receipt on getDocument failure");
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "fetch_work_product");
    assert.equal(r.outcome, "error");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.equal(r.workProductId, "wp-doc-001");
    assert.deepEqual(r.meta, {
      textDisclosed: false,
      reason: "document_fetch_failed",
      workProductId: "wp-doc-001",
    });
    // No document body text in the error receipt
    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(!serialized.includes("DOCUMENT_BODY"), "no document body in error receipt");
  });
});

// ---------------------------------------------------------------------------
// getDocument reachability guard (Fix 1): fetchWorkProduct is the ONLY handler
// that may call client.getDocument. Guards against a future handler calling it
// ungated (bypassing the include_text + policy dual gate).
// ---------------------------------------------------------------------------

describe("getDocument reachability guard", () => {
  it("getMatterStatus / listWorkProducts / createMatter / requestApproval NEVER call getDocument; fetchWorkProduct (dual gate) calls it exactly once", async () => {
    // Shared spy client across all handlers so getDocument call-count is cumulative.
    const getDocumentCalls: Array<{ issueId: string; key: string }> = [];
    const sharedClient = makeClient({
      async listWorkProducts(_id: string) {
        return [fakeDocWorkProduct]; // resolvable docKey for the fetch path
      },
      async getDocument(issueId: string, key: string) {
        getDocumentCalls.push({ issueId, key });
        return { id: key, body: "DOCUMENT_BODY_TEXT" };
      },
    });
    const receipts = makeReceiptsSpy();
    const deps: HandlerDeps = {
      client: sharedClient,
      receipts,
      policy: { allowWorkProductText: true },
      publicBaseUrl: "https://app.possiblaw.io",
      companyPrefix: "acme-law",
    };

    // Happy paths for every NON-fetch handler — none may touch getDocument.
    await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);
    await listWorkProducts({ matterId: FAKE_MATTER_ID }, deps);
    await createMatter({ title: "Reachability Matter" }, deps);
    await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "act", summary: "summary" },
      deps,
    );

    assert.equal(
      getDocumentCalls.length,
      0,
      "getDocument MUST NOT be called by getMatterStatus/listWorkProducts/createMatter/requestApproval",
    );

    // fetchWorkProduct under the full dual gate (policy on + include_text:true + docKey) → exactly one call.
    await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: "wp-doc-001", include_text: true },
      deps,
    );

    assert.equal(
      getDocumentCalls.length,
      1,
      "fetchWorkProduct under the dual gate must call getDocument exactly once",
    );
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

  it("fetchWorkProduct receipt: only ids + {textDisclosed:false} flag, no document body or title in payload", async () => {
    const deps = makeDeps();
    await fetchWorkProduct(
      { matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID, include_text: true },
      deps,
    );

    const r = deps.receipts.calls[0];
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes("PRIVILEGED_BRIEF_TITLE"), "no work product title in fetchWorkProduct receipt");
    assert.ok(!serialized.includes("DOCUMENT_BODY_TEXT"), "no document body in fetchWorkProduct receipt");
    // meta must be only { textDisclosed: false } — policy was off, so no text was released
    assert.deepEqual(r.meta, { textDisclosed: false });
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

  it("requestApproval receipt: no action or summary text in receipt", async () => {
    const deps = makeDeps();
    await requestApproval(
      { matterId: FAKE_MATTER_ID, action: "PRIVILEGED_ACTION_TEXT", summary: "PRIVILEGED_SUMMARY_TEXT" },
      deps,
    );

    const serialized = JSON.stringify(deps.receipts.calls);
    assert.ok(!serialized.includes("PRIVILEGED_ACTION_TEXT"), "no action text in requestApproval receipt");
    assert.ok(!serialized.includes("PRIVILEGED_SUMMARY_TEXT"), "no summary text in requestApproval receipt");
  });
});

// ---------------------------------------------------------------------------
// Follow-up #3 — defense-in-depth cross-company read isolation
// ---------------------------------------------------------------------------

describe("cross-company read isolation (defense-in-depth)", () => {
  const FOREIGN_COMPANY_ID = "company-foreign-999";

  // An issue that belongs to a DIFFERENT company than deps.companyId
  const foreignIssue: IssueRecord = {
    id: FAKE_MATTER_ID,
    status: "open",
    companyId: FOREIGN_COMPANY_ID,
    workProducts: [],
    documentSummaries: [],
  };

  // ---------------------------------------------------------------------------
  // getMatterStatus
  // ---------------------------------------------------------------------------

  it("getMatterStatus: mismatched companyId → company_scope_violation error + error receipt (no data returned)", async () => {
    const deps = makeDeps({
      client: {
        async getIssue(_id: string): Promise<IssueRecord> {
          return foreignIssue;
        },
      },
    });

    await assert.rejects(
      () => getMatterStatus({ matterId: FAKE_MATTER_ID }, deps),
      /company_scope_violation/,
    );

    // Exactly one error receipt written
    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "get_matter_status");
    assert.equal(r.outcome, "error");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.deepEqual(r.meta, { reason: "company_scope_violation" });

    // No foreign companyId or privileged data in receipt
    const serialized = JSON.stringify(r);
    assert.ok(!serialized.includes(FOREIGN_COMPANY_ID), "foreign companyId must not appear in receipt");
  });

  it("getMatterStatus: matching companyId → succeeds normally (scope check passes)", async () => {
    const deps = makeDeps(); // companyId: FAKE_COMPANY_ID; fakeIssue.companyId: FAKE_COMPANY_ID
    const result = await getMatterStatus({ matterId: FAKE_MATTER_ID }, deps);
    assert.equal(result.status, "open");
    assert.equal(deps.receipts.calls.length, 1);
    assert.equal(deps.receipts.calls[0].outcome, "performed");
  });

  it("getMatterStatus: companyId absent in deps → scope check skipped (backward-compatible)", async () => {
    // When companyId is undefined, the guard must not assert and must pass.
    const depsNoCompany: HandlerDeps & { client: TestClient; receipts: ReceiptSpy } = {
      client: makeClient(),
      receipts: makeReceiptsSpy(),
      // no companyId — backward-compatible: no scope check performed
    };
    const result = await getMatterStatus({ matterId: FAKE_MATTER_ID }, depsNoCompany);
    assert.equal(result.status, "open");
    assert.equal(depsNoCompany.receipts.calls[0].outcome, "performed");
  });

  // ---------------------------------------------------------------------------
  // listWorkProducts
  // ---------------------------------------------------------------------------

  it("listWorkProducts: mismatched companyId → company_scope_violation error + error receipt (no data returned)", async () => {
    const deps = makeDeps({
      client: {
        async getIssue(_id: string): Promise<IssueRecord> {
          return foreignIssue;
        },
      },
    });

    await assert.rejects(
      () => listWorkProducts({ matterId: FAKE_MATTER_ID }, deps),
      /company_scope_violation/,
    );

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "list_work_products");
    assert.equal(r.outcome, "error");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.deepEqual(r.meta, { reason: "company_scope_violation" });
  });

  it("listWorkProducts: matching companyId → succeeds normally", async () => {
    const deps = makeDeps();
    const result = await listWorkProducts({ matterId: FAKE_MATTER_ID }, deps);
    assert.equal(result.length, 2);
    assert.equal(deps.receipts.calls[0].outcome, "performed");
  });

  // ---------------------------------------------------------------------------
  // fetchWorkProduct
  // ---------------------------------------------------------------------------

  it("fetchWorkProduct: mismatched companyId → company_scope_violation error + error receipt (no data returned)", async () => {
    const deps = makeDeps({
      client: {
        async getIssue(_id: string): Promise<IssueRecord> {
          return foreignIssue;
        },
      },
    });

    await assert.rejects(
      () => fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps),
      /company_scope_violation/,
    );

    assert.equal(deps.receipts.calls.length, 1);
    const r = deps.receipts.calls[0];
    assert.equal(r.tool, "fetch_work_product");
    assert.equal(r.outcome, "error");
    assert.equal(r.matterId, FAKE_MATTER_ID);
    assert.deepEqual(r.meta, { reason: "company_scope_violation" });
  });

  it("fetchWorkProduct: matching companyId → succeeds normally", async () => {
    const deps = makeDeps();
    const result = await fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps);
    if ("error" in result) assert.fail(`expected no error: ${result.error}`);
    assert.equal(result.id, FAKE_WP_ID);
    assert.equal(deps.receipts.calls[0].outcome, "performed");
  });

  it("SECURITY: no data returned on scope violation — no work product arrays, no titles, no text", async () => {
    // Verify the error throws BEFORE any data is read or returned
    const getIssueCalls: string[] = [];
    const listWorkProductsCalls: string[] = [];
    const deps = makeDeps({
      client: {
        async getIssue(id: string): Promise<IssueRecord> {
          getIssueCalls.push(id);
          return foreignIssue;
        },
        async listWorkProducts(id: string): Promise<WorkProductRecord[]> {
          listWorkProductsCalls.push(id);
          return fakeWorkProducts; // should never be called on scope violation
        },
      },
    });

    await assert.rejects(() => fetchWorkProduct({ matterId: FAKE_MATTER_ID, workProductId: FAKE_WP_ID }, deps));

    assert.equal(getIssueCalls.length, 1, "getIssue called exactly once (for scope check)");
    assert.equal(
      listWorkProductsCalls.length,
      0,
      "listWorkProducts must NOT be called when scope check fails — no data access on violation",
    );
  });
});
