// mcp-servers/firm-facade/src/server.ts
//
// Thin wiring — turns the fixed 5-tool catalog + handlers into a running
// stdio MCP server.  The dispatch map (HANDLERS) IS the security allowlist;
// registerFacadeTools enforces exact set equality at startup and throws on
// any catalog/handler mismatch (no silent gap, no extra handler).
//
// SECURITY INVARIANT: NO catch-all / passthrough tool, NO raw-HTTP tool,
// NO dynamic tool discovery.  The 5 catalog tools are hard-wired to their
// handler functions.  Contrast: mcp-servers/legal-data/src/server.ts has
// an OAuth mode that re-exposes an upstream catalog — the facade does NOT
// do that; it is a fixed allowlist.
//
// Shape mirrors mcp-servers/legal-data/src/server.ts:
//   McpServer + registerTool + asContent + StdioServerTransport + main().catch→exit 1.

import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { FACADE_TOOLS } from "./catalog.ts";
import {
  getMatterStatus,
  listWorkProducts,
  fetchWorkProduct,
  createMatter,
  requestApproval,
  type HandlerDeps,
} from "./handlers.ts";
import { FirmFacadeClient } from "./paperclip-client.ts";
import { FacadeReceiptWriter } from "./receipts.ts";
import { loadFirmFacadePolicy } from "./policy.ts";

// ---------------------------------------------------------------------------
// asContent — wraps a handler result as a single MCP text content block.
// Mirrors the same helper in mcp-servers/legal-data/src/server.ts.
// ---------------------------------------------------------------------------

export function asContent(result: unknown): {
  content: [{ type: "text"; text: string }];
} {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

// ---------------------------------------------------------------------------
// HANDLERS — the dispatch map.  THIS MAP IS THE ALLOWLIST.
//
// Exactly 5 entries, one per FACADE_TOOLS catalog entry.  No catch-all, no
// raw-HTTP passthrough, no dynamic discovery.  Adding or removing a tool or
// handler without updating the other side causes registerFacadeTools to throw
// at startup (enforced by the allowlist assertion below and by server.test.ts).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const HANDLERS: Record<string, (args: any, deps: HandlerDeps) => Promise<unknown>> = {
  create_matter: createMatter,
  get_matter_status: getMatterStatus,
  list_work_products: listWorkProducts,
  fetch_work_product: fetchWorkProduct,
  request_approval: requestApproval,
};

// ---------------------------------------------------------------------------
// registerFacadeTools — wires each catalog tool to its handler.
//
// ALLOWLIST ASSERTION (load-bearing security check at startup):
//   catalog name-set MUST equal handlers key-set exactly.  Throws if:
//     - a catalog tool has no handler entry   (silent gap — forbidden)
//     - a handler has no catalog tool entry   (dead handler — forbidden)
//   No silent gap.  No extra handler.
//
// Parameters catalog / handlersMap default to the real FACADE_TOOLS / HANDLERS;
// overrides are accepted for testing (inject fake catalog or spy handlers).
//
// Returns the list of tool names that were registered.
// ---------------------------------------------------------------------------

export function registerFacadeTools(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  server: any,
  deps: HandlerDeps,
  catalog: typeof FACADE_TOOLS = FACADE_TOOLS,
  handlersMap: typeof HANDLERS = HANDLERS,
): string[] {
  // Build name sets for the assertion check
  const catalogNames = new Set(catalog.map((t) => t.name));
  const handlerNames = new Set(Object.keys(handlersMap));

  // Every catalog tool must have a corresponding handler (no gap)
  for (const name of catalogNames) {
    if (!handlerNames.has(name)) {
      throw new Error(
        `registerFacadeTools: catalog tool "${name}" has no handler entry — ` +
          `allowlist mismatch (add to HANDLERS or remove from catalog).`,
      );
    }
  }

  // Every handler must have a corresponding catalog tool (no extra)
  for (const name of handlerNames) {
    if (!catalogNames.has(name)) {
      throw new Error(
        `registerFacadeTools: handler "${name}" has no matching catalog tool — ` +
          `allowlist mismatch (add to catalog or remove from HANDLERS).`,
      );
    }
  }

  // Register each tool against the server with its asContent-wrapped handler
  const registered: string[] = [];

  for (const tool of catalog) {
    const handler = handlersMap[tool.name]!;
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (input: Record<string, unknown>) => asContent(await handler(input, deps)),
    );
    registered.push(tool.name);
  }

  return registered;
}

// ---------------------------------------------------------------------------
// buildDepsFromEnv — construct HandlerDeps from the process environment.
//
// Env-var contract (Unit F launcher must match exactly):
//
//   REQUIRED — throws a clear startup Error naming the missing var:
//     PAPERCLIP_BASE_URL   — paperclip REST API base URL
//                            (reuses gate-proxy's PAPERCLIP_BASE_URL)
//     PAPERCLIP_COMPANY_ID — company id scoping all create endpoints
//                            (reuses gate-proxy's PAPERCLIP_COMPANY_ID)
//     GATE_PROXY_URL       — gate-proxy base URL for FacadeReceiptWriter
//
//   OPTIONAL — empty/absent is allowed:
//     PAPERCLIP_API_KEY       — Bearer token for paperclip REST API; defaults
//                               to "" (safe on local_trusted loopback instances)
//     PAPERCLIP_PUBLIC_URL    — public base URL for approval dashboard deep links
//     PAPERCLIP_COMPANY_PREFIX — company slug for approval deep links
//     GATE_POLICY_PATH        — gate-policy YAML path (firmFacade.allowWorkProductText
//                               flag); absent → fail-closed policy
//                               (reuses gate-proxy's GATE_POLICY_PATH)
// ---------------------------------------------------------------------------

export function buildDepsFromEnv(
  env: Record<string, string | undefined>,
): HandlerDeps {
  // Validate required vars — throw at startup with an actionable message
  const baseUrl = env["PAPERCLIP_BASE_URL"];
  if (!baseUrl) {
    throw new Error(
      "buildDepsFromEnv: PAPERCLIP_BASE_URL is required but not set. " +
        "Set it to the paperclip REST API base URL (e.g. http://127.0.0.1:3100).",
    );
  }

  const companyId = env["PAPERCLIP_COMPANY_ID"];
  if (!companyId) {
    throw new Error(
      "buildDepsFromEnv: PAPERCLIP_COMPANY_ID is required but not set. " +
        "Set it to the company (firm) id for this facade instance.",
    );
  }

  const gateProxyUrl = env["GATE_PROXY_URL"];
  if (!gateProxyUrl) {
    throw new Error(
      "buildDepsFromEnv: GATE_PROXY_URL is required but not set. " +
        "Set it to the running gate-proxy base URL (e.g. http://127.0.0.1:3801).",
    );
  }

  // Optional — empty string is allowed on local_trusted loopback instances
  const apiKey = env["PAPERCLIP_API_KEY"] ?? "";

  // Construct the company-scoped paperclip client
  const client = new FirmFacadeClient({ baseUrl, companyId, apiKey });

  // Construct the receipt writer that POSTs to the gate proxy
  const receipts = new FacadeReceiptWriter({ gateProxyUrl, apiKey });

  // Load policy; fail-closed when GATE_POLICY_PATH is absent or unreadable
  const policy = loadFirmFacadePolicy(env["GATE_POLICY_PATH"]);

  return {
    client,
    receipts,
    policy,
    publicBaseUrl: env["PAPERCLIP_PUBLIC_URL"],
    companyPrefix: env["PAPERCLIP_COMPANY_PREFIX"],
    // Follow-up #3: thread companyId into deps for defense-in-depth cross-company
    // read isolation in the read handlers. buildDepsFromEnv already requires
    // PAPERCLIP_COMPANY_ID above (throws if absent), so this is always set.
    companyId,
  };
}

// ---------------------------------------------------------------------------
// main — build deps, create server, register tools, connect stdio transport.
// Mirrors the lean main() shape from mcp-servers/legal-data/src/server.ts.
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const deps = buildDepsFromEnv(process.env as Record<string, string | undefined>);

  const server = new McpServer({
    name: "possiblaw-firm-facade",
    version: "0.1.0",
  });

  registerFacadeTools(server, deps);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only invoke main() when this file is run directly (not when imported by tests).
// ESM "is-main" guard: compares the resolved file URL against process.argv[1].
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error("possiblaw-firm-facade MCP server failed to start:", err);
    process.exit(1);
  });
}
