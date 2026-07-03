// gate-proxy/src/binary-upload.test.ts
// Task 4.1 — server-level contract for binary uploads through the gate:
//   POST /egress/upload_document with {contentBase64, documentText, mimeType?}.
// Covers: fixed payload contract 400s, decoded-size 413, receipt sha over the
// DECODED bytes, {bytes, mimeType} receipt meta, delivery meta parity, and —
// the security property — the citation gate running on documentText so binary
// bytes cannot bypass citation enforcement.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { ReceiptChain } from "./receipts.ts";
import { DEFAULT_POLICY } from "./policy.ts";
import type { Policy } from "./policy.ts";
import type { Performer, PerformerRegistry } from "./connectors.ts";
import { createGateServer, type GateServerDeps } from "./server.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";
import type { PaperclipClient, ApprovalRecord } from "./paperclip-client.ts";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const POLICY_NO_CITATION_GATE: Policy = {
  ...DEFAULT_POLICY,
  citationGate: { boundaries: [], requireAuthorityProvenance: false },
};

interface Harness {
  baseUrl: string;
  receipts: ReceiptChain;
  receiptsPath: string;
  citationRegistry: CitationRegistry;
  close: () => Promise<void>;
}

async function startHarness(opts: {
  policy?: Policy;
  performer?: Performer;
  maxUploadBytes?: number;
  client?: PaperclipClient | null;
} = {}): Promise<Harness> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gate-binary-test-"));
  const receiptsPath = path.join(dir, "r.jsonl");
  const receipts = new ReceiptChain(receiptsPath);
  const citationRegistry = new CitationRegistry(receipts);
  const authorityRegistry = new AuthorityRegistry(receipts);
  const performers: PerformerRegistry = {
    upload_document: opts.performer ?? (async () => ({ id: "vend-1", webUrl: "https://vendor/f/vend-1" })),
  };
  const deps: GateServerDeps = {
    policy: opts.policy ?? POLICY_NO_CITATION_GATE,
    receipts,
    client: opts.client ?? null,
    performers,
    localModelAvailable: false,
    citationRegistry,
    authorityRegistry,
    ...(opts.maxUploadBytes !== undefined ? { maxUploadBytes: opts.maxUploadBytes } : {}),
  };
  const server: http.Server = createGateServer(deps);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { address: string; port: number };
  const baseUrl = `http://${addr.address}:${addr.port}`;
  const close = () =>
    new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  return { baseUrl, receipts, receiptsPath, citationRegistry, close };
}

async function postUpload(
  h: Harness,
  payload: Record<string, unknown>,
  meta?: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${h.baseUrl}/egress/upload_document`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload, ...(meta !== undefined ? { meta } : {}) }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  return { status: res.status, json };
}

function lastReceipt(h: Harness) {
  const entries = h.receipts.entries();
  return entries[entries.length - 1];
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const BYTES = Buffer.from("PK BINARY_UPLOAD_TEST_BYTES xyzzy", "latin1");
const B64 = BYTES.toString("base64");
const BYTES_SHA = crypto.createHash("sha256").update(BYTES).digest("hex");

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe("binary upload — happy path", () => {
  it("base64 docx + documentText, no citations → 200; receipt sha = sha256(decoded bytes); meta {binary, delivery}; no content in ledger", async () => {
    const h = await startHarness({ policy: DEFAULT_POLICY });
    try {
      const { status, json } = await postUpload(
        h,
        { destination: "gdrive", name: "brief.docx", contentBase64: B64, documentText: "No legal authorities cited here." },
        { agentId: "agent-1", issueId: "POS-BIN-1" },
      );
      assert.equal(status, 200, `expected 200; got ${status}: ${JSON.stringify(json)}`);
      assert.equal(json["decision"], "allow");

      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "performed");
      // payloadSha256 for binary uploads = sha256 of the DECODED bytes
      assert.equal(last.body.payloadSha256, BYTES_SHA);
      const meta = last.body.meta as Record<string, unknown>;
      const binary = meta["binary"] as Record<string, unknown>;
      assert.ok(binary, "receipt meta must carry binary {bytes, mimeType}");
      assert.equal(binary["bytes"], BYTES.length);
      assert.equal(binary["mimeType"], DOCX_MIME);
      // existing meta.delivery behavior applies unchanged on success
      const delivery = meta["delivery"] as Record<string, unknown>;
      assert.equal(delivery["vendor"], "gdrive");
      assert.equal(delivery["fileId"], "vend-1");
      assert.equal(delivery["webUrl"], "https://vendor/f/vend-1");

      // never receipt content: neither the base64 nor the documentText
      const ledger = fs.readFileSync(h.receiptsPath, "utf8");
      assert.ok(!ledger.includes(B64), "ledger must not contain the base64 content");
      assert.ok(!ledger.includes("No legal authorities cited here."), "ledger must not contain documentText");
    } finally {
      await h.close();
    }
  });

  it("explicit mimeType is recorded in receipt meta.binary", async () => {
    const h = await startHarness();
    try {
      const { status } = await postUpload(h, {
        destination: "gdrive", name: "scan.bin", contentBase64: B64, documentText: "t", mimeType: "application/pdf",
      });
      assert.equal(status, 200);
      const meta = lastReceipt(h).body.meta as Record<string, unknown>;
      assert.equal((meta["binary"] as Record<string, unknown>)["mimeType"], "application/pdf");
    } finally {
      await h.close();
    }
  });

  it("body over the generic 1MB cap but within the upload cap → accepted (body cap scales for upload_document)", async () => {
    const bigBytes = Buffer.alloc(1_200_000, 65); // 1.2 MB of "A" → 1.6 MB base64
    const h = await startHarness();
    try {
      const { status, json } = await postUpload(h, {
        destination: "gdrive", name: "big.docx", contentBase64: bigBytes.toString("base64"), documentText: "big but reviewable",
      });
      assert.equal(status, 200, `expected 200; got ${status}: ${JSON.stringify(json)}`);
      const meta = lastReceipt(h).body.meta as Record<string, unknown>;
      assert.equal((meta["binary"] as Record<string, unknown>)["bytes"], 1_200_000);
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Edge: fixed-contract 400s
// ---------------------------------------------------------------------------

describe("binary upload — contract 400s", () => {
  it("content + contentBase64 both present → 400 mutually exclusive + error receipt; performer NOT called", async () => {
    let called = 0;
    const h = await startHarness({ performer: async () => { called++; return {}; } });
    try {
      const { status, json } = await postUpload(h, {
        destination: "gdrive", name: "f.docx", content: "text", contentBase64: B64, documentText: "t",
      });
      assert.equal(status, 400);
      assert.match(json["error"] as string, /mutually exclusive/);
      assert.equal(called, 0, "performer must NOT be called");
      assert.equal(lastReceipt(h).body.outcome, "error");
    } finally {
      await h.close();
    }
  });

  it("contentBase64 without documentText → 400 fail-closed + error receipt (also empty documentText)", async () => {
    const h = await startHarness();
    try {
      for (const payload of [
        { destination: "gdrive", name: "f.docx", contentBase64: B64 },
        { destination: "gdrive", name: "f.docx", contentBase64: B64, documentText: "" },
        { destination: "gdrive", name: "f.docx", contentBase64: B64, documentText: 42 },
      ]) {
        const { status, json } = await postUpload(h, payload);
        assert.equal(status, 400, `payload ${JSON.stringify(Object.keys(payload))} must 400`);
        assert.match(json["error"] as string, /documentText/);
        assert.equal(lastReceipt(h).body.outcome, "error");
      }
    } finally {
      await h.close();
    }
  });

  it("non-string or empty contentBase64 → 400 + error receipt", async () => {
    const h = await startHarness();
    try {
      for (const contentBase64 of [42, "", null, ["UEsDBA=="]]) {
        const { status } = await postUpload(h, { destination: "gdrive", name: "f.docx", contentBase64, documentText: "t" });
        assert.equal(status, 400, `contentBase64=${JSON.stringify(contentBase64)} must 400`);
        assert.equal(lastReceipt(h).body.outcome, "error");
      }
    } finally {
      await h.close();
    }
  });

  it("invalid base64 → 400 invalid_base64 + error receipt", async () => {
    const h = await startHarness();
    try {
      const { status, json } = await postUpload(h, {
        destination: "gdrive", name: "f.docx", contentBase64: "!!not/valid base64!!", documentText: "t",
      });
      assert.equal(status, 400);
      assert.match(json["error"] as string, /invalid_base64/);
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "error");
      assert.equal((last.body.meta as Record<string, unknown>)["error"], "invalid_base64");
    } finally {
      await h.close();
    }
  });

  it("invalid mimeType → 400 + error receipt (header-injection guard)", async () => {
    const h = await startHarness();
    try {
      const { status, json } = await postUpload(h, {
        destination: "gdrive", name: "f.docx", contentBase64: B64, documentText: "t", mimeType: "bad mime\r\nX-Evil: 1",
      });
      assert.equal(status, 400);
      assert.match(json["error"] as string, /mimeType/);
      assert.equal(lastReceipt(h).body.outcome, "error");
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Edge: 413 oversized
// ---------------------------------------------------------------------------

describe("binary upload — decoded-size cap", () => {
  it("decoded bytes over maxUploadBytes → 413 upload_too_large + error receipt; performer NOT called", async () => {
    let called = 0;
    const h = await startHarness({ maxUploadBytes: 16, performer: async () => { called++; return {}; } });
    try {
      const { status, json } = await postUpload(h, {
        destination: "gdrive", name: "f.docx", contentBase64: B64, documentText: "t", // BYTES.length = 33 > 16
      });
      assert.equal(status, 413);
      assert.match(json["error"] as string, /upload_too_large/);
      assert.equal(called, 0);
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "error");
      assert.equal((last.body.meta as Record<string, unknown>)["error"], "upload_too_large");
    } finally {
      await h.close();
    }
  });

  it("decoded bytes exactly at maxUploadBytes → accepted", async () => {
    const h = await startHarness({ maxUploadBytes: BYTES.length });
    try {
      const { status } = await postUpload(h, {
        destination: "gdrive", name: "f.docx", contentBase64: B64, documentText: "t",
      });
      assert.equal(status, 200);
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Failure/security: notion + binary through the pipeline (real performer)
// ---------------------------------------------------------------------------

describe("binary upload — notion destination", () => {
  it("notion + contentBase64 → 502 unsupported_binary_destination + error receipt; vendor never called", async () => {
    const { buildPerformers } = await import("./connectors.ts");
    let vendorCalled = 0;
    const countingFetch = (async () => {
      vendorCalled++;
      return new Response(JSON.stringify({ id: "nope" }), { status: 200 });
    }) as unknown as typeof fetch;
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, countingFetch);
    const h = await startHarness({ performer: performers["upload_document"] });
    try {
      const { status, json } = await postUpload(h, {
        destination: "notion", name: "n.docx", contentBase64: B64, documentText: "t", parentPageId: "pp-1",
      });
      assert.equal(status, 502);
      assert.match(json["error"] as string, /unsupported_binary_destination/);
      assert.equal(vendorCalled, 0, "notion API must never receive binary bytes");
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "error");
      assert.match((last.body.meta as Record<string, unknown>)["error"] as string, /unsupported_binary_destination/);
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Task 4.4 (server surface): a token-refresh failure inside a REAL performer
// is surfaced as 502 + error receipt — and the vendor API is never reached.
// ---------------------------------------------------------------------------

describe("token refresh failure through the egress pipeline", () => {
  it("gdrive upload with failing OAuth exchange → 502 credential_refresh_failed + error receipt; no secrets in ledger", async () => {
    const { buildPerformers } = await import("./connectors.ts");
    let vendorCalled = 0;
    const failingExchangeFetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://oauth2.googleapis.com/token")) {
        return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
      }
      vendorCalled++;
      return new Response(JSON.stringify({ id: "nope" }), { status: 200 });
    }) as unknown as typeof fetch;

    const performers = buildPerformers(
      { GDRIVE_CLIENT_ID: "cid", GDRIVE_CLIENT_SECRET: "csec-SECRET", GDRIVE_REFRESH_TOKEN: "rt-SECRET" },
      failingExchangeFetch,
    );
    const h = await startHarness({ performer: performers["upload_document"] });
    try {
      const { status, json } = await postUpload(h, { destination: "gdrive", name: "d.txt", content: "text body" });
      assert.equal(status, 502);
      assert.match(json["error"] as string, /credential_refresh_failed/);
      assert.equal(vendorCalled, 0, "vendor API must never be called after a failed exchange");
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "error");
      assert.match((last.body.meta as Record<string, unknown>)["error"] as string, /credential_refresh_failed/);
      const ledger = fs.readFileSync(h.receiptsPath, "utf8");
      assert.ok(!ledger.includes("rt-SECRET"), "refresh token must never be receipted");
      assert.ok(!ledger.includes("csec-SECRET"), "client secret must never be receipted");
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Failure/security: citation gate runs on documentText — no binary bypass
// ---------------------------------------------------------------------------

describe("binary upload — citation gate on documentText", () => {
  it("citation-bearing documentText with no registered verification → 403 citation_gate (binary path does NOT bypass); performer NOT called", async () => {
    let called = 0;
    const h = await startHarness({ policy: DEFAULT_POLICY, performer: async () => { called++; return {}; } });
    try {
      const { status, json } = await postUpload(
        h,
        { destination: "gdrive", name: "brief.docx", contentBase64: B64, documentText: "Plaintiff cites 410 U.S. 113 in support." },
        { agentId: "agent-1", issueId: "POS-BIN-2" },
      );
      assert.equal(status, 403, `expected 403 citation gate; got ${status}: ${JSON.stringify(json)}`);
      assert.match(json["reason"] as string, /citation_gate/);
      assert.equal(called, 0, "performer must NOT be called on a citation-gate block");
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "blocked");
      assert.equal((last.body.meta as Record<string, unknown>)["reason"], "citation_gate_unverified");
    } finally {
      await h.close();
    }
  });

  it("registered, passing verification on documentText → binary upload proceeds (200)", async () => {
    const h = await startHarness({ policy: DEFAULT_POLICY });
    try {
      const doc = "Plaintiff cites 410 U.S. 113 in support.";
      const reg = await fetch(`${h.baseUrl}/quality/citation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          document: doc,
          rows: [{ citation: "410 U.S. 113", match: "Yes" }],
          meta: { agentId: "agent-1", issueId: "POS-BIN-3" },
        }),
      });
      assert.equal(reg.status, 200);
      const { status } = await postUpload(h, {
        destination: "gdrive", name: "brief.docx", contentBase64: B64, documentText: doc,
      });
      assert.equal(status, 200);
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Contract 400: whitespace-only documentText is not reviewable text
// ---------------------------------------------------------------------------

describe("binary upload — whitespace-only documentText", () => {
  it("documentText of only whitespace → 400 fail-closed + error receipt", async () => {
    const h = await startHarness();
    try {
      for (const documentText of ["  ", "\t\n", "   \t  "]) {
        const { status, json } = await postUpload(h, {
          destination: "gdrive", name: "f.docx", contentBase64: B64, documentText,
        });
        assert.equal(status, 400, `documentText=${JSON.stringify(documentText)} must 400`);
        assert.match(json["error"] as string, /documentText/);
        assert.equal(lastReceipt(h).body.outcome, "error");
      }
    } finally {
      await h.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Security: human-gate approval is pinned to the FULL payload, not just bytes.
// A binary upload's human approval must not be replayable with the SAME bytes
// but a DIFFERENT destination/folderId/name/documentText (bait-and-switch).
// The RECEIPT sha stays the decoded-bytes sha throughout (audit invariant).
// ---------------------------------------------------------------------------

const POLICY_HUMAN_GATE: Policy = {
  ...DEFAULT_POLICY,
  boundaries: { ...DEFAULT_POLICY.boundaries, THIRD_PARTY_EGRESS: "human" },
  citationGate: { boundaries: [], requireAuthorityProvenance: false },
};

function makeFakeClient(approvals: Map<string, ApprovalRecord>): PaperclipClient {
  let nextId = 1;
  return {
    async createApproval(input: { requestedByAgentId?: string; issueIds?: string[]; payload: Record<string, unknown> }) {
      const id = `approval-${nextId++}`;
      approvals.set(id, { id, status: "pending", payload: { ...input.payload } });
      return { id };
    },
    async getApproval(id: string) {
      const r = approvals.get(id);
      if (!r) throw new Error(`unknown approval ${id}`);
      return r;
    },
    async postIssueComment() {
      // no-op for tests
    },
    async linkIssueApproval() {
      // no-op for tests
    },
  } as unknown as PaperclipClient;
}

describe("binary upload — human gate approval pinning (full payload)", () => {
  it("(a) re-entry with IDENTICAL full payload → approved; performed; receipt sha = decoded-bytes sha", async () => {
    const approvals = new Map<string, ApprovalRecord>();
    let called = 0;
    const h = await startHarness({
      policy: POLICY_HUMAN_GATE,
      client: makeFakeClient(approvals),
      performer: async () => { called++; return { id: "vend-hg", webUrl: "https://vendor/f/hg" }; },
    });
    try {
      const payload = {
        destination: "gdrive", name: "brief.docx", folderId: "folderA",
        contentBase64: B64, documentText: "reviewable text T",
      };

      // First call: no approvalId → 202 pending, performer NOT called.
      const first = await postUpload(h, payload, { agentId: "agent-1", issueId: "POS-HG-1" });
      assert.equal(first.status, 202, `first call must be 202; got ${JSON.stringify(first.json)}`);
      const approvalId = first.json["approvalId"] as string;
      assert.ok(approvalId, "must return an approvalId");
      assert.equal(called, 0, "performer must NOT be called on first (pending) call");
      // (c) first-call (pending) receipt sha = decoded-bytes sha
      assert.equal(lastReceipt(h).body.payloadSha256, BYTES_SHA);

      // Human approves in the dashboard.
      approvals.get(approvalId)!.status = "approved";

      // Re-entry with the IDENTICAL full payload → proceeds.
      const second = await postUpload(h, payload, { agentId: "agent-1", issueId: "POS-HG-1", approvalId });
      assert.equal(second.status, 200, `re-entry must be 200; got ${JSON.stringify(second.json)}`);
      assert.equal(called, 1, "performer must be called once on approved re-entry");
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "performed");
      // (c) performed receipt sha still = decoded-bytes sha
      assert.equal(last.body.payloadSha256, BYTES_SHA);
    } finally {
      await h.close();
    }
  });

  it("(b) re-entry with SAME bytes but DIFFERENT folderId → blocked bait_and_switch; performer not called; receipt sha = decoded-bytes sha", async () => {
    const approvals = new Map<string, ApprovalRecord>();
    let called = 0;
    const h = await startHarness({
      policy: POLICY_HUMAN_GATE,
      client: makeFakeClient(approvals),
      performer: async () => { called++; return {}; },
    });
    try {
      const approvedPayload = {
        destination: "gdrive", name: "brief.docx", folderId: "folderA",
        contentBase64: B64, documentText: "reviewable text T",
      };

      const first = await postUpload(h, approvedPayload, { agentId: "agent-1", issueId: "POS-HG-2" });
      assert.equal(first.status, 202);
      const approvalId = first.json["approvalId"] as string;
      approvals.get(approvalId)!.status = "approved";

      // SAME bytes, DIFFERENT destination folder → must be rejected.
      const swapped = { ...approvedPayload, folderId: "folderB" };
      const second = await postUpload(h, swapped, { agentId: "agent-1", issueId: "POS-HG-2", approvalId });
      assert.equal(second.status, 403, `bait-and-switch must be 403; got ${JSON.stringify(second.json)}`);
      assert.match(String(second.json["reason"]), /bait_and_switch/);
      assert.equal(called, 0, "performer must NOT be called on a bait-and-switch");
      const last = lastReceipt(h);
      assert.equal(last.body.outcome, "blocked");
      // (c) even the blocked receipt sha = decoded-bytes sha (bytes unchanged)
      assert.equal(last.body.payloadSha256, BYTES_SHA);
    } finally {
      await h.close();
    }
  });

  it("(b') re-entry with SAME bytes but DIFFERENT documentText → blocked bait_and_switch", async () => {
    const approvals = new Map<string, ApprovalRecord>();
    let called = 0;
    const h = await startHarness({
      policy: POLICY_HUMAN_GATE,
      client: makeFakeClient(approvals),
      performer: async () => { called++; return {}; },
    });
    try {
      const approvedPayload = {
        destination: "gdrive", name: "brief.docx", folderId: "folderA",
        contentBase64: B64, documentText: "reviewable text T",
      };

      const first = await postUpload(h, approvedPayload, { agentId: "agent-1", issueId: "POS-HG-3" });
      assert.equal(first.status, 202);
      const approvalId = first.json["approvalId"] as string;
      approvals.get(approvalId)!.status = "approved";

      const swapped = { ...approvedPayload, documentText: "totally different reviewable text" };
      const second = await postUpload(h, swapped, { agentId: "agent-1", issueId: "POS-HG-3", approvalId });
      assert.equal(second.status, 403, `bait-and-switch must be 403; got ${JSON.stringify(second.json)}`);
      assert.match(String(second.json["reason"]), /bait_and_switch/);
      assert.equal(called, 0, "performer must NOT be called on a bait-and-switch");
      assert.equal(lastReceipt(h).body.outcome, "blocked");
    } finally {
      await h.close();
    }
  });
});
