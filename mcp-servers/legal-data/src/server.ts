// mcp-servers/legal-data/src/server.ts
//
// Thin MCP stdio server. The official @modelcontextprotocol/sdk handles the
// JSON-RPC transport; ALL the value (fetch + provenance + citation resolution +
// cache + sanitizeQuery) lives in ./client.ts and is exercised by node:test
// WITHOUT any network. This file just maps the four tools onto the client and
// wires the real `fetch` and env-supplied API key / privacy tier.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LegalDataClient } from "./client.ts";
import { MemoryCache } from "./cache.ts";
import type { FetchFn } from "./types.ts";

// Adapt node's global fetch to our minimal injectable FetchFn surface.
const nodeFetch: FetchFn = async (url, init) => {
  const res = await fetch(url, init as RequestInit);
  return {
    ok: res.ok,
    status: res.status,
    json: () => res.json(),
    text: () => res.text(),
  };
};

const tierEnv = process.env["POSSIBLAW_MATTER_PRIVACY_TIER"];
const privacyTier =
  tierEnv === "confidential" || tierEnv === "privileged" ? tierEnv : "standard";

const client = new LegalDataClient({
  fetchFn: nodeFetch,
  apiKey: process.env["COURTLISTENER_API_KEY"],
  cache: new MemoryCache(),
  privacyTier,
});

const server = new McpServer({ name: "possiblaw-legal-data", version: "0.1.0" });

function asContent(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

server.registerTool(
  "search_opinions",
  {
    description:
      "Search U.S. case law (CourtListener REST v4). Returns ranked opinion stubs wrapped in a provenance envelope. Confidential/privileged matters have client identifiers stripped from the query before the outbound search.",
    inputSchema: {
      query: z.string(),
      court: z.string().optional(),
      date_range: z
        .object({ after: z.string().optional(), before: z.string().optional() })
        .optional(),
    },
  },
  async (args) => asContent(await client.searchOpinions(args)),
);

server.registerTool(
  "get_opinion",
  {
    description: "Fetch full opinion text + provenance envelope by CourtListener opinion id.",
    inputSchema: { id: z.union([z.number(), z.string()]) },
  },
  async ({ id }) => asContent(await client.getOpinion(id)),
);

server.registerTool(
  "get_citation",
  {
    description:
      "Resolve a reporter citation (e.g. '410 U.S. 113') to an opinion + decided_date + court + provenance. Ambiguous/parallel cites return ranked candidates; misses and upstream errors return a structured `unavailable` result (never a fabricated opinion).",
    inputSchema: { cite: z.string() },
  },
  async ({ cite }) => asContent(await client.getCitation(cite)),
);

server.registerTool(
  "get_docket",
  {
    description: "Fetch docket metadata + provenance envelope by CourtListener docket id.",
    inputSchema: { id: z.union([z.number(), z.string()]) },
  },
  async ({ id }) => asContent(await client.getDocket(id)),
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("legal-data MCP server failed to start:", err);
  process.exit(1);
});
