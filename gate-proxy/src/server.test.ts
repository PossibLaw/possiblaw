import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ReceiptChain,
  sha256hex,
  canonicalJson,
  GENESIS,
  type ReceiptEntry,
  type ReceiptBody,
} from "./receipts.ts";
import { loadPolicy, DEFAULT_POLICY } from "./policy.ts";
import type { Policy } from "./policy.ts";
import type { PaperclipClient, ApprovalRecord } from "./paperclip-client.ts";
import { PerformerError, buildPerformers, type Performer, type PerformerRegistry } from "./connectors.ts";
import { createGateServer, type GateServerDeps } from "./server.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";

// Policy with an empty citation gate — used by tests that pre-date Phase 2
// enforcement and do not register citations before posting egress.
const POLICY_NO_CITATION_GATE: Policy = {
  ...DEFAULT_POLICY,
  citationGate: { boundaries: [], requireAuthorityProvenance: false },
};

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
 * CitationRegistry now fails closed on a corrupt chain (Phase 1 posture) rather than
 * throwing, so no fallback or catch is needed here. */
async function startServer(
  deps: Omit<GateServerDeps, "citationRegistry" | "authorityRegistry"> & {
    citationRegistry?: CitationRegistry;
    authorityRegistry?: AuthorityRegistry;
  },
): Promise<{ server: http.Server; baseUrl: string; close: () => Promise<void> }> {
  const citationRegistry: CitationRegistry =
    deps.citationRegistry ?? new CitationRegistry(deps.receipts);
  const authorityRegistry: AuthorityRegistry =
    deps.authorityRegistry ?? new AuthorityRegistry(deps.receipts);
  const fullDeps: GateServerDeps = { ...deps, citationRegistry, authorityRegistry };
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
      policy: POLICY_NO_CITATION_GATE,
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
      policy: POLICY_NO_CITATION_GATE,
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
      policy: POLICY_NO_CITATION_GATE,
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
      policy: POLICY_NO_CITATION_GATE,
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
      policy: POLICY_NO_CITATION_GATE,
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
      citationGate: { boundaries: [...DEFAULT_POLICY.citationGate.boundaries], requireAuthorityProvenance: false },
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
      policy: POLICY_NO_CITATION_GATE,
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
      policy: POLICY_NO_CITATION_GATE,
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

    // Force an invalid decision via type cast — this bypasses TS exhaustiveness.
    // Use empty citationGate so the gate does not intercept before the unhandled-decision path.
    const badPolicy: Policy = {
      version: 1,
      boundaries: { ...DEFAULT_POLICY.boundaries, THIRD_PARTY_EGRESS: "bogus_decision" as unknown as "allow" },
      citationGate: { boundaries: [], requireAuthorityProvenance: false },
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
      policy: POLICY_NO_CITATION_GATE,
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

  // 2.5-8: corrupt chain → POST /quality/citation returns error status (not 200); server stays up
  it("POST /quality/citation: corrupt chain → error status (not 200); GET /health → 503", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    // Write corrupt content — verify() will fail so CitationRegistry sets chainCorrupt=true
    fs.writeFileSync(filePath, "NOT_JSON\n", "utf8");

    // Phase 1 posture: CitationRegistry constructor must NOT throw; server must start cleanly
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    // POST /quality/citation with a valid body must return an error status — not 200
    const { status } = await postCitation(baseUrl, {
      document: "See 384 U.S. 436.",
      rows: [{ citation: "384 U.S. 436", match: "Yes" }],
      meta: { agentId: "agent-1" },
    });
    assert.ok(
      status !== 200,
      `expected a non-200 error status when chain is corrupt, got ${status}`,
    );

    // Server must still be up — /health returns 503 receipts_corrupt
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 503, "server must still respond with 503 after corrupt-chain citation refusal");
    const h = await healthRes.json() as Record<string, unknown>;
    assert.equal(h["ok"], false);
    assert.ok(String(h["error"]).includes("receipts_corrupt"), `expected receipts_corrupt in error; got: ${JSON.stringify(h)}`);

    await close();
  });

  // -------------------------------------------------------------------------
  // POST /quality/authority — authority-provenance registration tests
  // -------------------------------------------------------------------------

  /** POST a JSON body to /quality/authority and return {status, json}. */
  async function postAuthority(
    baseUrl: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${baseUrl}/quality/authority`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  it("POST /quality/authority: happy registration → 200, ok:true, normalizedCitation; performed receipt appended", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postAuthority(baseUrl, {
      citation: "Roe v. Wade, 410 U.S. 113 (1973)",
      sha256: sha256hex("roe-body"),
      source: "courtlistener",
      sourceUrl: "https://www.courtlistener.com/opinion/108713/roe-v-wade/",
      retrievedAt: "2026-06-26T12:00:00.000Z",
    });

    assert.equal(status, 200);
    const j = json as Record<string, unknown>;
    assert.equal(j["ok"], true);
    assert.equal(typeof j["normalizedCitation"], "string");

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "quality");
    assert.equal(last.body.tool, "authority_provenance");
    assert.equal(last.body.outcome, "performed");
    // no authority text in the receipt — only the content sha + audit fields
    assert.equal(JSON.stringify(last.body).includes("roe-body"), false);

    await close();
  });

  it("POST /quality/authority: bad input (missing sha256) → 400 + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postAuthority(baseUrl, {
      citation: "Roe v. Wade, 410 U.S. 113 (1973)",
      source: "courtlistener",
    });
    assert.equal(status, 400);
    assert.ok(String((json as Record<string, unknown>)["error"]).includes("invalid_authority"));

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.tool, "authority_provenance");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  it("POST /quality/authority: non-hex sha256 → 400 invalid_authority", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status } = await postAuthority(baseUrl, {
      citation: "410 U.S. 113",
      sha256: "not-a-sha",
      source: "courtlistener",
    });
    assert.equal(status, 400);

    await close();
  });

  it("authority-provenance flag-only: an unbacked cite is RECORDED on the egress receipt, NOT blocked (default policy)", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    // THIRD_PARTY_EGRESS=allow + citation gate on it; default requireAuthorityProvenance=false.
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: { share_external: async () => ({ ok: true }) },
      localModelAvailable: false,
    });

    // Register Roe as retrieved, but NOT Miranda.
    await postAuthority(baseUrl, { citation: "410 U.S. 113", sha256: sha256hex("roe-body"), source: "courtlistener" });

    // A document that cites a registered citation verification (so the citation
    // gate passes) AND two authorities, one retrieved (Roe) one not (Miranda).
    const document = "We rely on 410 U.S. 113 and on 384 U.S. 436.";
    await postCitation(baseUrl, {
      document,
      rows: [
        { citation: "410 U.S. 113", match: "Yes" },
        { citation: "384 U.S. 436", match: "Yes" },
      ],
      meta: { agentId: "agent-1", issueId: "POS-1" },
    });

    const { status } = await postEgress(baseUrl, "share_external", {
      payload: { content: document },
      meta: { agentId: "agent-1", issueId: "POS-1" },
    });

    // Default policy: egress still ALLOWED (flag-only, not blocked).
    assert.equal(status, 200, "default policy must not block on unbacked citations");

    // The egress receipt RECORDS the unbacked citation.
    const egressEntry = receipts.entries().reverse().find(
      (e) => e.body.kind === "egress" && e.body.outcome === "performed",
    )!;
    const unbacked = egressEntry.body.meta?.["unbackedCitations"] as string[] | undefined;
    assert.ok(Array.isArray(unbacked), "egress receipt must record unbackedCitations array");
    assert.deepEqual(unbacked, ["384 U.S. 436"]);

    await close();
  });

  it("authority-provenance enforce: requireAuthorityProvenance=true blocks an unbacked cite with a clear reason", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const enforcePolicy: Policy = {
      ...DEFAULT_POLICY,
      citationGate: { boundaries: [...DEFAULT_POLICY.citationGate.boundaries], requireAuthorityProvenance: true },
    };
    const { baseUrl, close } = await startServer({
      policy: enforcePolicy,
      receipts,
      client: null,
      performers: { share_external: async () => ({ ok: true }) },
      localModelAvailable: false,
    });

    const document = "We rely on 384 U.S. 436.";
    // Register the citation verification so we reach the authority check.
    await postCitation(baseUrl, {
      document,
      rows: [{ citation: "384 U.S. 436", match: "Yes" }],
      meta: { agentId: "agent-1", issueId: "POS-1" },
    });
    // Note: 384 U.S. 436 was NEVER registered as retrieved.

    const { status, json } = await postEgress(baseUrl, "share_external", {
      payload: { content: document },
      meta: { agentId: "agent-1", issueId: "POS-1" },
    });

    assert.equal(status, 403);
    const j = json as Record<string, unknown>;
    assert.equal(j["decision"], "block");
    assert.ok(String(j["reason"]).includes("authority_provenance"));
    assert.deepEqual(j["unbackedCitations"], ["384 U.S. 436"]);

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.meta?.["reason"], "authority_provenance_unbacked");

    await close();
  });

  // FIX 2 — citation field must contain a recognized legal citation
  it("POST /quality/authority: arbitrary prose (no legal citation) → 400 invalid_authority", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postAuthority(baseUrl, {
      citation: "arbitrary privileged prose no cite",
      sha256: sha256hex("some-body"),
      source: "courtlistener",
    });
    assert.equal(status, 400);
    assert.ok(
      String((json as Record<string, unknown>)["error"]).includes("invalid_authority"),
      "error must be invalid_authority for non-citation string",
    );

    // Must still write an error receipt (fail-closed)
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.tool, "authority_provenance");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  it("POST /quality/authority: real legal citation string → 200 accepted", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postAuthority(baseUrl, {
      citation: "Roe v. Wade, 410 U.S. 113 (1973)",
      sha256: sha256hex("roe-body"),
      source: "courtlistener",
    });
    assert.equal(status, 200);
    assert.equal((json as Record<string, unknown>)["ok"], true);

    await close();
  });

  // FIX 3 — reporterMeta must NOT be stored in the receipt
  it("POST /quality/authority: reporterMeta is NOT stored in the receipt (ledger pollution fix)", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    await postAuthority(baseUrl, {
      citation: "Roe v. Wade, 410 U.S. 113 (1973)",
      sha256: sha256hex("roe-body"),
      source: "courtlistener",
      meta: { arbitrary: "privileged data", nested: { secret: true } },
    });

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.outcome, "performed");
    // reporterMeta must NOT appear in the receipt body
    assert.equal(
      JSON.stringify(last.body).includes("reporterMeta"),
      false,
      "reporterMeta must not be stored in the receipt",
    );
    // No caller-supplied meta values either
    assert.equal(
      JSON.stringify(last.body).includes("privileged data"),
      false,
      "caller meta values must not appear in the receipt",
    );

    await close();
  });

  // GET /receipts/bundle → JSON Matter Trust Report for one matter
  it("GET /receipts/bundle?issueId=... → 200 JSON bundle scoped to the matter", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    receipts.append({
      kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
      decision: "human", outcome: "performed", payloadSha256: sha256hex("p"),
      agentId: "agent-1", issueId: "POS-123", approvalId: "approval-1",
    });
    receipts.append({
      kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
      decision: "allow", outcome: "performed", payloadSha256: sha256hex("q"),
      agentId: "agent-1", issueId: "POS-999",
    });

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/receipts/bundle?issueId=POS-123`);
    assert.equal(res.status, 200);
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body["issueId"], "POS-123");
    assert.equal((body["receipts"] as unknown[]).length, 1);
    assert.equal((body["attestations"] as unknown[]).length, 1);
    assert.equal((body["chain"] as Record<string, unknown>)["ok"], true);

    await close();
  });

  // GET /receipts/bundle?format=md → Markdown Matter Trust Report
  it("GET /receipts/bundle?format=md → 200 text/markdown report", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    receipts.append({
      kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
      decision: "allow", outcome: "performed", payloadSha256: sha256hex("p"),
      agentId: "agent-1", issueId: "POS-123",
    });

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/receipts/bundle?issueId=POS-123&format=md`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/markdown/);
    const md = await res.text();
    assert.match(md, /Matter Trust Report/);
    assert.match(md, /POS-123/);

    await close();
  });

  // ---------------------------------------------------------------------------
  // Task 4.5 — delivered-artifact link in egress receipt → Matter Trust Report
  // ---------------------------------------------------------------------------

  // Happy: successful gdrive upload → receipt meta.delivery {vendor,fileId,webUrl};
  // GET /receipts/bundle output includes the webUrl for that egress event.
  it("delivery: gdrive upload_document → performed receipt meta.delivery; bundle includes webUrl", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    const webUrl = "https://drive.google.com/file/d/gfile-xyz/view";
    const fakeUpload: Performer = async () => ({ id: "gfile-xyz", webUrl });
    const performers: PerformerRegistry = { upload_document: fakeUpload };

    const { baseUrl, close } = await startServer({
      policy: POLICY_NO_CITATION_GATE,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const payload = { destination: "gdrive", name: "report.md", content: "Delivered report body.", folderId: "folder-1" };
    const { status, json } = await postEgress(baseUrl, "upload_document", {
      payload,
      meta: { agentId: "agent-1", issueId: "POS-DEL-1", confidentiality: "standard" },
    });

    assert.equal(status, 200);
    assert.equal((json as Record<string, unknown>)["decision"], "allow");

    // Receipt meta.delivery carries vendor + fileId + webUrl (metadata, not payload text)
    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    const delivery = meta["delivery"] as Record<string, unknown>;
    assert.ok(delivery !== undefined && typeof delivery === "object", "receipt meta must carry delivery object");
    assert.equal(delivery["vendor"], "gdrive");
    assert.equal(delivery["fileId"], "gfile-xyz");
    assert.equal(delivery["webUrl"], webUrl);

    // Receipts file must NOT contain the document body text
    const fileContents = fs.readFileSync(filePath, "utf8");
    assert.ok(!fileContents.includes("Delivered report body."), "receipts file must not contain document body text");

    // Matter Trust Report bundle (JSON) surfaces the webUrl
    const bundleRes = await fetch(`${baseUrl}/receipts/bundle?issueId=POS-DEL-1`);
    assert.equal(bundleRes.status, 200);
    const bundle = await bundleRes.json() as Record<string, unknown>;
    const deliveries = bundle["deliveries"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(deliveries) && deliveries.length === 1, "bundle must list one delivered artifact");
    assert.equal(deliveries[0]["webUrl"], webUrl);
    assert.equal(deliveries[0]["fileId"], "gfile-xyz");
    assert.equal(deliveries[0]["vendor"], "gdrive");

    // Markdown report renders the webUrl and does not crash
    const mdRes = await fetch(`${baseUrl}/receipts/bundle?issueId=POS-DEL-1&format=md`);
    assert.equal(mdRes.status, 200);
    const md = await mdRes.text();
    assert.match(md, /Delivered Artifacts/);
    assert.ok(md.includes(webUrl), "markdown report must include the delivery webUrl");

    await close();
  });

  // Edge: performer result lacks webUrl (e.g. Notion returns only page id) →
  // meta.delivery has what exists; report renders without crash.
  it("delivery: performer returns only id (no webUrl) → meta.delivery has vendor+fileId; report renders", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const fakeUpload: Performer = async () => ({ id: "page-abc" });
    const performers: PerformerRegistry = { upload_document: fakeUpload };

    const { baseUrl, close } = await startServer({
      policy: POLICY_NO_CITATION_GATE,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const payload = { destination: "notion", name: "Note", content: "body", parentPageId: "parent-1" };
    const { status } = await postEgress(baseUrl, "upload_document", {
      payload,
      meta: { agentId: "agent-1", issueId: "POS-DEL-2" },
    });
    assert.equal(status, 200);

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    const meta = last.body.meta as Record<string, unknown>;
    const delivery = meta["delivery"] as Record<string, unknown>;
    assert.equal(delivery["vendor"], "notion");
    assert.equal(delivery["fileId"], "page-abc");
    assert.ok(!("webUrl" in delivery), "webUrl must be absent when performer did not return it");

    // Markdown report still renders
    const mdRes = await fetch(`${baseUrl}/receipts/bundle?issueId=POS-DEL-2&format=md`);
    assert.equal(mdRes.status, 200);

    await close();
  });

  // Failure/security: blocked egress → NO meta.delivery; document body text never in receipt.
  it("delivery: blocked upload_document → no meta.delivery; body text absent from receipt", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    let callCount = 0;
    const fakeUpload: Performer = async () => { callCount++; return { id: "should-not-happen", webUrl: "https://nope" }; };
    const performers: PerformerRegistry = { upload_document: fakeUpload };

    const blockPolicy: Policy = {
      version: 1,
      boundaries: { ...DEFAULT_POLICY.boundaries, THIRD_PARTY_EGRESS: "block" },
      citationGate: { boundaries: [], requireAuthorityProvenance: false },
    };

    const { baseUrl, close } = await startServer({
      policy: blockPolicy,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const SENTINEL = "SECRET_DELIVERY_BODY_SENTINEL_987";
    const payload = { destination: "gdrive", name: "report.md", content: SENTINEL, folderId: "folder-1" };
    const { status } = await postEgress(baseUrl, "upload_document", {
      payload,
      meta: { agentId: "agent-1", issueId: "POS-DEL-3" },
    });

    assert.equal(status, 403);
    assert.equal(callCount, 0, "performer must NOT be called on a blocked egress");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "blocked");
    const meta = (last.body.meta ?? {}) as Record<string, unknown>;
    assert.ok(!("delivery" in meta), "blocked receipt must NOT carry meta.delivery");

    const fileContents = fs.readFileSync(filePath, "utf8");
    assert.ok(!fileContents.includes(SENTINEL), "receipts file must not contain document body text");

    await close();
  });

  // Failure/security (4.3a end-to-end): invalid folderId through the REAL gdrive
  // performer → vendor fetch NOT called, 502 + error receipt appended, no delivery.
  it("delivery/4.3a: invalid folderId via real gdrive performer → 502 error receipt, no meta.delivery", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    let fetchCalled = 0;
    const fakeFetch = (async () => {
      fetchCalled++;
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "tok" }, fakeFetch);

    const { baseUrl, close } = await startServer({
      policy: POLICY_NO_CITATION_GATE,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "upload_document", {
      payload: { destination: "gdrive", name: "f.md", content: "body", folderId: "../../etc" },
      meta: { agentId: "agent-1", issueId: "POS-DEL-4" },
    });

    assert.equal(status, 502, "invalid folderId → PerformerError → 502");
    assert.equal(fetchCalled, 0, "vendor fetch must NOT be called on invalid folderId");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "error", "error receipt must be appended");
    const meta = (last.body.meta ?? {}) as Record<string, unknown>;
    assert.ok(!("delivery" in meta), "error receipt must NOT carry meta.delivery");

    await close();
  });

  // Finding 1 regression: a real-gdrive-shaped vendor response (the REAL
  // performer from buildPerformers, not a hand-rolled fake) must produce a
  // receipt meta.delivery carrying webUrl end-to-end — the primary vendor
  // must not silently lose its delivery link.
  it("delivery: real gdrive performer with a real-gdrive-shaped response → receipt meta.delivery carries webUrl", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const webUrl = "https://drive.google.com/file/d/gfile-real/view";
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ id: "gfile-real", webViewLink: webUrl }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "tok" }, fakeFetch);

    const { baseUrl, close } = await startServer({
      policy: POLICY_NO_CITATION_GATE,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "upload_document", {
      payload: { destination: "gdrive", name: "f.md", content: "body", folderId: "folder-1" },
      meta: { agentId: "agent-1", issueId: "POS-DEL-5" },
    });
    assert.equal(status, 200);

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    const delivery = meta["delivery"] as Record<string, unknown>;
    assert.equal(delivery["vendor"], "gdrive");
    assert.equal(delivery["fileId"], "gfile-real");
    assert.equal(delivery["webUrl"], webUrl);

    await close();
  });

  // Finding 2: delivery fields are gated through isSafeAuthorityString before
  // entering the hash-chained receipt. A webUrl containing CRLF must be
  // omitted from meta.delivery, but the upload itself must still succeed and
  // the other (safe) delivery fields must still survive.
  it("delivery/Finding2: webUrl containing CRLF is omitted from meta.delivery; vendor+fileId survive", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const badWebUrl = "https://drive.google.com/file/d/x/view\r\nX-Injected: true";
    const fakeUpload: Performer = async () => ({ id: "gfile-crlf", webUrl: badWebUrl });
    const performers: PerformerRegistry = { upload_document: fakeUpload };

    const { baseUrl, close } = await startServer({
      policy: POLICY_NO_CITATION_GATE,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "upload_document", {
      payload: { destination: "gdrive", name: "f.md", content: "body", folderId: "folder-1" },
      meta: { agentId: "agent-1", issueId: "POS-DEL-6" },
    });
    assert.equal(status, 200, "upload must still succeed even though the delivery field is dropped");

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    const delivery = meta["delivery"] as Record<string, unknown>;
    assert.equal(delivery["vendor"], "gdrive", "vendor must still survive");
    assert.equal(delivery["fileId"], "gfile-crlf", "fileId must still survive");
    assert.ok(!("webUrl" in delivery), "webUrl containing CRLF must be omitted");

    // Receipts file must never contain the raw CRLF-carrying value.
    const fileContents = fs.readFileSync(path.join(dir, "r.jsonl"), "utf8");
    assert.ok(!fileContents.includes("X-Injected"), "receipts file must not contain the injected value");

    await close();
  });

  // Finding 2: a webUrl exceeding the 2048-char bound is omitted from
  // meta.delivery, while vendor+fileId still survive.
  it("delivery/Finding2: webUrl exceeding 2048 chars is omitted from meta.delivery; vendor+fileId survive", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const oversizedWebUrl = "https://drive.google.com/file/d/" + "x".repeat(2100) + "/view";
    const fakeUpload: Performer = async () => ({ id: "gfile-oversized", webUrl: oversizedWebUrl });
    const performers: PerformerRegistry = { upload_document: fakeUpload };

    const { baseUrl, close } = await startServer({
      policy: POLICY_NO_CITATION_GATE,
      receipts,
      client: null,
      performers,
      localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "upload_document", {
      payload: { destination: "gdrive", name: "f.md", content: "body", folderId: "folder-1" },
      meta: { agentId: "agent-1", issueId: "POS-DEL-7" },
    });
    assert.equal(status, 200);

    const entries = receipts.entries();
    const last = entries[entries.length - 1];
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    const delivery = meta["delivery"] as Record<string, unknown>;
    assert.equal(delivery["vendor"], "gdrive");
    assert.equal(delivery["fileId"], "gfile-oversized");
    assert.ok(!("webUrl" in delivery), "webUrl exceeding 2048 chars must be omitted");

    await close();
  });

  // ---------------------------------------------------------------------------
  // POST /receipts/facade — firm-facade receipt channel tests
  // ---------------------------------------------------------------------------

  /** POST a JSON body to /receipts/facade and return {status, json}. */
  async function postFacadeReceipt(
    baseUrl: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${baseUrl}/receipts/facade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  // facade-1: valid facade receipt → 200, chain verify ok, kind===firm_facade
  it("POST /receipts/facade: valid receipt → 200 recorded:true, chain verify ok, kind=firm_facade", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const facadeSha = sha256hex("create-matter-payload");
    const { status, json } = await postFacadeReceipt(baseUrl, {
      tool: "create_matter",
      outcome: "performed",
      payloadSha256: facadeSha,
      matterId: "matter-1",
      agentId: "agent-1",
    });

    assert.equal(status, 200);
    const j = json as Record<string, unknown>;
    assert.equal(j["recorded"], true);
    assert.ok(typeof j["seq"] === "number", "must have seq");
    assert.ok(typeof j["hash"] === "string" && /^[0-9a-f]{64}$/.test(j["hash"] as string), "must have hash");

    const v = receipts.verify();
    assert.equal(v.ok, true);
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "firm_facade");
    assert.equal(last.body.tool, "create_matter");
    assert.equal(last.body.outcome, "performed");
    assert.equal(last.body.payloadSha256, facadeSha);
    assert.equal(last.body.boundary, null);
    assert.equal(last.body.decision, null);

    await close();
  });

  // facade-2 (anti-forgery): body with kind:"quality" + tool:"citation_verification"
  // → kind is always firm_facade on the receipt; CitationRegistry is NOT contaminated
  it("POST /receipts/facade anti-forgery: kind:quality in body is ignored; CitationRegistry unaffected", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const citationRegistry = new CitationRegistry(receipts);
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: { share_external: async () => ({ ok: true }) },
      localModelAvailable: false,
      citationRegistry,
    });

    // sha that would bypass the citation gate if contamination succeeded
    const fakeDocSha = sha256hex("would-be-a-document-sha");

    // Attacker sends a body with kind:"quality" and a valid facade tool
    // plus the fake doc sha as the payloadSha256, hoping to contaminate CitationRegistry
    const { status, json } = await postFacadeReceipt(baseUrl, {
      kind: "quality",           // attacker-supplied — MUST be ignored server-side
      tool: "create_matter",     // valid facade noun (tool validation passes)
      outcome: "performed",
      payloadSha256: fakeDocSha, // sha attacker wants in verified set
    });

    // Request is accepted (200) — the forgery attempt does NOT cause an error
    assert.equal(status, 200);

    // The receipt MUST be kind:firm_facade — the server never reads kind from body
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "firm_facade",
      `kind must be firm_facade (got ${last.body.kind}); server must never read kind from request body`);
    assert.notEqual(last.body.kind, "quality",
      "kind must NOT be quality — forge attempt must not succeed");

    // CitationRegistry.has() must be false — the facade POST must NOT populate verified set
    assert.equal(
      citationRegistry.has(fakeDocSha),
      false,
      "CitationRegistry must not be contaminated by a facade POST; verified set must be unchanged",
    );

    // Chain integrity must still hold
    const v = receipts.verify();
    assert.equal(v.ok, true, "chain must still verify after the facade POST");

    await close();
  });

  // facade-3: unknown tool → 4xx, not recorded as success; rejected forgery must
  // NOT contaminate the citation registry (the exact 5121156 vector).
  it("POST /receipts/facade: unknown tool (citation_verification forgery) → 4xx, citation registry uncontaminated", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    // Wire a CitationRegistry into the server (the verified set is rebuilt from the chain).
    const citationRegistry = new CitationRegistry(receipts);
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
      citationRegistry,
    });

    const attackSha = "c".repeat(64); // 64-hex sha the forger wants in the verified set
    const { status, json } = await postFacadeReceipt(baseUrl, {
      tool: "citation_verification",  // not a valid facade noun (the 5121156 vector)
      outcome: "performed",
      payloadSha256: attackSha,
    });

    assert.ok(status >= 400 && status < 500, `must return 4xx, got ${status}`);
    assert.ok(typeof (json as Record<string, unknown>)["error"] === "string", "must have error field");

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "firm_facade");
    assert.equal(last.body.outcome, "error");

    // SECURITY (load-bearing): the rejected forgery must NOT bypass the citation gate.
    // The verified set is rebuilt from the chain on construction (i.e. on restart),
    // so rebuild a FRESH registry over the now-updated chain. If the server had
    // wrongly recorded the forgery as kind:quality/tool:citation_verification/
    // outcome:performed with payloadSha256:attackSha, this fresh rebuild WOULD add
    // attackSha to verified and has() would return true — so this assertion fails
    // under contamination (non-vacuous). The error receipt (kind:firm_facade,
    // tool:facade_unknown_tool) must never feed the verified set.
    const rebuiltRegistry = new CitationRegistry(receipts);
    assert.equal(
      rebuiltRegistry.has(attackSha),
      false,
      "rejected forgery must not register in CitationRegistry — citation gate must stay closed for attackSha",
    );
    // The wired-in registry must likewise never see it.
    assert.equal(citationRegistry.has(attackSha), false);

    await close();
  });

  // facade-4: oversized body → 413, no crash
  it("POST /receipts/facade: >1MB body → 413, chain intact", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const bigBody = "x".repeat(1_000_001);
    const res = await fetch(`${baseUrl}/receipts/facade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bigBody,
    });
    assert.equal(res.status, 413);
    const j = await res.json() as Record<string, unknown>;
    assert.ok(typeof j["error"] === "string");

    // server still alive
    const healthRes = await fetch(`${baseUrl}/health`);
    assert.equal(healthRes.status, 200);

    await close();
  });

  // facade-5: malformed JSON → 400 structured error + error receipt
  it("POST /receipts/facade: malformed JSON → 400 invalid_json + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const res = await fetch(`${baseUrl}/receipts/facade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "NOT VALID JSON {{{",
    });
    assert.equal(res.status, 400);
    const j = await res.json() as Record<string, unknown>;
    assert.ok(String(j["error"]).includes("invalid_json"), `expected invalid_json, got ${j["error"]}`);

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "firm_facade");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // facade-6: matterId with no issueId → chain entry issueId defaults from matterId
  it("POST /receipts/facade: matterId with no explicit issueId → chain entry issueId === matterId", async () => {
    // Follow-up #2: so facade receipts appear in the per-matter Matter Trust Report.
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const facadeSha = sha256hex("matter-payload");
    const { status } = await postFacadeReceipt(baseUrl, {
      tool: "create_matter",
      outcome: "performed",
      payloadSha256: facadeSha,
      matterId: "matter-XYZ",
      // NOTE: no issueId supplied — must be defaulted from matterId
    });

    assert.equal(status, 200);
    const last = receipts.entries().at(-1)!;
    assert.equal(
      last.body.issueId,
      "matter-XYZ",
      "top-level issueId must be defaulted from matterId when not explicitly supplied",
    );
    // meta.matterId still present
    assert.equal(last.body.meta?.["matterId"], "matter-XYZ");

    await close();
  });

  // facade-7: explicit issueId wins over matterId
  it("POST /receipts/facade: explicit issueId wins when both issueId and matterId are supplied", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const facadeSha = sha256hex("matter-payload-2");
    await postFacadeReceipt(baseUrl, {
      tool: "get_matter_status",
      outcome: "performed",
      payloadSha256: facadeSha,
      matterId: "matter-ABC",
      issueId: "issue-EXPLICIT",
    });

    const last = receipts.entries().at(-1)!;
    assert.equal(
      last.body.issueId,
      "issue-EXPLICIT",
      "explicit issueId must win when both issueId and matterId are supplied",
    );

    await close();
  });

  // ---------------------------------------------------------------------------
  // POST /receipts/deadline — deadline receipt audit channel tests
  // ---------------------------------------------------------------------------

  /** POST a JSON body to /receipts/deadline and return {status, json}. */
  async function postDeadlineReceipt(
    baseUrl: string,
    body: unknown,
  ): Promise<{ status: number; json: unknown }> {
    const res = await fetch(`${baseUrl}/receipts/deadline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    return { status: res.status, json };
  }

  /** A valid deadline meta object for reuse in tests. */
  const VALID_DEADLINE_META = {
    deadline: "2025-01-10",
    rule: "FRCP-6",
    jurisdiction: "US-FED",
    direction: "forward",
    days: 21,
    serviceByMail: false,
  };

  // deadline-1: valid deadline receipt → 200, chain verify ok, kind=deadline, issueId=matterId
  it("POST /receipts/deadline: valid receipt → 200 recorded:true, chain verify ok, kind=deadline, issueId=matterId", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const dlSha = sha256hex("deadline-computation-sha");
    const { status, json } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-1",
      payloadSha256: dlSha,
      meta: VALID_DEADLINE_META,
    });

    assert.equal(status, 200);
    const j = json as Record<string, unknown>;
    assert.equal(j["recorded"], true);
    assert.ok(typeof j["seq"] === "number", "must have seq");
    assert.ok(
      typeof j["hash"] === "string" && /^[0-9a-f]{64}$/.test(j["hash"] as string),
      "must have valid hash",
    );

    const v = receipts.verify();
    assert.equal(v.ok, true, "chain must verify ok after deadline receipt");
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline", "kind must be deadline");
    assert.equal(last.body.tool, "deadline_calculation", "tool must be deadline_calculation");
    assert.equal(last.body.outcome, "performed");
    assert.equal(last.body.payloadSha256, dlSha);
    assert.equal(last.body.boundary, null);
    assert.equal(last.body.decision, null);
    // top-level issueId MUST equal matterId (so bundle filter picks it up)
    assert.equal(
      last.body.issueId,
      "matter-DL-1",
      "top-level issueId must be set to matterId",
    );
    // meta carries the computation facts
    assert.equal(last.body.meta?.["deadline"], "2025-01-10");
    assert.equal(last.body.meta?.["rule"], "FRCP-6");
    assert.equal(last.body.meta?.["jurisdiction"], "US-FED");
    assert.equal(last.body.meta?.["direction"], "forward");
    assert.equal(last.body.meta?.["days"], 21);
    assert.equal(last.body.meta?.["serviceByMail"], false);

    await close();
  });

  // deadline-2 (anti-forgery): kind:quality in body is ignored; receipt is always kind:deadline
  it("POST /receipts/deadline anti-forgery: kind:quality in body is ignored; receipt is kind:deadline", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const dlSha = sha256hex("forger-sha");
    const { status } = await postDeadlineReceipt(baseUrl, {
      kind: "quality",   // attacker-supplied — MUST be ignored server-side
      matterId: "matter-DL-2",
      payloadSha256: dlSha,
      meta: VALID_DEADLINE_META,
    });

    assert.equal(status, 200, "request must succeed (kind field in body is ignored)");
    const last = receipts.entries().at(-1)!;
    assert.equal(
      last.body.kind,
      "deadline",
      `kind must be deadline (got ${last.body.kind}); server must never read kind from request body`,
    );
    assert.notEqual(last.body.kind, "quality", "kind must NOT be quality — forgery must not succeed");

    const v = receipts.verify();
    assert.equal(v.ok, true, "chain must still verify after anti-forgery test");

    await close();
  });

  // deadline-3: missing matterId → 4xx + error receipt with kind:deadline
  it("POST /receipts/deadline: missing matterId → 400 + error receipt kind:deadline", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postDeadlineReceipt(baseUrl, {
      // no matterId
      payloadSha256: sha256hex("no-matter"),
      meta: VALID_DEADLINE_META,
    });

    assert.ok(status >= 400 && status < 500, `must be 4xx, got ${status}`);
    assert.ok(typeof (json as Record<string, unknown>)["error"] === "string", "must have error field");
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline", "error receipt kind must be deadline");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // deadline-4: bad payloadSha256 → 4xx + error receipt
  it("POST /receipts/deadline: bad payloadSha256 → 400 + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-4",
      payloadSha256: "not-64-hex", // invalid
      meta: VALID_DEADLINE_META,
    });

    assert.ok(status >= 400 && status < 500, `must be 4xx, got ${status}`);
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // deadline-5: extra field in meta → 4xx (reject extra/oversized meta)
  it("POST /receipts/deadline: extra field in meta → 400 + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-5",
      payloadSha256: sha256hex("meta-extra"),
      meta: { ...VALID_DEADLINE_META, extra: "attacker-value" },
    });

    assert.ok(status >= 400 && status < 500, `must be 4xx, got ${status}`);
    assert.ok(String((json as Record<string, unknown>)["error"]).includes("invalid_meta"));
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // deadline-6: wrong rule value → 4xx
  it("POST /receipts/deadline: rule not FRCP-6 → 400", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-6",
      payloadSha256: sha256hex("bad-rule"),
      meta: { ...VALID_DEADLINE_META, rule: "CPR-1.3" }, // unsupported
    });

    assert.ok(status >= 400 && status < 500, `must be 4xx, got ${status}`);
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // deadline-7: deadline receipt appears in bundle's deadlines section for that matter
  it("POST /receipts/deadline: deadline appears in GET /receipts/bundle deadlines section", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const dlSha = sha256hex("bundle-deadline-sha");
    const { status } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-7",
      payloadSha256: dlSha,
      meta: VALID_DEADLINE_META,
    });
    assert.equal(status, 200);

    // Fetch the bundle and verify the deadlines section
    const bundleRes = await fetch(`${baseUrl}/receipts/bundle?issueId=matter-DL-7`);
    assert.equal(bundleRes.status, 200);
    const bundle = await bundleRes.json() as Record<string, unknown>;
    const deadlines = bundle["deadlines"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(deadlines) && deadlines.length === 1, "bundle must have one deadline entry");
    const dl = deadlines[0];
    assert.equal(dl["deadline"], "2025-01-10");
    assert.equal(dl["rule"], "FRCP-6");
    assert.equal(dl["jurisdiction"], "US-FED");
    assert.equal(dl["direction"], "forward");
    assert.equal(dl["days"], 21);
    assert.equal(dl["serviceByMail"], false);
    assert.equal(dl["payloadSha256"], dlSha);

    // Markdown bundle also shows the section
    const mdRes = await fetch(`${baseUrl}/receipts/bundle?issueId=matter-DL-7&format=md`);
    assert.equal(mdRes.status, 200);
    const md = await mdRes.text();
    assert.ok(md.includes("## Computed Deadlines"), "Markdown must include Computed Deadlines section");
    assert.ok(md.includes("2025-01-10"), "Markdown must include the deadline date");
    assert.ok(md.includes("FRCP-6"), "Markdown must include the rule");
    assert.ok(md.includes("serviceByMail"), "Markdown must include the serviceByMail column");

    // Chain must still verify
    const v = receipts.verify();
    assert.equal(v.ok, true);

    await close();
  });

  // deadline-8: malformed JSON body → 400 + error receipt kind:deadline
  it("POST /receipts/deadline: malformed JSON → 400 invalid_json + error receipt kind:deadline", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const httpRes = await fetch(`${baseUrl}/receipts/deadline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "NOT VALID JSON {{{",
    });
    assert.equal(httpRes.status, 400);
    const j = await httpRes.json() as Record<string, unknown>;
    assert.ok(String(j["error"]).includes("invalid_json"), `expected invalid_json, got ${j["error"]}`);

    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // deadline-9: serviceByMail:true is recorded (audit completeness — days reconciles with date)
  it("POST /receipts/deadline: serviceByMail:true is recorded in meta", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const dlSha = sha256hex("mail-deadline-sha");
    const { status } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-9",
      payloadSha256: dlSha,
      meta: { ...VALID_DEADLINE_META, deadline: "2025-03-27", days: 14, serviceByMail: true },
    });

    assert.equal(status, 200);
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline");
    assert.equal(last.body.meta?.["serviceByMail"], true, "serviceByMail:true must be recorded in the receipt meta");
    assert.equal(last.body.meta?.["days"], 14);

    // serviceByMail surfaces in the bundle row
    const bundleRes = await fetch(`${baseUrl}/receipts/bundle?issueId=matter-DL-9`);
    const bundle = await bundleRes.json() as Record<string, unknown>;
    const dl = (bundle["deadlines"] as Array<Record<string, unknown>>)[0];
    assert.equal(dl["serviceByMail"], true);

    await close();
  });

  // deadline-10: missing serviceByMail (5 keys) → 400 (exact-key validation rejects missing field)
  it("POST /receipts/deadline: missing serviceByMail → 400 + error receipt", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY,
      receipts,
      client: null,
      performers: {},
      localModelAvailable: false,
    });

    const { status, json } = await postDeadlineReceipt(baseUrl, {
      matterId: "matter-DL-10",
      payloadSha256: sha256hex("missing-mail"),
      meta: { deadline: "2025-01-10", rule: "FRCP-6", jurisdiction: "US-FED", direction: "forward", days: 21 },
    });

    assert.ok(status >= 400 && status < 500, `must be 4xx, got ${status}`);
    assert.ok(String((json as Record<string, unknown>)["error"]).includes("invalid_meta"));
    const last = receipts.entries().at(-1)!;
    assert.equal(last.body.kind, "deadline");
    assert.equal(last.body.outcome, "error");

    await close();
  });

  // GET /receipts/bundle missing/invalid issueId → 400
  it("GET /receipts/bundle without issueId → 400", async () => {
    const dir = tmpDir();
    const receipts = new ReceiptChain(path.join(dir, "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });
    const res = await fetch(`${baseUrl}/receipts/bundle`);
    assert.equal(res.status, 400);
    await close();
  });

  // GET /receipts/bundle over a corrupt chain → 503 receipts_corrupt (fail-closed)
  it("GET /receipts/bundle over a corrupt chain → 503 receipts_corrupt", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    receipts.append({
      kind: "egress", tool: "send_email", boundary: "THIRD_PARTY_EGRESS",
      decision: "allow", outcome: "performed", payloadSha256: sha256hex("p"),
      agentId: "agent-1", issueId: "POS-123",
    });
    // Tamper the body but keep the stored hash → verify() fails.
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    const e0 = JSON.parse(lines[0]) as ReceiptEntry;
    e0.body.outcome = "blocked";
    lines[0] = JSON.stringify(e0);
    fs.writeFileSync(filePath, lines.join("\n") + "\n");

    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });
    const res = await fetch(`${baseUrl}/receipts/bundle?issueId=POS-123`);
    assert.equal(res.status, 503);
    const body = await res.json() as Record<string, unknown>;
    assert.equal(body["error"], "receipts_corrupt");
    await close();
  });
});
