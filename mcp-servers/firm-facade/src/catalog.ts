// mcp-servers/firm-facade/src/catalog.ts
//
// FACADE_TOOLS — the fixed 5-tool allowlist for the firm-facing MCP facade.
//
// SECURITY INVARIANT: this catalog IS the security boundary. An outside
// assistant can ONLY invoke tools whose names appear here. The name set is
// exactly the 5 legal-noun verbs below — no raw HTTP, no approve, no
// run_agent tool. The catalog.test.ts assertions enforce this at test time.
//
// Shape mirrors mcp-servers/legal-data/src/server.ts REST_TOOLS:
//   { name, description, inputSchema: Record<string, z.ZodTypeAny> }
// (inputSchema is a record of zod validators, NOT a z.object — the MCP
// server wiring (later unit) calls .server.tool(..., inputSchema, handler))

import { z } from "zod";

export const FACADE_TOOLS: {
  name: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}[] = [
  {
    name: "create_matter",
    description:
      "Create a new legal matter (issue) in the firm's workspace. Returns the matter id and initial status. " +
      "Human approval is required before substantive work is performed — this call opens the matter record only.",
    inputSchema: {
      title: z
        .string()
        .describe("Short title for the matter (required). Keep it concise and client-safe."),
      description: z
        .string()
        .optional()
        .describe("Optional longer description of the matter scope."),
      projectId: z
        .string()
        .optional()
        .describe("Optional id of the project (practice area) to file this matter under."),
    },
  },

  {
    name: "get_matter_status",
    description:
      "Get the current status, work-product list, and document summaries for a matter. " +
      "Returns metadata only — full document text is policy-gated and requires a separate " +
      "fetch_work_product call with include_text: true.",
    inputSchema: {
      matterId: z
        .string()
        .describe("The matter (issue) id returned by create_matter."),
    },
  },

  {
    name: "list_work_products",
    description:
      "List work-product metadata for a matter: type, title, provider, status, review state, and summary. " +
      "Full document body is never returned here — it is policy-gated. " +
      "Use fetch_work_product with include_text: true to request full body text.",
    inputSchema: {
      matterId: z
        .string()
        .describe("The matter (issue) id whose work products to list."),
    },
  },

  {
    name: "fetch_work_product",
    description:
      "Fetch a specific work product for a matter. By default returns metadata only. " +
      "Set include_text: true to request the full document body — this is subject to " +
      "operator policy (confidential matters may have body text withheld). " +
      "Human approval is required for any action taken on the work product.",
    inputSchema: {
      matterId: z
        .string()
        .describe("The matter (issue) id that the work product belongs to."),
      workProductId: z
        .string()
        .describe("The work product id to fetch."),
      include_text: z
        .boolean()
        .optional()
        .describe(
          "If true, request the full document body. Subject to operator policy; may be withheld for confidential matters.",
        ),
    },
  },

  {
    name: "request_approval",
    description:
      "Request human approval for a proposed action on a matter. " +
      "Approvals are human-only — this tool queues the request and returns an approval id, " +
      "but cannot approve or reject it. The human reviewer sees the action type and summary before deciding.",
    inputSchema: {
      matterId: z
        .string()
        .describe("The matter (issue) id the approval concerns."),
      action: z
        .string()
        .describe(
          "The type of action awaiting human approval, e.g. 'file_motion', 'send_letter', 'execute_agreement'.",
        ),
      summary: z
        .string()
        .describe(
          "Plain-language summary of what is being approved, written for the human reviewer.",
        ),
    },
  },
];
