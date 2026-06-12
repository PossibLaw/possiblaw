import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ReceiptChain,
  ReceiptChainCorruptError,
  sha256hex,
  canonicalJson,
  GENESIS,
  type ReceiptEntry,
  type ReceiptBody,
} from "./receipts.ts";
import { loadPolicy, DEFAULT_POLICY } from "./policy.ts";
import type { Policy } from "./policy.ts";
import type { PaperclipClient, ApprovalRecord } from "./paperclip-client.ts";
import { PerformerError, type Performer, type PerformerRegistry } from "./connectors.ts";
import { createGateServer, type GateServerDeps } from "./server.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-server-test-"));
}

function payloadSha(payload: Record<string, unknown>): string {
  return sha256hex(canonicalJson(JSON.parse(JSON.stringify(payload))));
}

/** Build a fake PaperclipClient with configurable approval records. */
function makeFakeClient(
  approvals: Map<string, ApprovalRecord> = new Map(),
  comments: Array<{ issueId: string; body: string }> = [],
): PaperclipClient {
  let nextId = 1;
  return {
    async createApproval(input: { requestedByAgentId?: string; issueIds?: string[]; payload: Record<string, unknown> }) {
      const id = `approval-${nextId++}`;
      const record: ApprovalRecord = {
        id,
        status: "pending",
        payload: { ...input.payload, payloadSha256: input.payload["payloadSha256"] },
      };
      approvals.set(id, record);
      return { id };
    },
    async getApproval(id: string) {
      const r = approvals.get(id);
      if (!r) throw new Error(`unknown approval ${id}`);
      return r;
    },
    async postIssueComment(issueId: string, body: string) {
      comments.push({ issueId, body });
    },
    async linkIssueApproval(_issueId: string, _approvalId: string) {
      // no-op for tests
    },
  } as unknown as PaperclipClient;
}

/** Start the server on port 0, return {server, baseUrl, close}. */
async function startServer(
  deps: GateServerDeps,
): Promise<{ server: http.Server; baseUrl: string; close: () => Promise<void> }> {
  const server = createGateServer(deps);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { address: string; port: number };
  const baseUrl = `http://${addr.address}:${addr.port}`;
  const close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  return { server, baseUrl, close };
}

async function postEgress(
  baseUrl: string,
  tool: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${baseUrl}/egress/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("gate server", () => {
  // 1. allow: send_email (default policy) → 200, performer called once, last receipt "performed"
  it("allow: send_email → 200, performer called once, receipt outcome=performed", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakeSendEmail: Performer = async (_req, _opts) => {
      callCount++;
      return { id: "msg-1" };
    };
    const performers: PerformerRegistry = { send_email: fakeSendEmail };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const payload = { to: "alice@example.com", subject: "Hi", body: "Hello" };
    const { status, json } = await postEgress(baseUrl, "send_email", { payload });

    assert.equal(status, 200);
    assert.equal((json as Record<string, unknown>)["decision"], "allow");
    assert.deepEqual((json as Record<string, unknown>)["result"], { id: "msg-1" });
    assert.equal(callCount, 1);

    // Last receipt
    const v = receipts.verify();
    assert.equal(v.ok, true);
    if (v.ok) assert.equal(v.length, 1);
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    assert.equal(last.body.payloadSha256, payloadSha(payload));

    await close();
  });

  // 2. human: file_court_document → 202, performer NOT called, "pending" receipt
  it("human: file_court_document → 202 + approvalId, performer not called", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { file_court_document: fakePerformer };

    const approvals = new Map<string, ApprovalRecord>();
    const client = makeFakeClient(approvals);

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client,
      performers,
      localModelAvailable: false,
    });

    const payload = { title: "Motion to Dismiss", content: "..." };
    const { status, json } = await postEgress(baseUrl, "file_court_document", {
      payload,
      meta: { agentId: "agent-1", issueId: "issue-1" },
    });

    assert.equal(status, 202);
    const j = json as Record<string, unknown>;
    assert.equal(j["status"], "pending_approval");
    assert.ok(typeof j["approvalId"] === "string", "must have approvalId");
    assert.ok(typeof j["resumeHint"] === "string", "must have resumeHint");
    assert.equal(callCount, 0, "performer must NOT be called");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "pending");
    assert.equal(last.body.approvalId, j["approvalId"] as string);

    await close();
  });

  // 3. human re-entry approved: fake client echoes stored payload → 200, performer called, "performed" receipt w/ approvalId
  it("human re-entry approved → 200, performed receipt with approvalId", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return { filed: true }; };
    const performers: PerformerRegistry = { file_court_document: fakePerformer };

    const payload = { title: "Motion to Dismiss", content: "..." };
    const sha = payloadSha(payload);

    // Pre-seed an approved approval
    const approvalId = "approval-pre-1";
    const approvals = new Map<string, ApprovalRecord>([
      [approvalId, {
        id: approvalId,
        status: "approved",
        payload: { payloadSha256: sha },
      }],
    ]);
    const client = makeFakeClient(approvals);

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client,
      performers,
      localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "file_court_document", {
      payload,
      meta: { approvalId },
    });

    assert.equal(status, 200);
    assert.equal(callCount, 1, "performer must be called on re-entry");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    assert.equal(last.body.approvalId, approvalId);

    await close();
  });

  // 4. bait-and-switch: re-entry with DIFFERENT payload + same approvalId → 403, bait_and_switch_attempt
  it("bait-and-switch: different payload on re-entry → 403, blocked receipt, performer not called", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { file_court_document: fakePerformer };

    // Approved for ORIGINAL payload
    const originalPayload = { title: "Original Motion", content: "original" };
    const originalSha = payloadSha(originalPayload);
    const approvalId = "approval-bait-1";
    const approvals = new Map<string, ApprovalRecord>([
      [approvalId, {
        id: approvalId,
        status: "approved",
        payload: { payloadSha256: originalSha },
      }],
    ]);
    const client = makeFakeClient(approvals);

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client,
      performers,
      localModelAvailable: false,
    });

    // Re-entry with DIFFERENT payload
    const differentPayload = { title: "Injected Motion", content: "malicious" };
    const { status, json } = await postEgress(baseUrl, "file_court_document", {
      payload: differentPayload,
      meta: { approvalId },
    });

    assert.equal(status, 403);
    const j = json as Record<string, unknown>;
    assert.ok(
      String(j["reason"]).includes("bait_and_switch"),
      `reason must include bait_and_switch, got: ${JSON.stringify(j)}`,
    );
    assert.equal(callCount, 0, "performer must NOT be called");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");

    await close();
  });

  // 5. anonymize: query_external_model, confidentiality privileged, no local → masked prompt
  it("anonymize: query_external_model privileged → performer receives masked prompt, anonymized_performed receipt", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    let capturedReq: Record<string, unknown> | null = null;
    const fakePerformer: Performer = async (req) => {
      capturedReq = req.payload as Record<string, unknown>;
      return { content: "answer" };
    };
    const performers: PerformerRegistry = { query_external_model: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const payload = { prompt: "Acme Corp needs advice on their merger strategy." };
    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload,
      meta: { confidentiality: "privileged", entities: ["Acme Corp"] },
    });

    assert.equal(status, 200);
    const j = json as Record<string, unknown>;
    assert.equal(j["decision"], "anonymize");

    // Performer received masked prompt — no "Acme Corp"
    assert.ok(capturedReq !== null, "performer must have been called");
    const maskedPrompt = capturedReq!["prompt"] as string;
    assert.ok(
      !maskedPrompt.includes("Acme Corp"),
      `masked prompt must not contain "Acme Corp", got: ${maskedPrompt}`,
    );
    assert.ok(
      maskedPrompt.includes("ENTITY_A"),
      `masked prompt must contain ENTITY_A, got: ${maskedPrompt}`,
    );

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "anonymized_performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.ok(
      typeof meta["maskedTokenCount"] === "number" && (meta["maskedTokenCount"] as number) >= 1,
      "maskedTokenCount must be >= 1",
    );
    // Receipts file must not contain "Acme Corp"
    const fileContents = fs.readFileSync(filePath, "utf8");
    assert.ok(
      !fileContents.includes("Acme Corp"),
      `receipts file must not contain "Acme Corp"`,
    );

    await close();
  });

  // 6. anonymize fail-closed: privileged, no entities → 403, "blocked" receipt, performer not called
  it("anonymize fail-closed: privileged + no entities → 403, blocked receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { query_external_model: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const payload = { prompt: "Privileged matter prompt." };
    const { status } = await postEgress(baseUrl, "query_external_model", {
      payload,
      meta: { confidentiality: "privileged", entities: [] },
    });

    assert.equal(status, 403);
    assert.equal(callCount, 0, "performer must NOT be called");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");

    await close();
  });

  // 7. local preference: localModelAvailable true → performer called with opts.useLocal true and UNMASKED prompt
  it("local preference: localAvailable=true + privileged → performer called with useLocal=true, UNMASKED", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const capturedState: { opts: { useLocal?: boolean } | null; prompt: string | null } = {
      opts: null,
      prompt: null,
    };
    const fakePerformer: Performer = async (req, opts) => {
      capturedState.opts = opts;
      capturedState.prompt = (req.payload as Record<string, unknown>)["prompt"] as string;
      return { content: "local answer" };
    };
    const performers: PerformerRegistry = { query_external_model: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: true,
    });

    const payload = { prompt: "Acme Corp privileged info." };
    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload,
      meta: { confidentiality: "privileged", entities: ["Acme Corp"] },
    });

    assert.equal(status, 200);
    assert.ok(capturedState.opts !== null, "performer must have been called");
    assert.equal(capturedState.opts?.useLocal, true, "useLocal must be true for local routing");
    // Unmasked — "Acme Corp" must appear in what performer got
    assert.ok(
      capturedState.prompt?.includes("Acme Corp"),
      `performer must receive unmasked prompt when routing local, got: ${capturedState.prompt}`,
    );

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["routedLocal"], true);

    await close();
  });

  // 8. unknown tool → 403 + "blocked" receipt
  it("unknown tool → 403, blocked receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const performers: PerformerRegistry = {};

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "unknown_tool_xyz", {
      payload: { foo: "bar" },
    });

    assert.equal(status, 403);
    assert.ok(
      String((json as Record<string, unknown>)["error"]).includes("unknown_tool"),
    );

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.boundary, null);
    assert.equal(last.body.decision, null);

    await close();
  });

  // 9. malformed JSON → 400 + "error" receipt
  it("malformed JSON → 400, error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const performers: PerformerRegistry = {};

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/egress/send_email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "NOT JSON {{{",
    });

    assert.equal(res.status, 400);
    const j = await res.json() as Record<string, unknown>;
    assert.ok(typeof j["error"] === "string");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "error");
    assert.equal(last.body.boundary, null);
    assert.equal(last.body.decision, null);

    await close();
  });

  // 10. performer throws PerformerError → 502, "error" receipt meta.error; payload sentinel absent
  it("performer throws PerformerError → 502, error receipt, no payload text in receipts file", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    const SECRET_SENTINEL = "SUPER_SECRET_CLIENT_DATA_12345";
    const fakePerformer: Performer = async (_req) => {
      throw new PerformerError("credential_missing: GMAIL_TOKEN");
    };
    const performers: PerformerRegistry = { send_email: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const payload = { to: "x@x.com", subject: SECRET_SENTINEL, body: "secret body" };
    const { status, json } = await postEgress(baseUrl, "send_email", { payload });

    assert.equal(status, 502);
    const j = json as Record<string, unknown>;
    assert.ok(String(j["error"]).includes("credential_missing"), "error must contain code");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "error");
    const meta = last.body.meta as Record<string, unknown>;
    assert.ok(String(meta["error"]).includes("credential_missing"));

    // Receipts file must NOT contain the payload sentinel
    const fileContents = fs.readFileSync(filePath, "utf8");
    assert.ok(
      !fileContents.includes(SECRET_SENTINEL),
      `receipts file must not contain payload sentinel "${SECRET_SENTINEL}"`,
    );

    await close();
  });

  // 11. block via policy override (THIRD_PARTY_EGRESS:"block") → 403 + blocked receipt
  it("block via policy override → 403, blocked receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { send_email: fakePerformer };

    const blockPolicy: Policy = {
      version: 1,
      boundaries: { ...DEFAULT_POLICY.boundaries, THIRD_PARTY_EGRESS: "block" },
    };

    const { baseUrl, close } = await startServer({
      policy: blockPolicy,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "send_email", {
      payload: { to: "x@x.com", subject: "Hi", body: "Body" },
    });

    assert.equal(status, 403);
    assert.equal((json as Record<string, unknown>)["decision"], "block");
    assert.equal(callCount, 0, "performer must NOT be called");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");

    await close();
  });

  // 12. human + client null → 503 + blocked receipt
  it("human + client null → 503, blocked receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { file_court_document: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,  // null = paperclip unconfigured
      performers,
      localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "file_court_document", {
      payload: { title: "Motion" },
    });

    assert.equal(status, 503);
    assert.ok(String((json as Record<string, unknown>)["error"]).includes("human_gate_unavailable"));
    assert.equal(callCount, 0, "performer must NOT be called");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");

    await close();
  });

  // 13. /health 200; /receipts/verify ok:true after traffic; full chain verify() ok
  it("/health → 200 ok:true; /receipts/verify → ok after traffic", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const fakePerformer: Performer = async () => ({ id: "done" });
    const performers: PerformerRegistry = { send_email: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    // Generate some traffic
    await postEgress(baseUrl, "send_email", {
      payload: { to: "a@b.com", subject: "s", body: "b" },
    });

    // /health
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);
    const health = await healthRes.json() as Record<string, unknown>;
    assert.equal(health["ok"], true);

    // /receipts/verify
    const verifyRes = await fetch(`${baseUrl}/receipts/verify`);
    assert.equal(verifyRes.status, 200);
    const verify = await verifyRes.json() as Record<string, unknown>;
    assert.equal(verify["ok"], true);

    // Direct verify
    const result = receipts.verify();
    assert.equal(result.ok, true);

    await close();
  });

  // 14. /receipts/anchor with fake client → comment contains "length=" and head hash; anchor receipt appended
  it("/receipts/anchor → posts comment, appends anchor receipt, returns {anchored:true}", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const fakePerformer: Performer = async () => ({ id: "done" });
    const performers: PerformerRegistry = { send_email: fakePerformer };

    const comments: Array<{ issueId: string; body: string }> = [];
    const client = makeFakeClient(new Map(), comments);

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client,
      performers,
      localModelAvailable: false,
    });

    // Add some entries first
    await postEgress(baseUrl, "send_email", {
      payload: { to: "a@b.com", subject: "s", body: "b" },
    });

    const headBefore = receipts.head();
    const issueId = "issue-anchor-1";
    const anchorRes = await fetch(`${baseUrl}/receipts/anchor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ issueId }),
    });

    assert.equal(anchorRes.status, 200);
    const anchorJ = await anchorRes.json() as Record<string, unknown>;
    assert.equal(anchorJ["anchored"], true);
    assert.ok(typeof anchorJ["head"] === "string");

    // Comment was posted
    assert.equal(comments.length, 1, "must post exactly one comment");
    assert.equal(comments[0].issueId, issueId);
    assert.ok(comments[0].body.includes("length="), "comment must contain 'length='");
    assert.ok(comments[0].body.includes(headBefore), "comment must contain head hash");

    // Anchor receipt appended
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.kind, "anchor");
    assert.equal(last.body.outcome, "performed");

    await close();
  });

  // 16. server bound to 127.0.0.1
  it("server binds to 127.0.0.1 only", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { server, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const addr = server.address() as { address: string; port: number };
    assert.equal(addr.address, "127.0.0.1");

    await close();
  });

  // /health with corrupt receipts → 503
  it("/health with corrupt receipt chain → 503 ok:false", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    // Write corrupt content
    fs.writeFileSync(filePath, "NOT_JSON\n", "utf8");

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 503);
    const h = await healthRes.json() as Record<string, unknown>;
    assert.equal(h["ok"], false);
    assert.ok(String(h["error"]).includes("receipts_corrupt"));

    await close();
  });

  // anonymize: payload missing 'prompt' field → 403 blocked
  it("anonymize: payload missing 'prompt' → 403 blocked receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { query_external_model: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    // payload lacks 'prompt' field
    const { status } = await postEgress(baseUrl, "query_external_model", {
      payload: { question: "something" },
      meta: { confidentiality: "privileged", entities: ["Acme Corp"] },
    });

    assert.equal(status, 403);
    assert.equal(callCount, 0);

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");

    await close();
  });

  // 404 on unknown routes
  it("unknown route → 404", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/unknown-path`);
    assert.equal(res.status, 404);

    await close();
  });
});
