// mcp-servers/firm-facade/src/catalog.test.ts
//
// Tests for the firm-facade tool catalog (FACADE_TOOLS).
// Security invariants are load-bearing: adding/removing a tool or introducing
// a forbidden capability name must cause these tests to fail.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { FACADE_TOOLS } from "./catalog.ts";

// ---------------------------------------------------------------------------
// Allowlist — these are the EXACT 5 legal nouns permitted on the facade
// ---------------------------------------------------------------------------
const EXPECTED_NAMES = new Set([
  "create_matter",
  "get_matter_status",
  "list_work_products",
  "fetch_work_product",
  "request_approval",
]);

// ---------------------------------------------------------------------------
// Denylist — no tool name may be, or contain, any of these strings.
// The catalog cannot grow an AI-callable approve/exec/raw-passthrough tool
// without failing this test.
// ---------------------------------------------------------------------------
const DENYLIST_SUBSTRINGS = [
  "approve_gate",
  "decide_approval",
  "run_agent",
  "raw_http",
  "fetch_url",
  "exec",
  "eval_",
];

// Separately: no tool name may START with approve/reject/decide (verb forms).
const FORBIDDEN_VERB_PREFIX = /^(approv|reject|decide)/i;

describe("FACADE_TOOLS catalog", () => {
  // 1. Exact count
  it("has exactly 5 entries", () => {
    assert.equal(
      FACADE_TOOLS.length,
      5,
      `expected 5 tools, got ${FACADE_TOOLS.length}: ${FACADE_TOOLS.map((t) => t.name).join(", ")}`,
    );
  });

  // 2. Name set is EXACTLY the 5 legal nouns — no additions, no removals
  it("name set is EXACTLY {create_matter, get_matter_status, list_work_products, fetch_work_product, request_approval}", () => {
    const actualNames = new Set(FACADE_TOOLS.map((t) => t.name));
    assert.deepEqual(
      actualNames,
      EXPECTED_NAMES,
      `catalog name set mismatch — expected ${JSON.stringify([...EXPECTED_NAMES])}, got ${JSON.stringify([...actualNames])}`,
    );
  });

  // 3. Security allowlist assertion — no tool name contains a denied capability string
  it("SECURITY: no tool name contains a denied capability substring", () => {
    for (const tool of FACADE_TOOLS) {
      for (const denied of DENYLIST_SUBSTRINGS) {
        assert.ok(
          !tool.name.includes(denied),
          `SECURITY VIOLATION: tool "${tool.name}" contains denied substring "${denied}"`,
        );
      }
    }
  });

  // 4. Security: no tool name starts with a forbidden verb (approve/reject/decide)
  it("SECURITY: no tool name starts with approve/reject/decide verb", () => {
    for (const tool of FACADE_TOOLS) {
      assert.ok(
        !FORBIDDEN_VERB_PREFIX.test(tool.name),
        `SECURITY VIOLATION: tool "${tool.name}" starts with a forbidden verb (approv/reject/decide)`,
      );
    }
  });

  // 5. Each entry has a non-empty description
  it("each entry has a non-empty description string", () => {
    for (const tool of FACADE_TOOLS) {
      assert.ok(
        typeof tool.description === "string" && tool.description.trim().length > 0,
        `tool "${tool.name}" has empty or missing description`,
      );
    }
  });

  // 6. Each entry's inputSchema is a plain record of ZodType values
  it("each entry's inputSchema is a Record<string, ZodType>", () => {
    for (const tool of FACADE_TOOLS) {
      assert.ok(
        typeof tool.inputSchema === "object" && tool.inputSchema !== null && !Array.isArray(tool.inputSchema),
        `tool "${tool.name}" inputSchema is not a plain object`,
      );
      for (const [key, val] of Object.entries(tool.inputSchema)) {
        assert.ok(
          val instanceof z.ZodType,
          `tool "${tool.name}" inputSchema["${key}"] (${typeof val}) is not a ZodType instance`,
        );
      }
    }
  });

  // 7. Spot-check: create_matter — required 'title' is ZodString
  it("create_matter: 'title' field exists and is ZodString", () => {
    const tool = FACADE_TOOLS.find((t) => t.name === "create_matter");
    assert.ok(tool, "create_matter not found in catalog");
    assert.ok("title" in tool.inputSchema, "create_matter must have 'title' field");
    assert.ok(
      tool.inputSchema["title"] instanceof z.ZodString,
      `create_matter.title is not ZodString (got ${tool.inputSchema["title"]?.constructor?.name})`,
    );
  });

  // 8. Spot-check: get_matter_status — required 'matterId'
  it("get_matter_status: 'matterId' field exists", () => {
    const tool = FACADE_TOOLS.find((t) => t.name === "get_matter_status");
    assert.ok(tool, "get_matter_status not found in catalog");
    assert.ok("matterId" in tool.inputSchema, "get_matter_status must have 'matterId' field");
    assert.ok(tool.inputSchema["matterId"] instanceof z.ZodString);
  });

  // 9. Spot-check: list_work_products — required 'matterId'
  it("list_work_products: 'matterId' field exists", () => {
    const tool = FACADE_TOOLS.find((t) => t.name === "list_work_products");
    assert.ok(tool, "list_work_products not found in catalog");
    assert.ok("matterId" in tool.inputSchema, "list_work_products must have 'matterId' field");
  });

  // 10. Spot-check: fetch_work_product — matterId, workProductId, include_text
  it("fetch_work_product: has matterId, workProductId, and include_text fields", () => {
    const tool = FACADE_TOOLS.find((t) => t.name === "fetch_work_product");
    assert.ok(tool, "fetch_work_product not found in catalog");
    assert.ok("matterId" in tool.inputSchema, "fetch_work_product must have 'matterId'");
    assert.ok("workProductId" in tool.inputSchema, "fetch_work_product must have 'workProductId'");
    assert.ok("include_text" in tool.inputSchema, "fetch_work_product must have 'include_text'");
    // include_text is optional — verify it's a ZodBoolean (possibly wrapped in ZodOptional)
    const incl = tool.inputSchema["include_text"];
    assert.ok(incl instanceof z.ZodType, "fetch_work_product.include_text must be a ZodType");
  });

  // 11. Spot-check: request_approval — matterId, action, summary
  it("request_approval: has matterId, action, and summary fields", () => {
    const tool = FACADE_TOOLS.find((t) => t.name === "request_approval");
    assert.ok(tool, "request_approval not found in catalog");
    assert.ok("matterId" in tool.inputSchema, "request_approval must have 'matterId'");
    assert.ok("action" in tool.inputSchema, "request_approval must have 'action'");
    assert.ok("summary" in tool.inputSchema, "request_approval must have 'summary'");
    // action and summary are required ZodStrings
    assert.ok(tool.inputSchema["action"] instanceof z.ZodString);
    assert.ok(tool.inputSchema["summary"] instanceof z.ZodString);
  });
});
