// mcp-servers/legal-data/src/client.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LegalDataClient } from "./client.ts";
import { MemoryCache } from "./cache.ts";
import { documentSha256 } from "./hash.ts";
import type { FetchFn, FetchResponse, ProvenanceEnvelope } from "./types.ts";

function fixture(name: string): unknown {
  const p = fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
  return JSON.parse(readFileSync(p, "utf8"));
}

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Build a fetchFn that records calls and returns a scripted body per URL substring. */
function stubFetch(routes: Array<{ match: string; body: unknown; status?: number }>): {
  fetchFn: FetchFn;
  calls: { url: string; init?: unknown }[];
} {
  const calls: { url: string; init?: unknown }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    for (const r of routes) {
      if (url.includes(r.match)) return jsonResponse(r.body, r.status ?? 200);
    }
    throw new Error(`no stub route matched: ${url}`);
  };
  return { fetchFn, calls };
}

const FIXED_NOW = () => new Date("2026-06-26T12:00:00.000Z");

function isEnvelope(r: unknown): r is ProvenanceEnvelope {
  return !!r && typeof r === "object" && (r as { source?: unknown }).source === "courtlistener"
    && (r as { sha256?: unknown }).sha256 !== undefined;
}

// ---------------------------------------------------------------------------
// HAPPY: get_citation("410 U.S. 113")
// ---------------------------------------------------------------------------

test("HAPPY get_citation('410 U.S. 113') -> Roe with decided_date 1973-01-22, source_url, stable sha256", async () => {
  const { fetchFn } = stubFetch([
    { match: "/citation-lookup", body: fixture("citation-lookup-roe.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getCitation("410 U.S. 113");

  assert.ok(isEnvelope(res), `expected provenance envelope, got ${JSON.stringify(res)}`);
  const env = res as ProvenanceEnvelope;
  assert.equal(env.source, "courtlistener");
  assert.equal(env.decided_date, "1973-01-22");
  assert.equal(env.citation, "410 U.S. 113");
  assert.equal(env.court, "Supreme Court of the United States");
  assert.equal(env.source_url, "https://www.courtlistener.com/opinion/108713/roe-v-wade/");
  assert.equal(env.retrieved_at, "2026-06-26T12:00:00.000Z");

  // sha256 is stable and matches the documentSha256 of the fingerprint text.
  assert.match(env.sha256, /^[0-9a-f]{64}$/);
  // Recompute over the same canonical fingerprint the client uses so the gate
  // would see the same fingerprint for the same authority.
  const expected = documentSha256("Roe v. Wade|410 U.S. 113|1973-01-22");
  assert.equal(env.sha256, expected);
});

test("HAPPY sha256 is deterministic across two calls", async () => {
  const mk = () => {
    const { fetchFn } = stubFetch([
      { match: "/citation-lookup", body: fixture("citation-lookup-roe.json") },
    ]);
    return new LegalDataClient({ fetchFn, now: FIXED_NOW });
  };
  const a = (await mk().getCitation("410 U.S. 113")) as ProvenanceEnvelope;
  const b = (await mk().getCitation("410 U.S. 113")) as ProvenanceEnvelope;
  assert.equal(a.sha256, b.sha256);
});

// ---------------------------------------------------------------------------
// EDGE: ambiguous / parallel cite -> ranked candidates, never silently picks one
// ---------------------------------------------------------------------------

test("EDGE ambiguous cite returns ranked candidates and never silently picks one", async () => {
  const { fetchFn } = stubFetch([
    { match: "/citation-lookup", body: fixture("citation-lookup-ambiguous.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getCitation("1 Black 100");

  assert.equal((res as { status?: string }).status, "ambiguous");
  const amb = res as { status: string; candidates: ProvenanceEnvelope[] };
  assert.equal(amb.candidates.length, 2);
  // each candidate is itself a full provenance envelope
  for (const c of amb.candidates) {
    assert.ok(isEnvelope(c));
    assert.match(c.sha256, /^[0-9a-f]{64}$/);
    assert.ok(c.source_url.startsWith("https://www.courtlistener.com/"));
  }
  // ranked: ordering is stable (earliest decided_date first by default)
  assert.equal(amb.candidates[0].decided_date, "1862-01-13");
  assert.equal(amb.candidates[1].decided_date, "1862-02-10");
  // it is NOT a single auto-picked envelope
  assert.ok(!isEnvelope(res));
});

test("EDGE citation with no match returns unavailable (not_found), never fabricates", async () => {
  const { fetchFn } = stubFetch([
    { match: "/citation-lookup", body: fixture("citation-lookup-notfound.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getCitation("999 U.S. 9999");
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.match((res as { reason: string }).reason, /not.?found/i);
  assert.ok(!isEnvelope(res));
});

// ---------------------------------------------------------------------------
// FAILURE / SECURITY: 5xx / timeout -> structured unavailable, never fabricated
// ---------------------------------------------------------------------------

test("FAILURE 5xx -> structured unavailable error, never a fabricated opinion", async () => {
  const fetchFn: FetchFn = async () => ({
    ok: false,
    status: 503,
    json: async () => ({ detail: "Service Unavailable" }),
    text: async () => "Service Unavailable",
  });
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getCitation("410 U.S. 113");
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.equal((res as { http_status?: number }).http_status, 503);
  assert.ok(!isEnvelope(res));
  // No fabricated payload fields leaked.
  assert.equal((res as { decided_date?: unknown }).decided_date, undefined);
});

test("FAILURE network timeout / thrown fetch -> structured unavailable, never throws to caller", async () => {
  const fetchFn: FetchFn = async () => {
    throw Object.assign(new Error("network timeout"), { name: "AbortError" });
  };
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getCitation("410 U.S. 113");
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.match((res as { reason: string }).reason, /timeout|network|abort/i);
});

test("SECURITY confidential search strips client identifiers from outbound query", async () => {
  const { fetchFn, calls } = stubFetch([
    { match: "/search", body: fixture("search-opinions.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW, privacyTier: "confidential" });
  await client.searchOpinions({ query: "ACME Inc. v. Smith indemnification dispute" });

  assert.equal(calls.length, 1);
  const outbound = decodeURIComponent(calls[0].url);
  assert.ok(!outbound.includes("ACME Inc."), `client name leaked to CourtListener: ${outbound}`);
  // neutral term still present so the search remains useful
  assert.match(outbound, /indemnification/);
});

// ---------------------------------------------------------------------------
// search / get_opinion / get_docket envelopes
// ---------------------------------------------------------------------------

test("search_opinions returns an envelope wrapping ranked stubs", async () => {
  const { fetchFn } = stubFetch([
    { match: "/search", body: fixture("search-opinions.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.searchOpinions({ query: "abortion privacy" });
  assert.ok(isEnvelope(res));
  const env = res as ProvenanceEnvelope<{ results: unknown[] }>;
  assert.equal(env.source, "courtlistener");
  assert.equal(env.payload.results.length, 2);
  assert.match(env.sha256, /^[0-9a-f]{64}$/);
});

test("get_opinion wraps full text + provenance with sha over the opinion body", async () => {
  const { fetchFn } = stubFetch([
    { match: "/opinions/108714", body: fixture("opinion-108714.json") },
    { match: "/clusters/108713", body: fixture("cluster-108713.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getOpinion(108714);
  assert.ok(isEnvelope(res));
  const env = res as ProvenanceEnvelope<{ plain_text: string }>;
  assert.match(env.payload.plain_text, /BLACKMUN/);
  // sha is documentSha256 of the opinion plain_text (the authority body itself)
  const expected = documentSha256((fixture("opinion-108714.json") as { plain_text: string }).plain_text);
  assert.equal(env.sha256, expected);
});

test("get_docket wraps docket metadata + provenance", async () => {
  const { fetchFn } = stubFetch([
    { match: "/dockets/65663", body: fixture("docket-65663.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, now: FIXED_NOW });
  const res = await client.getDocket(65663);
  assert.ok(isEnvelope(res));
  const env = res as ProvenanceEnvelope<{ docket_number: string }>;
  assert.equal(env.payload.docket_number, "70-18");
  assert.equal(env.source_url, "https://www.courtlistener.com/docket/65663/roe-v-wade/");
});

// ---------------------------------------------------------------------------
// CACHE: keyed by sha256, absorbs rate limits, deterministic
// ---------------------------------------------------------------------------

test("cache: second get_opinion call hits cache and does not re-fetch", async () => {
  const cache = new MemoryCache();
  let opinionFetches = 0;
  const fetchFn: FetchFn = async (url) => {
    if (url.includes("/opinions/108714")) {
      opinionFetches++;
      return jsonResponse(fixture("opinion-108714.json"));
    }
    if (url.includes("/clusters/108713")) return jsonResponse(fixture("cluster-108713.json"));
    throw new Error(`unexpected url ${url}`);
  };
  const client = new LegalDataClient({ fetchFn, cache, now: FIXED_NOW });
  const a = (await client.getOpinion(108714)) as ProvenanceEnvelope;
  const b = (await client.getOpinion(108714)) as ProvenanceEnvelope;
  assert.equal(a.sha256, b.sha256);
  assert.equal(opinionFetches, 1, "second call should be served from cache");
});

test("cache is keyed by sha256 of the fetched authority", async () => {
  const cache = new MemoryCache();
  const { fetchFn } = stubFetch([
    { match: "/opinions/108714", body: fixture("opinion-108714.json") },
    { match: "/clusters/108713", body: fixture("cluster-108713.json") },
  ]);
  const client = new LegalDataClient({ fetchFn, cache, now: FIXED_NOW });
  const env = (await client.getOpinion(108714)) as ProvenanceEnvelope;
  assert.ok(cache.has(env.sha256), "envelope sha256 should be a cache key");
});
