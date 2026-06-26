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
