// mcp-servers/legal-data/src/server.ts
//
// Thin MCP PROXY server. Two upstream modes, selected at startup:
//
//   DEFAULT — token-REST (HEADLESS): createCourtListenerRestUpstream against
//   CourtListener REST v4. No OAuth, no browser redirect, no account required.
//   A COURTLISTENER_API_KEY (DRF token) raises rate limits; when unset, anonymous
//   access works at low volume. In this mode the server EXPOSES a FIXED set of 4
//   tools (search_opinions / get_opinion / get_citation / get_docket) with proper
//   MCP inputSchemas so the agent's runtime sees them via tools/list.
//
//   OPTIONAL — OAuth MCP: set POSSIBLAW_CL_UPSTREAM=mcp (or supply the OAuth
//   provider module via POSSIBLAW_CL_AUTH_PROVIDER_MODULE) to proxy the official
//   hosted CourtListener MCP (https://mcp.courtlistener.com). In that mode the
//   server discovers the upstream catalog via tools/list and re-exposes it.
//
// Every invocation in either mode runs adapter.proxyToolCall: sanitize -> forward
// -> wrap-with-provenance, with the gate provenance reporter wired in. All
// testable value lives in ./adapter.ts and ./rest-upstream.test.ts (node:test,
// zero network); this file is intentionally thin wiring.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import {
  createCourtListenerUpstream,
  createCourtListenerRestUpstream,
} from "./upstream.ts";
import { proxyToolCall, createGateProvenanceReporter } from "./adapter.ts";
import type { PrivacyTier, UpstreamCaller } from "./types.ts";

// Best-effort authority-provenance reporter. Reads GATE_PROXY_URL; when unset it
// is a no-op. Retrieval NEVER depends on the gate being reachable.
const reportProvenance = createGateProvenanceReporter();

// Fail-closed default: when POSSIBLAW_MATTER_PRIVACY_TIER is unset (or set to
// an unrecognized value), treat it as "confidential" so the sanitizer runs.
// Pass-through ("standard") requires an EXPLICIT opt-in. An operator who forgets
// to configure the env gets redaction, not silent full egress.
const tierEnv = process.env["POSSIBLAW_MATTER_PRIVACY_TIER"];
const privacyTier: PrivacyTier =
  tierEnv === "standard"
    ? "standard"
    : tierEnv === "privileged"
      ? "privileged"
      : "confidential"; // unset OR unrecognized → sanitize (fail-closed)

function asContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

/** Run one proxied call through the adapter with provenance + tier wired. */
function callProxy(upstream: UpstreamCaller, toolName: string, args: Record<string, unknown>) {
  return proxyToolCall(upstream, {
    toolName,
    args,
    tier: privacyTier,
    now: new Date().toISOString(),
    reportProvenance,
  });
}

/**
 * The FIXED 4-tool catalog exposed in REST (default) mode. Each entry has a
 * proper MCP inputSchema so the agent runtime sees usable tools via tools/list.
 */
const REST_TOOLS: {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}[] = [
  {
    name: "search_opinions",
    description:
      "Search U.S. legal opinions on CourtListener REST v4 (type=o). Returns the paginated search payload wrapped in a PossibLaw provenance envelope.",
    inputSchema: {
      query: z.string().describe("Free-text search query (neutral legal terms for confidential matters)."),
      court: z.string().optional().describe("CourtListener court id filter, e.g. 'scotus', 'ca9'."),
      filed_after: z.string().optional().describe("Lower date bound, YYYY-MM-DD."),
      filed_before: z.string().optional().describe("Upper date bound, YYYY-MM-DD."),
    },
  },
  {
    name: "get_opinion",
    description:
      "Fetch a single CourtListener opinion by numeric id (GET /opinions/<id>/), wrapped in a provenance envelope.",
    inputSchema: {
      id: z.union([z.string(), z.number()]).describe("CourtListener opinion id."),
    },
  },
  {
    name: "get_citation",
    description:
      "Look up an opinion by reporter citation (e.g. '410 U.S. 113') via CourtListener search, wrapped in a provenance envelope.",
    inputSchema: {
      cite: z.string().describe("Reporter citation string, e.g. '410 U.S. 113'."),
    },
  },
  {
    name: "get_docket",
    description:
      "Fetch a single CourtListener docket by numeric id (GET /dockets/<id>/), wrapped in a provenance envelope.",
    inputSchema: {
      id: z.union([z.string(), z.number()]).describe("CourtListener docket id."),
    },
  },
];

const PROVENANCE_NOTE =
  " — wrapped in a PossibLaw provenance envelope (sha256 aligned with the citation gate); " +
  "client identifiers are stripped from query args for confidential/privileged matters.";

/**
 * Load the host-provided OAuthClientProvider for OAuth-MCP mode. Resolved from
 * POSSIBLAW_CL_AUTH_PROVIDER_MODULE (a module exporting a default
 * OAuthClientProvider) so credential storage stays a host concern.
 */
async function loadAuthProvider(): Promise<OAuthClientProvider> {
  const modPath = process.env["POSSIBLAW_CL_AUTH_PROVIDER_MODULE"];
  if (!modPath) {
    throw new Error(
      "OAuth-MCP mode requires POSSIBLAW_CL_AUTH_PROVIDER_MODULE: the official CourtListener MCP is OAuth-gated. " +
        "Point it at a module whose default export is an @modelcontextprotocol/sdk OAuthClientProvider, " +
        "or unset POSSIBLAW_CL_UPSTREAM to use the default headless token-REST upstream.",
    );
  }
  const mod = (await import(modPath)) as { default?: OAuthClientProvider };
  if (!mod.default) {
    throw new Error(`${modPath} must default-export an OAuthClientProvider`);
  }
  return mod.default;
}

/**
 * Decide which upstream to use. Default = headless token-REST. OAuth MCP only
 * when POSSIBLAW_CL_UPSTREAM=mcp OR the OAuth provider module env is set.
 */
function wantsOAuthUpstream(): boolean {
  const explicit = (process.env["POSSIBLAW_CL_UPSTREAM"] ?? "").trim().toLowerCase();
  if (explicit === "mcp" || explicit === "oauth") return true;
  if (explicit === "rest") return false;
  // Implicit opt-in: an OAuth provider module configured but no explicit choice.
  return !!process.env["POSSIBLAW_CL_AUTH_PROVIDER_MODULE"];
}

async function main(): Promise<void> {
  const server = new McpServer({ name: "possiblaw-legal-data", version: "0.3.0" });

  if (wantsOAuthUpstream()) {
    // OPTIONAL OAuth-MCP mode: discover the upstream catalog and re-expose each
    // tool as a passthrough provenance proxy (schema-agnostic).
    const authProvider = await loadAuthProvider();
    const upstream = await createCourtListenerUpstream({ authProvider });
    const { tools } = (await upstream.listTools()) as {
      tools: { name: string; description?: string }[];
    };
    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description:
            (tool.description ?? `Proxied CourtListener MCP tool: ${tool.name}`) + PROVENANCE_NOTE,
          inputSchema: { args: z.record(z.unknown()).optional() },
        },
        async (input: { args?: Record<string, unknown> }) =>
          asContent(await callProxy(upstream.call, tool.name, input.args ?? {})),
      );
    }
  } else {
    // DEFAULT headless token-REST mode: expose the FIXED 4 tools with real
    // inputSchemas. COURTLISTENER_API_KEY optional (anonymous works at low volume).
    const restUpstream = createCourtListenerRestUpstream({
      apiKey: process.env["COURTLISTENER_API_KEY"],
    });
    for (const tool of REST_TOOLS) {
      server.registerTool(
        tool.name,
        { description: tool.description + PROVENANCE_NOTE, inputSchema: tool.inputSchema },
        async (input: Record<string, unknown>) =>
          asContent(await callProxy(restUpstream, tool.name, input ?? {})),
      );
    }
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("legal-data MCP proxy failed to start:", err);
  process.exit(1);
});
