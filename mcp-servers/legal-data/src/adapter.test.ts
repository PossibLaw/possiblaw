// mcp-servers/legal-data/src/adapter.test.ts
//
// Tests for the PURE trust-adapter core. Zero network, zero OAuth: the upstream
// CourtListener MCP is replaced by a STUBBED UpstreamCaller that records what
// args it received and returns scripted (illustrative) results.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  proxyToolCall,
  sanitizeArgs,
  wrapWithProvenance,
  fingerprintText,
  createGateProvenanceReporter,
} from "./adapter.ts";
import { documentSha256 } from "./hash.ts";
import type { ProvenanceEnvelope, UpstreamCaller } from "./types.ts";

function fixture(name: string): unknown {
  const p = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(p, "utf8"));
}

const FIXED_NOW = "2026-06-26T12:00:00.000Z";

/** A recording stub: returns a scripted body and captures every (tool, args) call. */
function stubUpstream(body: unknown): {
  upstream: UpstreamCaller;
  calls: { tool: string; args: Record<string, unknown> }[];
} {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const upstream: UpstreamCaller = async (tool, args) => {
    calls.push({ tool, args });
    return body;
  };
  return { upstream, calls };
}

function isEnvelope(r: unknown): r is ProvenanceEnvelope {
  return (
    !!r &&
    typeof r === "object" &&
    (r as { source?: unknown }).source === "courtlistener" &&
    (r as { sha256?: unknown }).sha256 !== undefined
  );
}

// ---------------------------------------------------------------------------
// HAPPY: opinion-like upstream result -> stable envelope with extracted facets
// ---------------------------------------------------------------------------

test("HAPPY opinion-like upstream result -> envelope with stable sha256 + extracted decided_date, source_url, citation, payload preserved", async () => {
  const body = fixture("upstream-opinion-like.json");
  const { upstream, calls } = stubUpstream(body);

  const res = await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "abortion privacy" },
    tier: "standard",
    now: FIXED_NOW,
  });

  assert.ok(isEnvelope(res), `expected provenance envelope, got ${JSON.stringify(res)}`);
  const env = res as ProvenanceEnvelope;
  assert.equal(env.source, "courtlistener");
  assert.equal(env.retrieved_at, FIXED_NOW);
  // best-effort provenance extraction from common field names
  assert.equal(env.decided_date, "1973-01-22"); // from date_filed
  assert.equal(env.citation, "410 U.S. 113"); // from citation
  assert.equal(env.court, "Supreme Court of the United States"); // from court
  // absolute_url path resolved to a full CourtListener URL
  assert.equal(env.source_url, "https://www.courtlistener.com/opinion/108713/roe-v-wade/");

  // sha256 is well-formed and STABLE: documentSha256 over the primary text field.
  assert.match(env.sha256, /^[0-9a-f]{64}$/);
  const expected = documentSha256(fingerprintText(body));
  assert.equal(env.sha256, expected);

  // payload is preserved verbatim (the whole upstream result).
  assert.deepEqual(env.payload, body);

  // the stub was actually invoked once, with the tool name + args.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].tool, "search-cases");
});

test("HAPPY sha256 is deterministic across two calls of the same result", async () => {
  const body = fixture("upstream-opinion-like.json");
  const a = wrapWithProvenance(body, { now: FIXED_NOW });
  const b = wrapWithProvenance(body, { now: "2030-01-01T00:00:00.000Z" });
  assert.equal(a.sha256, b.sha256, "sha must be independent of retrieved_at");
});

test("HAPPY search-list result extracts provenance from the first hit", async () => {
  const body = fixture("upstream-search-result.json");
  const env = wrapWithProvenance(body, { now: FIXED_NOW });
  assert.equal(env.citation, "410 U.S. 113");
  assert.equal(env.source_url, "https://www.courtlistener.com/opinion/108713/roe-v-wade/");
  assert.match(env.sha256, /^[0-9a-f]{64}$/);
});

// ---------------------------------------------------------------------------
// EDGE: sanitization strips a client identifier; missing facets are omitted
// ---------------------------------------------------------------------------

test("EDGE confidential tier strips a client identifier from forwarded args BEFORE the upstream sees them", async () => {
  const { upstream, calls } = stubUpstream(fixture("upstream-opinion-like.json"));

  await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "ACME Inc. v. Smith indemnification dispute", court: "scotus" },
    tier: "confidential",
    now: FIXED_NOW,
  });

  assert.equal(calls.length, 1);
  const forwarded = calls[0].args;
  const forwardedQuery = String(forwarded["query"]);
  // the raw client identifier never reached the upstream caller
  assert.ok(!/ACME Inc\./.test(forwardedQuery), `client name leaked upstream: ${forwardedQuery}`);
  // neutral legal terms survive so the search stays useful
  assert.match(forwardedQuery, /indemnification/);
  // non-query args pass through untouched
  assert.equal(forwarded["court"], "scotus");
});

test("EDGE sanitizeArgs leaves standard-tier args byte-identical and never mutates input", () => {
  const input = { query: "ACME Inc. arbitration", court: "ca9" };
  const out = sanitizeArgs(input, "standard");
  assert.deepEqual(out, input);
  assert.notEqual(out, input, "must return a fresh object");
  // confidential mutation does not touch the caller's object
  const out2 = sanitizeArgs(input, "confidential");
  assert.equal(input.query, "ACME Inc. arbitration", "input must be unchanged");
  assert.ok(!/ACME Inc\./.test(String(out2.query)));
});

test("EDGE result MISSING provenance fields still gets a sha256 and OMITS absent facets (no fabrication)", async () => {
  const body = fixture("upstream-minimal-no-provenance.json");
  const { upstream } = stubUpstream(body);

  const res = await proxyToolCall(upstream, {
    toolName: "manage-alerts",
    args: {},
    tier: "standard",
    now: FIXED_NOW,
  });

  assert.ok(isEnvelope(res));
  const env = res as ProvenanceEnvelope;
  // sha is always present
  assert.match(env.sha256, /^[0-9a-f]{64}$/);
  // absent facets are OMITTED, not invented as null/empty/placeholder
  assert.ok(!("source_url" in env), "source_url must be omitted when absent");
  assert.ok(!("court" in env), "court must be omitted when absent");
  assert.ok(!("decided_date" in env), "decided_date must be omitted when absent");
  assert.ok(!("citation" in env), "citation must be omitted when absent");
  // payload still preserved
  assert.deepEqual(env.payload, body);
});

// ---------------------------------------------------------------------------
// FAILURE / SECURITY: upstream throws -> unavailable; identifier never forwarded
// ---------------------------------------------------------------------------

test("FAILURE upstream rejection -> structured unavailable, never a fabricated opinion, never throws", async () => {
  const upstream: UpstreamCaller = async () => {
    throw new Error("503 service unavailable");
  };
  const res = await proxyToolCall(upstream, {
    toolName: "lookup-citation",
    args: { cite: "410 U.S. 113" },
    tier: "standard",
    now: FIXED_NOW,
  });

  assert.equal((res as { status?: string }).status, "unavailable");
  assert.equal((res as { tool?: string }).tool, "lookup-citation");
  assert.match((res as { reason: string }).reason, /upstream|failed|unavailable/i);
  // it is NOT an envelope and carries NO fabricated provenance facets
  assert.ok(!isEnvelope(res));
  assert.equal((res as { decided_date?: unknown }).decided_date, undefined);
  assert.equal((res as { sha256?: unknown }).sha256, undefined);
});

test("FAILURE upstream timeout/abort -> unavailable with a timeout reason", async () => {
  const upstream: UpstreamCaller = async () => {
    throw Object.assign(new Error("network timeout"), { name: "AbortError" });
  };
  const res = await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "x" },
    tier: "standard",
    now: FIXED_NOW,
  });
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.match((res as { reason: string }).reason, /timeout|abort/i);
});

test("SECURITY a confidential query is NEVER forwarded containing the raw client identifier (even when upstream then fails)", async () => {
  const seen: { tool: string; args: Record<string, unknown> }[] = [];
  const upstream: UpstreamCaller = async (tool, args) => {
    seen.push({ tool, args });
    throw new Error("boom after receiving args");
  };

  const res = await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "Globex Holdings LLP merger antitrust review email jane@globex.com" },
    tier: "confidential",
    now: FIXED_NOW,
  });

  // upstream still received SANITIZED args before it failed
  assert.equal(seen.length, 1);
  const forwarded = String(seen[0].args["query"]);
  assert.ok(!/Globex Holdings LLP/.test(forwarded), `entity leaked: ${forwarded}`);
  assert.ok(!/jane@globex\.com/.test(forwarded), `email leaked: ${forwarded}`);
  assert.match(forwarded, /antitrust/);
  // and the failure is still a structured unavailable, never a fabricated opinion
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.ok(!isEnvelope(res));
});

test("SECURITY cite arguments receive the same privileged identifier sanitization as search queries", async () => {
  const { upstream, calls } = stubUpstream(fixture("upstream-opinion-like.json"));

  await proxyToolCall(upstream, {
    toolName: "get_citation",
    args: { cite: "Smith v. Jones docket 2024-CV-01234 standing" },
    tier: "privileged",
    now: FIXED_NOW,
  });

  assert.equal(calls.length, 1);
  const forwarded = String(calls[0].args["cite"]);
  assert.ok(!/Smith|Jones/.test(forwarded), `person caption leaked: ${forwarded}`);
  assert.ok(!/2024-CV-01234/.test(forwarded), `docket leaked: ${forwarded}`);
  assert.match(forwarded, /standing/);
});

// ---------------------------------------------------------------------------
// PROVENANCE REPORTING: best-effort registration of retrieved authorities
// ---------------------------------------------------------------------------

test("PROVENANCE opinion-like retrieval invokes the reporter with the envelope's {citation, sha256}", async () => {
  const body = fixture("upstream-opinion-like.json");
  const { upstream } = stubUpstream(body);
  const reported: Array<{ citation: string; sha256: string; source: string; sourceUrl?: string; retrievedAt?: string }> = [];

  const res = await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "abortion privacy" },
    tier: "standard",
    now: FIXED_NOW,
    reportProvenance: async (a) => { reported.push(a); },
  });

  assert.ok(isEnvelope(res));
  const env = res as ProvenanceEnvelope;
  assert.equal(reported.length, 1, "reporter must be invoked exactly once for a cited authority");
  assert.equal(reported[0].citation, env.citation);
  assert.equal(reported[0].sha256, env.sha256);
  assert.equal(reported[0].source, "courtlistener");
  assert.equal(reported[0].retrievedAt, FIXED_NOW);
});

test("PROVENANCE a result with NO citation does not over-report", async () => {
  const body = fixture("upstream-minimal-no-provenance.json");
  const { upstream } = stubUpstream(body);
  let calls = 0;

  const res = await proxyToolCall(upstream, {
    toolName: "manage-alerts",
    args: {},
    tier: "standard",
    now: FIXED_NOW,
    reportProvenance: async () => { calls++; },
  });

  assert.ok(isEnvelope(res));
  assert.equal((res as ProvenanceEnvelope).citation, undefined);
  assert.equal(calls, 0, "no citation → reporter must NOT be called");
});

test("PROVENANCE a reporter that THROWS does not fail the tool call (best-effort)", async () => {
  const body = fixture("upstream-opinion-like.json");
  const { upstream } = stubUpstream(body);

  const res = await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "x" },
    tier: "standard",
    now: FIXED_NOW,
    reportProvenance: async () => { throw new Error("gate is down"); },
  });

  // The tool call STILL returns a valid envelope — reporting failure swallowed.
  assert.ok(isEnvelope(res), "tool call must succeed even when the reporter throws");
  assert.match((res as ProvenanceEnvelope).sha256, /^[0-9a-f]{64}$/);
});

test("PROVENANCE no reporter injected → tool call behaves exactly as before", async () => {
  const body = fixture("upstream-opinion-like.json");
  const { upstream } = stubUpstream(body);
  const res = await proxyToolCall(upstream, {
    toolName: "search-cases",
    args: { query: "x" },
    tier: "standard",
    now: FIXED_NOW,
  });
  assert.ok(isEnvelope(res));
});

test("gate provenance reporter forwards the Paperclip agent key", async () => {
  const calls: Array<{ url: string; authorization: string | null }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    calls.push({ url: String(input), authorization: headers.get("authorization") });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const report = createGateProvenanceReporter(
    "http://gate:3801",
    "agent-secret",
    fakeFetch as typeof fetch,
  );
  await report({
    citation: "410 U.S. 113",
    sha256: "a".repeat(64),
    source: "courtlistener",
  });
  assert.deepEqual(calls, [{
    url: "http://gate:3801/quality/authority",
    authorization: "Bearer agent-secret",
  }]);
});
