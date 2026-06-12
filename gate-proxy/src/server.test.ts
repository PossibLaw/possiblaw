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
import { CitationRegistry } from "./quality/citation-registry.ts";

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

/** Start the server on port 0, return {server, baseUrl, close}.
 * citationRegistry is optional: one is auto-constructed from deps.receipts when omitted.
 * If the receipt chain is corrupt (CitationRegistry constructor throws), a fresh
 * temporary chain is used so the server still starts — mirrors the server's own
 * fail-closed behaviour on corrupt chains. */
async function startServer(
  deps: Omit<GateServerDeps, "citationRegistry"> & { citationRegistry?: CitationRegistry },
): Promise<{ server: http.Server; baseUrl: string; close: () => Promise<void> }> {
  let citationRegistry: CitationRegistry;
  if (deps.citationRegistry) {
    citationRegistry = deps.citationRegistry;
  } else {
    try {
      citationRegistry = new CitationRegistry(deps.receipts);
    } catch {
      // Corrupt chain: fall back to a fresh empty chain so the server still starts.
      // Tests for corrupt-chain resilience don't exercise the citation route.
      const fallbackChain = new ReceiptChain(path.join(tmpDir(), "fallback.jsonl"));
      citationRegistry = new CitationRegistry(fallbackChain);
    }
  }
  const fullDeps: GateServerDeps = { ...deps, citationRegistry };
  const server = createGateServer(fullDeps);
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
      citationGate: { boundaries: [...DEFAULT_POLICY.citationGate.boundaries] },
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

  // S1-4: humanGate blocked via rejected approval on re-entry → 403, reason mentions reject, blocked receipt with approvalId
  it("human re-entry rejected → 403, reason mentions reject, blocked receipt with approvalId", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };
    const performers: PerformerRegistry = { file_court_document: fakePerformer };

    const payload = { title: "Motion to Dismiss", content: "..." };
    const sha = payloadSha(payload);

    const approvalId = "approval-rejected-1";
    const approvals = new Map<string, ApprovalRecord>([
      [approvalId, {
        id: approvalId,
        status: "rejected",
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

    assert.equal(status, 403);
    const j = json as Record<string, unknown>;
    assert.equal(j["status"], "blocked");
    assert.ok(
      String(j["reason"]).toLowerCase().includes("reject"),
      `response reason must mention reject; got: ${JSON.stringify(j)}`,
    );
    assert.equal(callCount, 0, "performer must NOT be called");

    // Blocked receipt must be appended with the approvalId from the gate result
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.approvalId, approvalId, "blocked receipt must carry approvalId from gate result");

    await close();
  });

  // S1-2: unhandled decision → 500 + error receipt
  it("unhandled decision (type-cast invalid decision) → 500, error receipt appended", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const fakePerformer: Performer = async () => ({ done: true });
    const performers: PerformerRegistry = { send_email: fakePerformer };

    // Force an invalid decision via type cast — this bypasses TS exhaustiveness
    const badPolicy: Policy = {
      version: 1,
      boundaries: { ...DEFAULT_POLICY.boundaries, THIRD_PARTY_EGRESS: "bogus_decision" as unknown as "allow" },
      citationGate: { boundaries: [...DEFAULT_POLICY.citationGate.boundaries] },
    };

    const { baseUrl, close } = await startServer({
      policy: badPolicy,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "send_email", {
      payload: { to: "x@x.com", subject: "Hi", body: "Body" },
    });

    assert.equal(status, 500);
    assert.ok(
      String((json as Record<string, unknown>)["error"]).includes("internal_error"),
      `response must mention internal_error, got: ${JSON.stringify(json)}`,
    );

    // A receipt must have been appended with outcome=error
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "error", "unhandled decision must append error receipt");
    const rMeta = last.body.meta as Record<string, unknown>;
    assert.ok(
      String(rMeta["error"]).includes("bogus_decision"),
      `receipt meta.error must mention the unhandled value; got: ${JSON.stringify(rMeta)}`,
    );

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

  // -------------------------------------------------------------------------
  // I4 regression — prototype-named tools via server → 403 + blocked receipt
  // -------------------------------------------------------------------------
  it("I4: __proto__ tool via server → 403 blocked receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const protoTools = ["__proto__", "toString", "valueOf", "constructor"];
    for (const tool of protoTools) {
      const { status, json } = await postEgress(baseUrl, tool, { payload: {} });
      assert.equal(status, 403, `"${tool}" should → 403`);
      assert.ok(
        String((json as Record<string, unknown>)["error"]).includes("unknown_tool") ||
        String((json as Record<string, unknown>)["error"]).includes("not_found"),
        `response for "${tool}" must mention unknown_tool or not_found`,
      );
    }

    await close();
  });

  // -------------------------------------------------------------------------
  // I1 regression — confused-deputy URL smuggling via meta.approvalId
  // -------------------------------------------------------------------------
  it("I1: meta.approvalId with path traversal → 400, no performer call", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: makeFakeClient(),
      performers: { file_court_document: fakePerformer },
      localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "file_court_document", {
      payload: { title: "Motion" },
      meta: { approvalId: "../../companies/x/approvals/y" },
    });

    assert.equal(status, 400, `expected 400 for path-traversal approvalId, got ${status}`);
    assert.ok(
      String((json as Record<string, unknown>)["error"]).includes("approvalId"),
      `error should mention approvalId: ${JSON.stringify(json)}`,
    );
    assert.equal(callCount, 0, "performer must NOT be called");

    await close();
  });

  it("I1: meta.issueId with path traversal → 400, no performer call", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let callCount = 0;
    const fakePerformer: Performer = async () => { callCount++; return {}; };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: { send_email: fakePerformer },
      localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "send_email", {
      payload: { to: "a@b.com", subject: "Hi", body: "ok" },
      meta: { issueId: "../../admin/secret" },
    });

    assert.equal(status, 400);
    assert.equal(callCount, 0);

    await close();
  });

  // -------------------------------------------------------------------------
  // I2 regression — body size cap → 413
  // -------------------------------------------------------------------------
  it("I2: >1MB body → 413 response is received", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    // Build a body slightly over 1MB
    const bigBody = "x".repeat(1_100_000);
    const res = await fetch(`${baseUrl}/egress/send_email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bigBody,
    });

    assert.equal(res.status, 413, "expected 413 for oversized body");

    await close();
  });

  // -------------------------------------------------------------------------
  // I2 (c) regression — 257 entities → 400
  // -------------------------------------------------------------------------
  it("I2(c): 257 entities in meta → 400", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const tooManyEntities = Array.from({ length: 257 }, (_, i) => `Entity${i}`);
    const { status } = await postEgress(baseUrl, "send_email", {
      payload: { to: "a@b.com", subject: "Hi", body: "ok" },
      meta: { entities: tooManyEntities },
    });

    assert.equal(status, 400, `expected 400 for 257 entities, got ${status}`);

    await close();
  });

  // -------------------------------------------------------------------------
  // I5 regression — claimedConfidentiality in allow receipt
  // -------------------------------------------------------------------------
  it("I5: allow receipt includes claimedConfidentiality", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const fakePerformer: Performer = async () => ({ id: "ok" });

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: { send_email: fakePerformer },
      localModelAvailable: false,
    });

    await postEgress(baseUrl, "send_email", {
      payload: { to: "a@b.com", subject: "Hi", body: "ok" },
      meta: { confidentiality: "standard" },
    });

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(
      meta["claimedConfidentiality"],
      "standard",
      "allow receipt must carry claimedConfidentiality",
    );

    await close();
  });

  // -------------------------------------------------------------------------
  // NEW FUNCTIONAL — deanonymize model response
  // -------------------------------------------------------------------------
  it("NEW FUNCTIONAL: anonymize path — performer echoes ENTITY_A → response contains original entity; receipts file free of entity", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);

    // Performer echoes the masked token back
    const fakePerformer: Performer = async (req) => {
      const maskedPrompt = (req.payload as Record<string, unknown>)["prompt"] as string;
      // Extract ENTITY_A from masked prompt and echo it back in content
      return { content: maskedPrompt.replace(/(\bENTITY_A\b)/g, "$1 says hi") };
    };
    const performers: PerformerRegistry = { query_external_model: fakePerformer };

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const originalEntity = "Acme Corp";
    const payload = { prompt: `${originalEntity} needs advice on merger strategy.` };
    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload,
      meta: { confidentiality: "privileged", entities: [originalEntity] },
    });

    assert.equal(status, 200);
    const j = json as Record<string, unknown>;
    const result = j["result"] as Record<string, unknown>;

    // Response content must contain the original entity (deanonymized)
    assert.ok(
      typeof result["content"] === "string" && (result["content"] as string).includes(originalEntity),
      `response content must contain original entity "${originalEntity}"; got: ${JSON.stringify(result["content"])}`,
    );
    // Response must NOT contain the token
    assert.ok(
      !(result["content"] as string).includes("ENTITY_A"),
      `response content must not contain ENTITY_A token; got: ${JSON.stringify(result["content"])}`,
    );

    // Receipts file must still be free of the entity
    const fileContents = fs.readFileSync(filePath, "utf8");
    assert.ok(
      !fileContents.includes(originalEntity),
      `receipts file must not contain "${originalEntity}"`,
    );

    // Receipt outcome must be anonymized_performed
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "anonymized_performed");

    await close();
  });

  // -------------------------------------------------------------------------
  // C2 regression — corrupt receipts file + POST /egress → 500 response received, process alive
  // -------------------------------------------------------------------------
  it("C2: corrupt receipts file tail + POST /egress/send_email → response IS received (500), server still up", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    // Write a valid entry then corrupt the tail
    const receipts = new ReceiptChain(filePath);
    // Corrupt the file so append() will throw ReceiptChainCorruptError
    fs.writeFileSync(filePath, '{"seq":1,"ts":"x","prevHash":"GENESIS","hash":"badhash","body":{}}\nNOT_JSON_TAIL\n', "utf8");

    const fakePerformer: Performer = async () => ({ id: "ok" });
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: { send_email: fakePerformer },
      localModelAvailable: false,
    });

    // POST should receive a response (500) — not a connection crash
    const res = await fetch(`${baseUrl}/egress/send_email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { to: "a@b.com", subject: "Hi", body: "ok" } }),
    });

    assert.ok(
      res.status === 500 || res.status === 400 || res.status === 502,
      `expected an HTTP response (not a crash), got ${res.status}`,
    );

    // Server still up — can serve another request
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.ok(
      healthRes.status === 200 || healthRes.status === 503,
      "server must still respond to /health after corrupt-chain error",
    );

    await close();
  });

  // minor — meta must be a plain object
  it("minor: meta as array → 400", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/egress/send_email`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: { to: "a@b.com", subject: "Hi", body: "ok" }, meta: ["bad"] }),
    });

    assert.equal(res.status, 400);
    const j = await res.json() as Record<string, unknown>;
    assert.ok(String(j["error"]).includes("meta"), `error must mention meta: ${JSON.stringify(j)}`);

    await close();
  });

  // -------------------------------------------------------------------------
  // POST /quality/citation — Task 2.5 tests
  // -------------------------------------------------------------------------

  /** POST a JSON body to /quality/citation and return {status, json}. */
  async function postCitation(
    baseUrl: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${baseUrl}/quality/citation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  // 2.5-1: happy registration → 200, registered:true, documentSha256 64-char hex, citationCount correct
  it("POST /quality/citation: happy registration → 200, registered:true, sha256 + citationCount", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const document = "See Miranda v. Arizona, 384 U.S. 436 (1966).";
    const body = {
      document,
      rows: [{ citation: "384 U.S. 436", match: "Yes" }],
      meta: { agentId: "agent-1", issueId: "issue-1" },
    };
    const { status, json } = await postCitation(baseUrl, body);

    assert.equal(status, 200);
    const j = json as Record<string, unknown>;
    assert.equal(j["registered"], true);
    assert.ok(
      typeof j["documentSha256"] === "string" && /^[0-9a-f]{64}$/.test(j["documentSha256"] as string),
      `documentSha256 must be a 64-char hex string; got: ${j["documentSha256"]}`,
    );
    assert.equal(j["citationCount"], 1);

    // Final chain entry must be kind=quality outcome=performed
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.kind, "quality");
    assert.equal(last.body.outcome, "performed");

    await close();
  });

  // 2.5-2: coverage_gap → 422, reason coverage_gap, details contains the missing citation
  it("POST /quality/citation: coverage_gap → 422 with missing citation in details", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    // Document cites both Roe and Miranda; row covers only Roe
    const document =
      "This brief cites Roe v. Wade, 410 U.S. 113 (1973) and Miranda v. Arizona, 384 U.S. 436 (1966).";
    const body = {
      document,
      rows: [{ citation: "410 U.S. 113", match: "Yes" }],
      meta: {},
    };
    const { status, json } = await postCitation(baseUrl, body);

    assert.equal(status, 422);
    const j = json as Record<string, unknown>;
    assert.equal(j["registered"], false);
    assert.equal(j["reason"], "coverage_gap");
    const details = j["details"] as string[];
    assert.ok(
      Array.isArray(details) && details.some((d) => d.includes("384 U.S. 436")),
      `details must include the missing citation "384 U.S. 436"; got: ${JSON.stringify(details)}`,
    );

    await close();
  });

  // 2.5-3: malformed JSON body → 400 invalid_json + error-outcome quality receipt
  it("POST /quality/citation: malformed JSON → 400 invalid_json + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/quality/citation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "NOT JSON {{{",
    });

    assert.equal(res.status, 400);
    const j = await res.json() as Record<string, unknown>;
    assert.ok(String(j["error"]).includes("invalid_json"), `must mention invalid_json; got: ${JSON.stringify(j)}`);

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.kind, "quality");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // 2.5-4: structurally invalid body (rows: "nope") → 400 invalid_registration + error receipt
  it("POST /quality/citation: rows is a string → 400 invalid_registration + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postCitation(baseUrl, {
      document: "See 384 U.S. 436.",
      rows: "nope",
      meta: {},
    });

    assert.equal(status, 400);
    assert.ok(
      String((json as Record<string, unknown>)["error"]).includes("invalid_registration"),
      `must mention invalid_registration; got: ${JSON.stringify(json)}`,
    );

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.kind, "quality");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // 2.5-5: meta.agentId with invalid characters → 400
  it("POST /quality/citation: meta.agentId with path traversal → 400", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status } = await postCitation(baseUrl, {
      document: "See 384 U.S. 436.",
      rows: [{ citation: "384 U.S. 436", match: "Yes" }],
      meta: { agentId: "../../etc" },
    });

    assert.equal(status, 400, `expected 400 for invalid agentId; got ${status}`);

    await close();
  });

  // 2.5-6: >500 rows → 400 (pre-validation, not a 500)
  it("POST /quality/citation: 501 rows → 400 invalid_registration (pre-validation)", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const tooManyRows = Array.from({ length: 501 }, () => ({ citation: "384 U.S. 436", match: "Yes" }));
    const { status, json } = await postCitation(baseUrl, {
      document: "See 384 U.S. 436.",
      rows: tooManyRows,
      meta: {},
    });

    assert.equal(status, 400, `expected 400 for 501 rows; got ${status}`);
    assert.ok(
      String((json as Record<string, unknown>)["error"]).includes("invalid_registration"),
      `must mention invalid_registration; got: ${JSON.stringify(json)}`,
    );

    await close();
  });

  // 2.5-7: body over 1MB → 413
  it("POST /quality/citation: >1MB body → 413", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const bigBody = "x".repeat(1_100_000);
    const res = await fetch(`${baseUrl}/quality/citation`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bigBody,
    });

    assert.equal(res.status, 413, `expected 413 for oversized body; got ${res.status}`);

    await close();
  });
});
