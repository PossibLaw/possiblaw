// mcp-servers/legal-data/src/upstream.ts
//
// The REAL upstream wiring to the OFFICIAL CourtListener MCP
// (https://mcp.courtlistener.com). This file is intentionally THIN and is NOT
// exercised by the test suite: it requires a CourtListener account and a live
// OAuth flow, neither of which exists in CI. All testable adapter logic lives in
// ./adapter.ts and runs with a stubbed UpstreamCaller (no network, no OAuth).
//
// CourtListener's hosted MCP (in Anthropic's connector directory) exposes case
// law, PACER, the citation network, oral arguments, judges, keyword + semantic
// search, alerts, and a grounded citation-verification tool. We do NOT pin its
// tool schemas here — confirm tool names/params at runtime via `tools/list`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type { UpstreamCaller, UpstreamResult } from "./types.ts";

export const COURTLISTENER_MCP_URL = "https://mcp.courtlistener.com";
export const COURTLISTENER_REST_BASE = "https://www.courtlistener.com/api/rest/v4/";

// ---------------------------------------------------------------------------
// DEFAULT upstream: token-REST against CourtListener REST v4 (HEADLESS).
//
// Unlike the OAuth-MCP upstream above, this path needs NO OAuth, NO browser
// redirect, and NO CourtListener account: it issues plain HTTPS GETs against the
// public REST v4 API. A COURTLISTENER_API_KEY (DRF token) raises rate limits;
// when unset, anonymous calls work at low volume. This is the default upstream
// so a filed matter can research CourtListener end-to-end, headless.
//
// FIXED tool set (the server re-exposes exactly these four with MCP schemas):
//   search_opinions({query, court?, filed_after?, filed_before?})
//                          -> GET /search/?q=<query>&type=o[&court=][&filed_after=][&filed_before=]
//   get_opinion({id})      -> GET /opinions/<id>/
//   get_citation({cite})   -> GET /search/?q="<cite>"&type=o   (citation lookup via search)
//   get_docket({id})       -> GET /dockets/<id>/
//
// SCHEMA-AGNOSTIC: we return the parsed JSON verbatim. The adapter wraps it with
// provenance; we do NOT reconstruct or validate the response shape beyond what is
// needed to issue the request. On any non-2xx (401/403/429/5xx) or network error
// we THROW — proxyToolCall converts a thrown upstream into a structured
// `unavailable` result (never a fabricated opinion).

/** Minimal fetch surface we depend on, so tests can stub it with zero network. */
export type FetchFn = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export interface CourtListenerRestConfig {
  /**
   * DRF token (from COURTLISTENER_API_KEY). When set, sent as
   * `Authorization: Token <key>`. When unset/empty, the header is OMITTED
   * entirely (anonymous access, accepted at low volume).
   */
  apiKey?: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchFn?: FetchFn;
  /** Override the REST base (defaults to the public REST v4 root). */
  baseUrl?: string;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

/**
 * Build the headless token-REST UpstreamCaller. Maps the fixed 4 tools to
 * CourtListener REST v4 GETs, injects the Authorization header only when a key
 * is present, and throws on non-2xx / network error so the adapter surfaces a
 * structured `unavailable`.
 */
export function createCourtListenerRestUpstream(
  config: CourtListenerRestConfig = {},
): UpstreamCaller {
  const fetchFn: FetchFn = config.fetchFn ?? (globalThis.fetch as unknown as FetchFn);
  const base = (config.baseUrl ?? COURTLISTENER_REST_BASE).replace(/\/+$/, "") + "/";
  const apiKey = config.apiKey?.trim();

  function headers(): Record<string, string> {
    const h: Record<string, string> = { accept: "application/json" };
    // Header present ONLY when a key is configured; omitted entirely otherwise
    // (anonymous access). Never send an empty Authorization value.
    if (apiKey) h["authorization"] = `Token ${apiKey}`;
    return h;
  }

  function buildUrl(path: string, params?: Record<string, string | undefined>): string {
    const url = new URL(path.replace(/^\/+/, ""), base);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== "") url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  async function get(url: string): Promise<unknown> {
    let res: Awaited<ReturnType<FetchFn>>;
    try {
      res = await fetchFn(url, { method: "GET", headers: headers() });
    } catch (e) {
      // Network/DNS/abort — THROW so proxyToolCall returns `unavailable`.
      throw new Error(`CourtListener REST request failed: ${(e as Error)?.message ?? String(e)}`);
    }
    if (!res.ok) {
      // 401/403/429/5xx — THROW; never fabricate a result.
      throw new Error(`CourtListener REST returned HTTP ${res.status}`);
    }
    return res.json();
  }

  return async (toolName, args): Promise<UpstreamResult> => {
    switch (toolName) {
      case "search_opinions": {
        return get(
          buildUrl("search/", {
            q: str(args["query"]),
            type: "o",
            court: args["court"] !== undefined ? str(args["court"]) : undefined,
            filed_after: args["filed_after"] !== undefined ? str(args["filed_after"]) : undefined,
            filed_before:
              args["filed_before"] !== undefined ? str(args["filed_before"]) : undefined,
          }),
        );
      }
      case "get_citation": {
        // Citation lookup via search: quote the cite so it is matched as a phrase.
        return get(buildUrl("search/", { q: `"${str(args["cite"])}"`, type: "o" }));
      }
      case "get_opinion": {
        return get(buildUrl(`opinions/${encodeURIComponent(str(args["id"]))}/`));
      }
      case "get_docket": {
        return get(buildUrl(`dockets/${encodeURIComponent(str(args["id"]))}/`));
      }
      default:
        throw new Error(`Unknown legal-data tool: ${toolName}`);
    }
  };
}

export interface CourtListenerUpstreamConfig {
  /** Override the hosted MCP endpoint (defaults to the official URL). */
  url?: string;
  /**
   * OAuth client provider used by the Streamable-HTTP transport. REQUIRED for a
   * live connection — the official server is OAuth-gated and requires a
   * CourtListener account. Supply an SDK-compatible provider (token store +
   * PKCE + redirect handling). We accept it by injection rather than baking a
   * persistence strategy in, because credential storage is a host concern.
   */
  authProvider: OAuthClientProvider;
  /** MCP client identity reported in the handshake. */
  clientName?: string;
  clientVersion?: string;
}

/**
 * A connected upstream: the raw SDK client plus the UpstreamCaller the adapter
 * consumes, and a disconnect hook for clean shutdown.
 */
export interface CourtListenerUpstream {
  client: Client;
  call: UpstreamCaller;
  listTools: () => Promise<unknown>;
  close: () => Promise<void>;
}

/**
 * Connect to the official CourtListener MCP and return an UpstreamCaller.
 *
 * THIN: each call forwards `toolName` + `args` to `client.callTool` and returns
 * the raw result UNCHANGED — the adapter is schema-agnostic and adds provenance
 * downstream. Connection failures and OAuth `UnauthorizedError` propagate to the
 * caller (server.ts decides how to surface them); per-call failures are turned
 * into structured `unavailable` results by the adapter's proxyToolCall.
 *
 * NOT unit-tested: needs a CourtListener account + completed OAuth flow.
 */
export async function createCourtListenerUpstream(
  config: CourtListenerUpstreamConfig,
): Promise<CourtListenerUpstream> {
  const url = new URL(config.url ?? COURTLISTENER_MCP_URL);
  const transport = new StreamableHTTPClientTransport(url, {
    authProvider: config.authProvider,
  });

  const client = new Client({
    name: config.clientName ?? "possiblaw-legal-data",
    version: config.clientVersion ?? "0.2.0",
  });

  // May throw UnauthorizedError if the OAuth flow has not been completed; the
  // host is responsible for driving the redirect + finishAuth handshake.
  await client.connect(transport);

  const call: UpstreamCaller = async (toolName, args): Promise<UpstreamResult> => {
    // Pass through verbatim. Do NOT assume/transform the upstream schema.
    return client.callTool({ name: toolName, arguments: args });
  };

  return {
    client,
    call,
    listTools: () => client.listTools(),
    close: () => client.close(),
  };
}
