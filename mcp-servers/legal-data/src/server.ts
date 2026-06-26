// mcp-servers/legal-data/src/server.ts
//
// Thin MCP PROXY server. On startup it connects to the OFFICIAL CourtListener
// MCP (https://mcp.courtlistener.com) via ./upstream.ts, discovers the upstream
// tool catalog with `tools/list`, and RE-EXPOSES each tool as a pass-through
// whose every invocation runs adapter.proxyToolCall: sanitize -> forward ->
// wrap-with-provenance. All testable value lives in ./adapter.ts (node:test,
// zero network); this file is intentionally thin wiring and is NOT unit-tested.
//
// NOTE ON OAUTH: the official server is OAuth-gated and needs a CourtListener
// account. The SDK does not ship a ready-made persistent OAuthClientProvider, so
// the host must supply one (token store + PKCE + redirect handling). We import a
// host-provided provider from an optional module path so this file stays thin
// and the test suite never touches OAuth.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { createCourtListenerUpstream } from "./upstream.ts";
import { proxyToolCall, createGateProvenanceReporter } from "./adapter.ts";
import type { PrivacyTier } from "./types.ts";

// Best-effort authority-provenance reporter. Reads GATE_PROXY_URL; when unset it
// is a no-op. Retrieval NEVER depends on the gate being reachable.
const reportProvenance = createGateProvenanceReporter();

const tierEnv = process.env["POSSIBLAW_MATTER_PRIVACY_TIER"];
const privacyTier: PrivacyTier =
  tierEnv === "confidential" || tierEnv === "privileged" ? tierEnv : "standard";

function asContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

/**
 * Load the host-provided OAuthClientProvider. We resolve it from
 * POSSIBLAW_CL_AUTH_PROVIDER_MODULE (a module exporting a default
 * OAuthClientProvider) so credential storage stays a host concern and this
 * server has no baked-in token strategy. Fail loud if it is missing.
 */
async function loadAuthProvider(): Promise<OAuthClientProvider> {
  const modPath = process.env["POSSIBLAW_CL_AUTH_PROVIDER_MODULE"];
  if (!modPath) {
    throw new Error(
      "POSSIBLAW_CL_AUTH_PROVIDER_MODULE is required: the official CourtListener MCP is OAuth-gated. " +
        "Point it at a module whose default export is an @modelcontextprotocol/sdk OAuthClientProvider.",
    );
  }
  const mod = (await import(modPath)) as { default?: OAuthClientProvider };
  if (!mod.default) {
    throw new Error(`${modPath} must default-export an OAuthClientProvider`);
  }
  return mod.default;
}

async function main(): Promise<void> {
  const authProvider = await loadAuthProvider();
  const upstream = await createCourtListenerUpstream({ authProvider });

  const server = new McpServer({ name: "possiblaw-legal-data", version: "0.2.0" });

  // Discover the upstream catalog and re-expose each tool as a provenance proxy.
  // Schema-agnostic: we accept passthrough args and forward verbatim (after
  // sanitization). The upstream's own JSON Schema governs real validation.
  const { tools } = (await upstream.listTools()) as {
    tools: { name: string; description?: string }[];
  };

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description:
          (tool.description ?? `Proxied CourtListener MCP tool: ${tool.name}`) +
          " — wrapped in a PossibLaw provenance envelope (sha256 aligned with the citation gate); " +
          "client identifiers are stripped from query args for confidential/privileged matters.",
        // Passthrough: forward arbitrary args; the upstream validates its own schema.
        inputSchema: { args: z.record(z.unknown()).optional() },
      },
      async (input: { args?: Record<string, unknown> }) =>
        asContent(
          await proxyToolCall(upstream.call, {
            toolName: tool.name,
            args: input.args ?? {},
            tier: privacyTier,
            now: new Date().toISOString(),
            reportProvenance,
          }),
        ),
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("legal-data MCP proxy failed to start:", err);
  process.exit(1);
});
