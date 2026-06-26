// mcp-servers/legal-data/src/rest-upstream.test.ts
//
// Tests for the DEFAULT, HEADLESS token-REST upstream
// (createCourtListenerRestUpstream). Zero network: `fetchFn` is stubbed and
// records every (url, init) it received. We assert the tool->endpoint mapping,
// the Authorization-header presence/absence rule, that confidential-tier
// sanitization strips a client identifier from the query BEFORE the stubbed
// fetch sees the URL, and that any non-2xx / network error surfaces through
// proxyToolCall as a structured `unavailable` (never a fabricated opinion).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCourtListenerRestUpstream } from "./upstream.ts";
import type { FetchFn } from "./upstream.ts";
import { proxyToolCall } from "./adapter.ts";
import type { ProvenanceEnvelope } from "./types.ts";

const FIXED_NOW = "2026-06-26T12:00:00.000Z";

/** A recording stub fetch: returns a scripted JSON body and captures each call. */
function stubFetch(body: unknown, opts: { ok?: boolean; status?: number } = {}): {
  fetchFn: FetchFn;
  calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[];
} {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string> } }[] = [];
  const fetchFn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: opts.ok ?? true,
      status: opts.status ?? 200,
      json: async () => body,
    };
  };
  return { fetchFn, calls };
}

function isEnvelope(r: unknown): r is ProvenanceEnvelope {
  return (
    !!r &&
    typeof r === "object" &&
    (r as { source?: unknown }).source === "courtlistener" &&
    (r as { sha256?: unknown }).sha256 !== undefined
  );
}

const SEARCH_BODY = {
  count: 1,
  results: [
    {
      case_name: "Roe v. Wade",
      citation: "410 U.S. 113",
      date_filed: "1973-01-22",
      court: "Supreme Court of the United States",
      absolute_url: "/opinion/108713/roe-v-wade/",
    },
  ],
};

// ---------------------------------------------------------------------------
// HAPPY: search_opinions -> wrapped envelope + provenance reporter invoked
// ---------------------------------------------------------------------------

test("HAPPY search_opinions: stubbed REST search -> wrapped envelope with sha256 + extracted citation/source_url; reporter called with {citation, sha256}", async () => {
  const { fetchFn, calls } = stubFetch(SEARCH_BODY);
  const upstream = createCourtListenerRestUpstream({ apiKey: "tok_abc", fetchFn });
  const reported: Array<{ citation: string; sha256: string }> = [];

  const res = await proxyToolCall(upstream, {
    toolName: "search_opinions",
    args: { query: "indemnification software license", filed_after: "2020-01-01" },
    tier: "standard",
    now: FIXED_NOW,
    reportProvenance: async (a) => {
      reported.push({ citation: a.citation, sha256: a.sha256 });
    },
  });

  assert.ok(isEnvelope(res), `expected envelope, got ${JSON.stringify(res)}`);
  const env = res as ProvenanceEnvelope;
  assert.match(env.sha256, /^[0-9a-f]{64}$/);
  assert.equal(env.citation, "410 U.S. 113");
  assert.equal(env.source_url, "https://www.courtlistener.com/opinion/108713/roe-v-wade/");

  // tool -> endpoint mapping
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.match(url.pathname, /\/api\/rest\/v4\/search\/$/);
  assert.equal(url.searchParams.get("type"), "o");
  assert.equal(url.searchParams.get("q"), "indemnification software license");
  assert.equal(url.searchParams.get("filed_after"), "2020-01-01");

  // provenance reporting closed the loop
  assert.equal(reported.length, 1);
  assert.equal(reported[0].citation, env.citation);
  assert.equal(reported[0].sha256, env.sha256);
});

test("HAPPY tool->endpoint mapping for get_opinion / get_citation / get_docket", async () => {
  // get_opinion -> /opinions/<id>/
  {
    const { fetchFn, calls } = stubFetch({ id: 108713, citation: "410 U.S. 113" });
    const up = createCourtListenerRestUpstream({ fetchFn });
    await up("get_opinion", { id: 108713 });
    assert.match(new URL(calls[0].url).pathname, /\/api\/rest\/v4\/opinions\/108713\/$/);
  }
  // get_docket -> /dockets/<id>/
  {
    const { fetchFn, calls } = stubFetch({ id: 42 });
    const up = createCourtListenerRestUpstream({ fetchFn });
    await up("get_docket", { id: 42 });
    assert.match(new URL(calls[0].url).pathname, /\/api\/rest\/v4\/dockets\/42\/$/);
  }
  // get_citation -> /search/?q="<cite>"&type=o
  {
    const { fetchFn, calls } = stubFetch(SEARCH_BODY);
    const up = createCourtListenerRestUpstream({ fetchFn });
    await up("get_citation", { cite: "410 U.S. 113" });
    const url = new URL(calls[0].url);
    assert.match(url.pathname, /\/api\/rest\/v4\/search\/$/);
    assert.equal(url.searchParams.get("type"), "o");
    assert.equal(url.searchParams.get("q"), '"410 U.S. 113"');
  }
});

// ---------------------------------------------------------------------------
// AUTH: header present when key set; ABSENT when unset (anonymous)
// ---------------------------------------------------------------------------

test("AUTH Authorization header is present when COURTLISTENER_API_KEY is set", async () => {
  const { fetchFn, calls } = stubFetch(SEARCH_BODY);
  const upstream = createCourtListenerRestUpstream({ apiKey: "tok_live_123", fetchFn });
  await upstream("search_opinions", { query: "antitrust" });
  const headers = calls[0].init?.headers ?? {};
  assert.equal(headers["authorization"], "Token tok_live_123");
});

test("AUTH Authorization header is ABSENT when no key is set (anonymous)", async () => {
  const { fetchFn, calls } = stubFetch(SEARCH_BODY);
  const upstream = createCourtListenerRestUpstream({ fetchFn }); // no apiKey
  await upstream("search_opinions", { query: "antitrust" });
  const headers = calls[0].init?.headers ?? {};
  assert.ok(!("authorization" in headers), `header leaked: ${JSON.stringify(headers)}`);
  // an empty-string key is also treated as unset
  const { fetchFn: f2, calls: c2 } = stubFetch(SEARCH_BODY);
  const up2 = createCourtListenerRestUpstream({ apiKey: "", fetchFn: f2 });
  await up2("search_opinions", { query: "antitrust" });
  assert.ok(!("authorization" in (c2[0].init?.headers ?? {})));
});

// ---------------------------------------------------------------------------
// SECURITY: confidential tier strips client identifier BEFORE the fetch URL
// ---------------------------------------------------------------------------

test("SECURITY confidential tier strips a client identifier from the query BEFORE the REST fetch sees the URL", async () => {
  const { fetchFn, calls } = stubFetch(SEARCH_BODY);
  const upstream = createCourtListenerRestUpstream({ apiKey: "tok", fetchFn });

  await proxyToolCall(upstream, {
    toolName: "search_opinions",
    args: { query: "ACME Holdings Inc. v. Smith indemnification dispute", court: "scotus" },
    tier: "confidential",
    now: FIXED_NOW,
  });

  assert.equal(calls.length, 1);
  const raw = calls[0].url;
  // The raw client identifier must never appear anywhere in the request URL
  // (path or query), encoded or not.
  const decoded = decodeURIComponent(raw);
  assert.ok(!/ACME Holdings/.test(decoded), `client name leaked in URL: ${decoded}`);
  // neutral legal terms survive so the search stays useful
  assert.match(decoded, /indemnification/);
  // non-query args pass through untouched
  assert.match(new URL(raw).search, /court=scotus/);
});

// ---------------------------------------------------------------------------
// FAILURE: 429 / 5xx / network error -> structured unavailable, no fabrication
// ---------------------------------------------------------------------------

test("FAILURE HTTP 429 -> proxyToolCall returns { status: 'unavailable' }, never fabricated content", async () => {
  const { fetchFn } = stubFetch({ detail: "throttled" }, { ok: false, status: 429 });
  const upstream = createCourtListenerRestUpstream({ fetchFn });
  const res = await proxyToolCall(upstream, {
    toolName: "search_opinions",
    args: { query: "x" },
    tier: "standard",
    now: FIXED_NOW,
  });
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.ok(!isEnvelope(res));
  assert.equal((res as { sha256?: unknown }).sha256, undefined);
});

test("FAILURE HTTP 5xx -> unavailable", async () => {
  const { fetchFn } = stubFetch({}, { ok: false, status: 503 });
  const upstream = createCourtListenerRestUpstream({ fetchFn });
  const res = await proxyToolCall(upstream, {
    toolName: "get_opinion",
    args: { id: 1 },
    tier: "standard",
    now: FIXED_NOW,
  });
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.ok(!isEnvelope(res));
});

test("FAILURE network/DNS error (fetch throws) -> unavailable, never throws out of proxyToolCall", async () => {
  const fetchFn: FetchFn = async () => {
    throw new Error("ECONNREFUSED");
  };
  const upstream = createCourtListenerRestUpstream({ fetchFn });
  const res = await proxyToolCall(upstream, {
    toolName: "get_docket",
    args: { id: 7 },
    tier: "standard",
    now: FIXED_NOW,
  });
  assert.equal((res as { status?: string }).status, "unavailable");
  assert.ok(!isEnvelope(res));
});
