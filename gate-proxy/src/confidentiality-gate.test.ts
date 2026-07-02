// gate-proxy/src/confidentiality-gate.test.ts
// Integration tests for Task H:
//   1a. /matters/classification routes + receipt-derived raise-only floor at egress
//   1b. fail-closed unspecified-confidentiality default for query_external_model
//   2.  tier-floor useLocal receipt honesty (routedLocal only when genuinely local)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReceiptChain } from "./receipts.ts";
import { DEFAULT_POLICY } from "./policy.ts";
import type { Policy } from "./policy.ts";
import type { Performer, PerformerRegistry } from "./connectors.ts";
import { createGateServer, type GateServerDeps } from "./server.ts";
import { CitationRegistry } from "./quality/citation-registry.ts";
import { AuthorityRegistry } from "./quality/authority-registry.ts";

// ---------------------------------------------------------------------------
// Harness (mirrors server.test.ts startServer — local to keep that file's
// baseline edits minimal)
// ---------------------------------------------------------------------------

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "gate-conf-test-"));
}

/** DEFAULT_POLICY minus the citation gate (these tests do not register citations). */
const POLICY_NO_CITATION_GATE: Policy = {
  ...DEFAULT_POLICY,
  citationGate: { boundaries: [], requireAuthorityProvenance: false },
};

async function startServer(
  deps: Omit<GateServerDeps, "citationRegistry" | "authorityRegistry"> & {
    citationRegistry?: CitationRegistry;
    authorityRegistry?: AuthorityRegistry;
  },
): Promise<{ server: http.Server; baseUrl: string; close: () => Promise<void> }> {
  const citationRegistry = deps.citationRegistry ?? new CitationRegistry(deps.receipts);
  const authorityRegistry = deps.authorityRegistry ?? new AuthorityRegistry(deps.receipts);
  const server = createGateServer({ ...deps, citationRegistry, authorityRegistry });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { address: string; port: number };
  const baseUrl = `http://${addr.address}:${addr.port}`;
  const close = () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  return { server, baseUrl, close };
}

async function postJson(
  baseUrl: string,
  route: string,
  body: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(`${baseUrl}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

async function postEgress(
  baseUrl: string,
  tool: string,
  body: Record<string, unknown>,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return postJson(baseUrl, `/egress/${tool}`, JSON.stringify(body));
}

async function registerMatter(
  baseUrl: string,
  issueId: string,
  tier: string,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return postJson(baseUrl, "/matters/classification", JSON.stringify({ issueId, tier }));
}

function lastReceipt(receipts: ReceiptChain) {
  const entries = receipts.entries();
  return entries[entries.length - 1];
}

// ---------------------------------------------------------------------------
// 1a routes — POST/GET /matters/classification
// ---------------------------------------------------------------------------

describe("/matters/classification routes", () => {
  it("POST registers a matter tier, appends a receipt; GET reads it back", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });

    const { status, json } = await registerMatter(baseUrl, "POS-77", "privileged");
    assert.equal(status, 200);
    assert.equal(json["registered"], true);
    assert.equal(json["issueId"], "POS-77");
    assert.equal(json["requestedTier"], "privileged");
    assert.equal(json["effectiveTier"], "privileged");

    const last = lastReceipt(receipts);
    assert.equal(last.body.kind, "quality");
    assert.equal(last.body.tool, "matter_classification");
    assert.equal(last.body.outcome, "performed");
    assert.equal(last.body.issueId, "POS-77");
    assert.deepEqual(last.body.meta, { tier: "privileged", effectiveTier: "privileged" });

    const readRes = await fetch(`${baseUrl}/matters/classification?issueId=POS-77`);
    assert.equal(readRes.status, 200);
    const read = (await readRes.json()) as Record<string, unknown>;
    assert.equal(read["issueId"], "POS-77");
    assert.equal(read["tier"], "privileged");

    await close();
  });

  it("GET for an unregistered matter → tier null", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });
    const res = await fetch(`${baseUrl}/matters/classification?issueId=POS-NONE`);
    assert.equal(res.status, 200);
    const j = (await res.json()) as Record<string, unknown>;
    assert.equal(j["tier"], null);
    await close();
  });

  it("GET without/with invalid issueId → 400", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });
    const noParam = await fetch(`${baseUrl}/matters/classification`);
    assert.equal(noParam.status, 400);
    const badParam = await fetch(`${baseUrl}/matters/classification?issueId=${encodeURIComponent("../etc")}`);
    assert.equal(badParam.status, 400);
    await close();
  });

  it("POST with invalid tier → 400 + error receipt; invalid issueId → 400; bad JSON → 400", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });

    const badTier = await registerMatter(baseUrl, "POS-1", "top-secret");
    assert.equal(badTier.status, 400);
    let last = lastReceipt(receipts);
    assert.equal(last.body.tool, "matter_classification");
    assert.equal(last.body.outcome, "error");

    const badId = await registerMatter(baseUrl, "no slashes/../allowed", "standard");
    assert.equal(badId.status, 400);

    const badJson = await postJson(baseUrl, "/matters/classification", "NOT JSON {{{");
    assert.equal(badJson.status, 400);
    last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "error");

    await close();
  });

  it("raise-only over HTTP: a downgrade POST does not lower the floor", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers: {}, localModelAvailable: false,
    });

    await registerMatter(baseUrl, "POS-88", "privileged");
    const downgrade = await registerMatter(baseUrl, "POS-88", "standard");
    assert.equal(downgrade.status, 200);
    assert.equal(downgrade.json["requestedTier"], "standard");
    assert.equal(downgrade.json["effectiveTier"], "privileged", "floor must not lower");

    const res = await fetch(`${baseUrl}/matters/classification?issueId=POS-88`);
    const j = (await res.json()) as Record<string, unknown>;
    assert.equal(j["tier"], "privileged");

    await close();
  });
});

// ---------------------------------------------------------------------------
// 1a at egress — the registered floor beats a downgraded self-report
// ---------------------------------------------------------------------------

describe("confidentiality floor at egress", () => {
  it("happy: registered privileged + request claims standard + entities → anonymize path, floor marker receipted", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    let captured: { prompt: string | null } = { prompt: null };
    const performers: PerformerRegistry = {
      query_external_model: (async (req) => {
        captured.prompt = (req.payload as Record<string, unknown>)["prompt"] as string;
        return { content: "answer" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    await registerMatter(baseUrl, "POS-FLOOR-1", "privileged");

    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Acme Corp merger strategy." },
      meta: { issueId: "POS-FLOOR-1", confidentiality: "standard", entities: ["Acme Corp"] },
    });

    // Without the floor, "standard" would classify null → allow (unmasked).
    // The floor raises it to privileged → anonymize path.
    assert.equal(status, 200);
    assert.equal(json["decision"], "anonymize");
    assert.ok(captured.prompt !== null && !captured.prompt.includes("Acme Corp"),
      `performer must receive a MASKED prompt, got: ${captured.prompt}`);

    const last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "anonymized_performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["claimedConfidentiality"], "standard");
    assert.equal(meta["effectiveConfidentiality"], "privileged");
    assert.equal(meta["confidentialityFloorApplied"], true);

    // Payload text never in receipts.
    assert.ok(!fs.readFileSync(filePath, "utf8").includes("Acme Corp"));

    await close();
  });

  it("happy/fail-closed: registered privileged + claims standard + NO entities → 403 blocked, floor marker on blocked receipt", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let called = 0;
    const performers: PerformerRegistry = {
      query_external_model: (async () => { called++; return {}; }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    await registerMatter(baseUrl, "POS-FLOOR-2", "privileged");

    const { status } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Privileged facts." },
      meta: { issueId: "POS-FLOOR-2", confidentiality: "standard" },
    });

    assert.equal(status, 403);
    assert.equal(called, 0, "performer must NOT be called");
    const last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "blocked");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["claimedConfidentiality"], "standard");
    assert.equal(meta["effectiveConfidentiality"], "privileged");
    assert.equal(meta["confidentialityFloorApplied"], true);

    await close();
  });

  it("edge: request may RAISE above a standard-registered floor (privileged claim honored, no floor marker)", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let captured: string | null = null;
    const performers: PerformerRegistry = {
      query_external_model: (async (req) => {
        captured = (req.payload as Record<string, unknown>)["prompt"] as string;
        return { content: "ok" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    await registerMatter(baseUrl, "POS-RAISE-1", "standard");

    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Acme Corp facts." },
      meta: { issueId: "POS-RAISE-1", confidentiality: "privileged", entities: ["Acme Corp"] },
    });

    assert.equal(status, 200);
    assert.equal(json["decision"], "anonymize", "raise must be honored → anonymize path");
    assert.ok(captured !== null && !(captured as string).includes("Acme Corp"));

    const last = lastReceipt(receipts);
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["claimedConfidentiality"], "privileged");
    assert.equal(meta["effectiveConfidentiality"], undefined, "no effective field when it equals the claim");
    assert.equal(meta["confidentialityFloorApplied"], undefined, "floor did not raise anything");

    await close();
  });

  it("edge: registered standard floor fills in an unspecified label (no fail-closed default needed)", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let captured: string | null = null;
    const performers: PerformerRegistry = {
      query_external_model: (async (req) => {
        captured = (req.payload as Record<string, unknown>)["prompt"] as string;
        return { content: "ok" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    await registerMatter(baseUrl, "POS-STD-1", "standard");

    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Public research question." },
      meta: { issueId: "POS-STD-1" }, // no confidentiality
    });

    // Registered standard → effective standard → boundary null → allow, unmasked.
    assert.equal(status, 200);
    assert.equal(json["decision"], "allow");
    assert.equal(captured, "Public research question.");

    const last = lastReceipt(receipts);
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["claimedConfidentiality"], "unspecified");
    assert.equal(meta["effectiveConfidentiality"], "standard");
    assert.equal(meta["confidentialityFloorApplied"], true);

    await close();
  });
});

// ---------------------------------------------------------------------------
// 1b — fail-closed default for query_external_model
// ---------------------------------------------------------------------------

describe("unspecified-confidentiality fail-closed default (query_external_model)", () => {
  it("security: no confidentiality + no registration + no entities → treated confidential → 403 blocked", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let called = 0;
    const performers: PerformerRegistry = {
      query_external_model: (async () => { called++; return {}; }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Client X's privileged strategy." },
      meta: { issueId: "POS-UNREG-1" },
    });

    assert.equal(status, 403, "unlabeled secondary-model egress must fail closed");
    assert.equal(called, 0, "performer must NOT be called");
    const last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "blocked");
    assert.equal(last.body.boundary, "CONFIDENTIAL_TO_CLOUD");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["claimedConfidentiality"], "unspecified");
    assert.equal(meta["effectiveConfidentiality"], "confidential");
    assert.equal(meta["confidentialityFloorApplied"], undefined, "default is not the floor marker");

    await close();
  });

  it("security: an unrecognized confidentiality value is treated as unspecified (fail-closed)", async () => {
    const receiptsPath = path.join(tmpDir(), "r.jsonl");
    const receipts = new ReceiptChain(receiptsPath);
    let called = 0;
    const performers: PerformerRegistry = {
      query_external_model: (async () => { called++; return {}; }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    const { status } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Sensitive." },
      meta: { confidentiality: "totally-not-a-tier" as unknown as "standard" },
    });

    assert.equal(status, 403);
    assert.equal(called, 0);

    // Receipts carry enums only: the raw invalid string must never enter the chain.
    const raw = fs.readFileSync(receiptsPath, "utf8");
    assert.ok(!raw.includes("totally-not-a-tier"));
    assert.ok(raw.includes('"claimedConfidentiality":"invalid"'));

    await close();
  });

  it("with entities the default still routes through the anonymizer (masked, not blocked)", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let captured: string | null = null;
    const performers: PerformerRegistry = {
      query_external_model: (async (req) => {
        captured = (req.payload as Record<string, unknown>)["prompt"] as string;
        return { content: "ok" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Acme Corp asks a question." },
      meta: { entities: ["Acme Corp"] }, // no confidentiality
    });

    assert.equal(status, 200);
    assert.equal(json["decision"], "anonymize");
    assert.ok(captured !== null && !(captured as string).includes("Acme Corp"));

    await close();
  });

  it('back-compat: knob set to "standard" restores unspecified → allow (unmasked)', async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let captured: string | null = null;
    const performers: PerformerRegistry = {
      query_external_model: (async (req) => {
        captured = (req.payload as Record<string, unknown>)["prompt"] as string;
        return { content: "ok" };
      }) as Performer,
    };
    const legacyPolicy: Policy = {
      ...DEFAULT_POLICY,
      unspecifiedConfidentialityDefault: "standard",
    };
    const { baseUrl, close } = await startServer({
      policy: legacyPolicy, receipts, client: null, performers, localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Plain question." },
    });

    assert.equal(status, 200);
    assert.equal(json["decision"], "allow");
    assert.equal(captured, "Plain question.");
    const last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["claimedConfidentiality"], "unspecified");
    assert.equal(meta["effectiveConfidentiality"], undefined, "legacy mode records no effective value");

    await close();
  });

  it("standard-labeled traffic is unchanged regardless of the knob (allow, unmasked)", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let captured: string | null = null;
    const performers: PerformerRegistry = {
      query_external_model: (async (req) => {
        captured = (req.payload as Record<string, unknown>)["prompt"] as string;
        return { content: "ok" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: DEFAULT_POLICY, receipts, client: null, performers, localModelAvailable: false,
    });

    const { status, json } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Plain question." },
      meta: { confidentiality: "standard" },
    });

    assert.equal(status, 200);
    assert.equal(json["decision"], "allow");
    assert.equal(captured, "Plain question.");

    await close();
  });
});

// ---------------------------------------------------------------------------
// 2 — tier-floor useLocal receipt honesty
// ---------------------------------------------------------------------------

describe("tier-floor useLocal honesty", () => {
  /** Custom policy: third-party egress → anonymize (the pre-existing dishonest path). */
  const ANONYMIZE_TPE_POLICY: Policy = {
    ...DEFAULT_POLICY,
    boundaries: { ...DEFAULT_POLICY.boundaries, THIRD_PARTY_EGRESS: "anonymize" },
    citationGate: { boundaries: [], requireAuthorityProvenance: false },
  };

  it("upload_document + anonymize policy + confidential + localAvailable → payload MASKED, receipt has NO routedLocal", async () => {
    const dir = tmpDir();
    const filePath = path.join(dir, "r.jsonl");
    const receipts = new ReceiptChain(filePath);
    const captured: { prompt: string | null; useLocal: boolean | undefined } = {
      prompt: null, useLocal: undefined,
    };
    const performers: PerformerRegistry = {
      upload_document: (async (req, opts) => {
        captured.prompt = (req.payload as Record<string, unknown>)["prompt"] as string;
        captured.useLocal = opts.useLocal;
        return { id: "file-1" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: ANONYMIZE_TPE_POLICY, receipts, client: null, performers, localModelAvailable: true,
    });

    const { status, json } = await postEgress(baseUrl, "upload_document", {
      payload: { destination: "gdrive", name: "n.md", prompt: "Acme Corp brief." },
      meta: { confidentiality: "confidential", entities: ["Acme Corp"] },
    });

    assert.equal(status, 200);
    assert.equal(json["decision"], "anonymize");
    assert.ok(captured.prompt !== null && !captured.prompt.includes("Acme Corp"),
      `upload performer must receive the MASKED payload, got: ${captured.prompt}`);
    assert.ok(captured.useLocal !== true, "upload performer must never be told useLocal");

    const last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "anonymized_performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["routedLocal"], undefined, "receipt must NOT claim routedLocal for a vendor upload");
    assert.ok(!fs.readFileSync(filePath, "utf8").includes("Acme Corp"));

    await close();
  });

  it("upload_document + anonymize policy + confidential + localAvailable + unmaskable payload → 403 blocked, no routedLocal anywhere", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    let called = 0;
    const performers: PerformerRegistry = {
      upload_document: (async () => { called++; return { id: "nope" }; }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: ANONYMIZE_TPE_POLICY, receipts, client: null, performers, localModelAvailable: true,
    });

    // No 'prompt' string → the anonymizer has no supported surface → block
    // (pre-fix this shipped the UNMASKED content to the vendor with routedLocal:true).
    const { status, json } = await postEgress(baseUrl, "upload_document", {
      payload: { destination: "gdrive", name: "n.md", content: "Acme Corp secret brief." },
      meta: { confidentiality: "confidential", entities: ["Acme Corp"] },
    });

    assert.equal(status, 403);
    assert.equal(json["decision"], "block");
    assert.equal(called, 0, "performer must NOT be called with the unmasked payload");

    for (const entry of receipts.entries()) {
      const meta = (entry.body.meta ?? {}) as Record<string, unknown>;
      assert.notEqual(meta["routedLocal"], true, "no receipt may claim routedLocal");
    }
    assert.equal(lastReceipt(receipts).body.outcome, "blocked");

    await close();
  });

  it("query_external_model same setup → genuinely routed local, routedLocal:true legitimate", async () => {
    const receipts = new ReceiptChain(path.join(tmpDir(), "r.jsonl"));
    const captured: { prompt: string | null; useLocal: boolean | undefined } = {
      prompt: null, useLocal: undefined,
    };
    const performers: PerformerRegistry = {
      query_external_model: (async (req, opts) => {
        captured.prompt = (req.payload as Record<string, unknown>)["prompt"] as string;
        captured.useLocal = opts.useLocal;
        return { content: "local answer" };
      }) as Performer,
    };
    const { baseUrl, close } = await startServer({
      policy: ANONYMIZE_TPE_POLICY, receipts, client: null, performers, localModelAvailable: true,
    });

    const { status } = await postEgress(baseUrl, "query_external_model", {
      payload: { prompt: "Acme Corp question." },
      meta: { confidentiality: "confidential", entities: ["Acme Corp"] },
    });

    assert.equal(status, 200);
    assert.equal(captured.useLocal, true, "the local-capable performer must be told useLocal");
    assert.ok(captured.prompt?.includes("Acme Corp"), "local routing keeps the prompt unmasked");

    const last = lastReceipt(receipts);
    assert.equal(last.body.outcome, "performed");
    const meta = last.body.meta as Record<string, unknown>;
    assert.equal(meta["routedLocal"], true, "routedLocal is legitimate when the local route was used");

    await close();
  });
});
