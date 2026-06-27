// mcp-servers/firm-facade/src/server.test.ts
//
// Unit E: MCP server wiring tests. Zero-network; fake McpServer, fake env.
//
// LOAD-BEARING TEST: the allowlist assertion — HANDLERS keys must equal
// FACADE_TOOLS names exactly — is the wiring-layer security property.
// registerFacadeTools must throw on any catalog/HANDLERS mismatch.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { FACADE_TOOLS } from "./catalog.ts";
import {
  HANDLERS,
  asContent,
  buildDepsFromEnv,
  registerFacadeTools,
} from "./server.ts";
import { FirmFacadeClient } from "./paperclip-client.ts";
import { FacadeReceiptWriter } from "./receipts.ts";
import type { HandlerDeps } from "./handlers.ts";

// ---------------------------------------------------------------------------
// Fake McpServer — captures registerTool calls; no network/process effects.
// ---------------------------------------------------------------------------

interface RegisteredTool {
  name: string;
  config: unknown;
  handler: (input: Record<string, unknown>) => Promise<unknown>;
}

class FakeMcpServer {
  readonly registered: RegisteredTool[] = [];
  registerTool(
    name: string,
    config: unknown,
    handler: (input: Record<string, unknown>) => Promise<unknown>,
  ): void {
    this.registered.push({ name, config, handler });
  }
}

// ---------------------------------------------------------------------------
// Fake deps — structural stubs satisfying HandlerDeps; no network I/O.
// ---------------------------------------------------------------------------

function makeFakeDeps(): HandlerDeps {
  return {
    client: {
      createIssue: async () => ({ id: "m1", status: "open" }),
      getIssue: async () => ({ id: "m1", status: "open" }),
      listWorkProducts: async () => [],
      getDocument: async () => ({ id: "d1" }),
      createApproval: async () => ({ id: "a1", status: "pending_approval" }),
    },
    receipts: {
      record: async () => {},
    },
  };
}

// ---------------------------------------------------------------------------
// Helper — write a temp gate-policy YAML and return its path
// ---------------------------------------------------------------------------

function writeTempPolicy(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "firm-facade-server-test-"));
  const filePath = path.join(dir, "gate-policy.yaml");
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

// ---------------------------------------------------------------------------
// asContent — shape unit tests.
// ---------------------------------------------------------------------------

describe("asContent", () => {
  it("wraps result in {content:[{type:'text',text:JSON}]} shape", () => {
    const result = { foo: "bar", n: 42 };
    const out = asContent(result);
    assert.deepStrictEqual(out, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    });
  });

  it("type field is the literal string 'text' (as const — not a union or enum)", () => {
    const out = asContent(null);
    assert.strictEqual(out.content[0]!.type, "text");
  });

  it("content array has exactly one element", () => {
    assert.strictEqual(asContent({ x: 1 }).content.length, 1);
  });

  it("text is JSON.stringify(result, null, 2) — pretty-printed with 2-space indent", () => {
    const result = { a: [1, 2, 3] };
    assert.strictEqual(
      asContent(result).content[0]!.text,
      JSON.stringify(result, null, 2),
    );
  });
});

// ---------------------------------------------------------------------------
// HANDLERS allowlist — load-bearing security assertion.
//
// HANDLERS keys must equal FACADE_TOOLS names exactly:
//   - no gap: every catalog tool has a handler
//   - no extra: every handler has a catalog tool
// Adding or removing a tool without updating both sides must fail this test.
// ---------------------------------------------------------------------------

describe("HANDLERS allowlist", () => {
  it("HANDLERS keys === FACADE_TOOLS names exactly (no gap, no extra)", () => {
    const handlerNames = new Set(Object.keys(HANDLERS));
    const catalogNames = new Set(FACADE_TOOLS.map((t) => t.name));

    // Every catalog tool must have a handler (no gap)
    for (const name of catalogNames) {
      assert.ok(
        handlerNames.has(name),
        `HANDLERS is missing handler for catalog tool "${name}"`,
      );
    }

    // Every handler must map to a catalog tool (no extra)
    for (const name of handlerNames) {
      assert.ok(
        catalogNames.has(name),
        `HANDLERS["${name}"] has no matching catalog tool in FACADE_TOOLS`,
      );
    }

    // Exact count match
    assert.strictEqual(
      handlerNames.size,
      catalogNames.size,
      `HANDLERS has ${handlerNames.size} entries but FACADE_TOOLS has ${catalogNames.size} tools`,
    );
  });

  it("HANDLERS has exactly 5 entries (the fixed allowlist)", () => {
    assert.strictEqual(Object.keys(HANDLERS).length, 5);
  });

  it("HANDLERS contains all 5 expected tool names", () => {
    const names = Object.keys(HANDLERS);
    for (const expected of [
      "create_matter",
      "get_matter_status",
      "list_work_products",
      "fetch_work_product",
      "request_approval",
    ]) {
      assert.ok(names.includes(expected), `HANDLERS is missing "${expected}"`);
    }
  });

  it("each HANDLERS value is a function", () => {
    for (const [name, fn] of Object.entries(HANDLERS)) {
      assert.strictEqual(
        typeof fn,
        "function",
        `HANDLERS["${name}"] is not a function`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// registerFacadeTools — registration, handler dispatch, mismatch guard.
// ---------------------------------------------------------------------------

describe("registerFacadeTools", () => {
  it("registers exactly 5 tools on the server", () => {
    const server = new FakeMcpServer();
    const names = registerFacadeTools(server, makeFakeDeps());
    assert.strictEqual(server.registered.length, 5);
    assert.strictEqual(names.length, 5);
  });

  it("registered tool names match FACADE_TOOLS names in catalog order", () => {
    const server = new FakeMcpServer();
    registerFacadeTools(server, makeFakeDeps());
    assert.deepStrictEqual(
      server.registered.map((r) => r.name),
      FACADE_TOOLS.map((t) => t.name),
    );
  });

  it("returns the registered tool name array", () => {
    const server = new FakeMcpServer();
    const names = registerFacadeTools(server, makeFakeDeps());
    assert.deepStrictEqual(
      new Set(names),
      new Set(FACADE_TOOLS.map((t) => t.name)),
    );
  });

  it("registered config carries description from the catalog tool", () => {
    const server = new FakeMcpServer();
    registerFacadeTools(server, makeFakeDeps());
    for (const reg of server.registered) {
      const catalogTool = FACADE_TOOLS.find((t) => t.name === reg.name)!;
      assert.strictEqual(
        (reg.config as Record<string, unknown>)["description"],
        catalogTool.description,
      );
    }
  });

  it("each registered handler calls the corresponding spy handler with (input, deps)", async () => {
    type CallRecord = { name: string; args: unknown; usedDeps: HandlerDeps };
    const callLog: CallRecord[] = [];

    // Build spy handlers that record calls and return a tagged value
    const spyHandlers: typeof HANDLERS = Object.fromEntries(
      FACADE_TOOLS.map((t) => [
        t.name,
        async (args: unknown, d: HandlerDeps) => {
          callLog.push({ name: t.name, args, usedDeps: d });
          return { ok: true, tool: t.name };
        },
      ]),
    );

    const server = new FakeMcpServer();
    const deps = makeFakeDeps();
    registerFacadeTools(server, deps, FACADE_TOOLS, spyHandlers);

    // Invoke the first registered handler with a test input
    const first = server.registered[0]!;
    const input = { matterId: "m-test-001" };
    await first.handler(input);

    // Spy handler was called once with correct args and deps
    assert.strictEqual(callLog.length, 1);
    assert.deepStrictEqual(callLog[0]!.args, input);
    assert.strictEqual(callLog[0]!.usedDeps, deps);
  });

  it("registered handler wraps handler result in asContent shape", async () => {
    const handlerResult = { matterId: "m1", status: "open" };
    const spyHandlers: typeof HANDLERS = Object.fromEntries(
      FACADE_TOOLS.map((t) => [t.name, async () => handlerResult]),
    );

    const server = new FakeMcpServer();
    const deps = makeFakeDeps();
    registerFacadeTools(server, deps, FACADE_TOOLS, spyHandlers);

    // Every registered handler must return the asContent-wrapped result
    for (const reg of server.registered) {
      const out = await reg.handler({});
      assert.deepStrictEqual(out, asContent(handlerResult));
    }
  });

  it("registered handler result has {content:[{type:'text',text}]} shape", async () => {
    const server = new FakeMcpServer();
    const deps = makeFakeDeps();
    // Use real HANDLERS — they will write receipts through fake deps
    // (receipts.record is a no-op stub in makeFakeDeps)
    // For a simple shape test, use spy handlers that return a known value
    const spyHandlers: typeof HANDLERS = Object.fromEntries(
      FACADE_TOOLS.map((t) => [t.name, async () => ({ n: 1 })]),
    );
    registerFacadeTools(server, deps, FACADE_TOOLS, spyHandlers);

    const out = (await server.registered[0]!.handler({})) as {
      content: { type: string; text: string }[];
    };
    assert.ok(Array.isArray(out.content), "content must be an array");
    assert.strictEqual(out.content.length, 1);
    assert.strictEqual(out.content[0]!.type, "text");
    assert.strictEqual(typeof out.content[0]!.text, "string");
    // text is valid JSON
    assert.doesNotThrow(() => JSON.parse(out.content[0]!.text));
  });

  // -------------------------------------------------------------------------
  // MISMATCH GUARD — load-bearing security invariant.
  //
  // registerFacadeTools must throw (no silent gap) when:
  //   (a) a catalog tool has no handler
  //   (b) a handler has no catalog tool
  // -------------------------------------------------------------------------

  describe("mismatch guard", () => {
    it("throws when catalog has a tool with no handler entry (names the tool)", () => {
      const extraCatalog = [
        ...FACADE_TOOLS,
        { name: "phantom_tool", description: "extra not in HANDLERS", inputSchema: {} },
      ];
      const server = new FakeMcpServer();
      assert.throws(
        () => registerFacadeTools(server, makeFakeDeps(), extraCatalog, HANDLERS),
        (err: Error) => {
          assert.ok(
            err.message.includes("phantom_tool"),
            `Expected "phantom_tool" in error message: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("throws when HANDLERS has an extra key with no catalog tool (names the key)", () => {
      const extraHandlers: typeof HANDLERS = {
        ...HANDLERS,
        phantom_handler: async () => ({}),
      };
      const server = new FakeMcpServer();
      assert.throws(
        () => registerFacadeTools(server, makeFakeDeps(), FACADE_TOOLS, extraHandlers),
        (err: Error) => {
          assert.ok(
            err.message.includes("phantom_handler"),
            `Expected "phantom_handler" in error message: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("throws when catalog is missing a tool that HANDLERS has (names the missing tool)", () => {
      // Drop create_matter from catalog; HANDLERS still has it → mismatch
      const reducedCatalog = FACADE_TOOLS.filter((t) => t.name !== "create_matter");
      const server = new FakeMcpServer();
      assert.throws(
        () => registerFacadeTools(server, makeFakeDeps(), reducedCatalog, HANDLERS),
        (err: Error) => {
          assert.ok(
            err.message.includes("create_matter"),
            `Expected "create_matter" in error message: ${err.message}`,
          );
          return true;
        },
      );
    });

    it("does NOT register any tools before throwing on mismatch", () => {
      const extraCatalog = [
        ...FACADE_TOOLS,
        { name: "injected_tool", description: "", inputSchema: {} },
      ];
      const server = new FakeMcpServer();
      assert.throws(() =>
        registerFacadeTools(server, makeFakeDeps(), extraCatalog, HANDLERS),
      );
      // The guard runs before any registerTool calls
      assert.strictEqual(server.registered.length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// buildDepsFromEnv — required vars, optional vars, policy loader.
// ---------------------------------------------------------------------------

describe("buildDepsFromEnv", () => {
  // Full valid env (GATE_POLICY_PATH omitted → fail-closed policy)
  const baseEnv: Record<string, string | undefined> = {
    PAPERCLIP_BASE_URL: "http://127.0.0.1:3100",
    PAPERCLIP_COMPANY_ID: "co_test_abc123",
    GATE_PROXY_URL: "http://127.0.0.1:3801",
    PAPERCLIP_API_KEY: "tok_fake_key",
    PAPERCLIP_PUBLIC_URL: "https://app.possiblaw.example",
    PAPERCLIP_COMPANY_PREFIX: "acme",
  };

  it("throws naming PAPERCLIP_BASE_URL when absent", () => {
    const env = { ...baseEnv, PAPERCLIP_BASE_URL: undefined };
    assert.throws(
      () => buildDepsFromEnv(env),
      (err: Error) => {
        assert.ok(
          err.message.includes("PAPERCLIP_BASE_URL"),
          `Expected "PAPERCLIP_BASE_URL" in: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("throws naming PAPERCLIP_BASE_URL when empty string", () => {
    const env = { ...baseEnv, PAPERCLIP_BASE_URL: "" };
    assert.throws(
      () => buildDepsFromEnv(env),
      (err: Error) => {
        assert.ok(err.message.includes("PAPERCLIP_BASE_URL"));
        return true;
      },
    );
  });

  it("throws naming PAPERCLIP_COMPANY_ID when absent", () => {
    const env = { ...baseEnv, PAPERCLIP_COMPANY_ID: undefined };
    assert.throws(
      () => buildDepsFromEnv(env),
      (err: Error) => {
        assert.ok(
          err.message.includes("PAPERCLIP_COMPANY_ID"),
          `Expected "PAPERCLIP_COMPANY_ID" in: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("throws naming GATE_PROXY_URL when absent", () => {
    const env = { ...baseEnv, GATE_PROXY_URL: undefined };
    assert.throws(
      () => buildDepsFromEnv(env),
      (err: Error) => {
        assert.ok(
          err.message.includes("GATE_PROXY_URL"),
          `Expected "GATE_PROXY_URL" in: ${err.message}`,
        );
        return true;
      },
    );
  });

  it("does not throw with full env", () => {
    assert.doesNotThrow(() => buildDepsFromEnv(baseEnv));
  });

  it("returns a FirmFacadeClient as deps.client (spot-check: all 5 methods present)", () => {
    const deps = buildDepsFromEnv(baseEnv);
    assert.ok(deps.client instanceof FirmFacadeClient);
    assert.strictEqual(typeof deps.client.createIssue, "function");
    assert.strictEqual(typeof deps.client.getIssue, "function");
    assert.strictEqual(typeof deps.client.listWorkProducts, "function");
    assert.strictEqual(typeof deps.client.getDocument, "function");
    assert.strictEqual(typeof deps.client.createApproval, "function");
  });

  it("client is configured with baseUrl from PAPERCLIP_BASE_URL (spot-check private field)", () => {
    const deps = buildDepsFromEnv(baseEnv);
    // FirmFacadeClient stores baseUrl as a TypeScript-private field (not JS #private),
    // so it is accessible via cast for verification.
    assert.strictEqual(
      (deps.client as unknown as Record<string, string>)["baseUrl"],
      "http://127.0.0.1:3100",
    );
  });

  it("client is configured with companyId from PAPERCLIP_COMPANY_ID (spot-check private field)", () => {
    const deps = buildDepsFromEnv(baseEnv);
    assert.strictEqual(
      (deps.client as unknown as Record<string, string>)["companyId"],
      "co_test_abc123",
    );
  });

  it("returns a FacadeReceiptWriter as deps.receipts (spot-check: record method present)", () => {
    const deps = buildDepsFromEnv(baseEnv);
    assert.ok(deps.receipts instanceof FacadeReceiptWriter);
    assert.strictEqual(typeof deps.receipts.record, "function");
  });

  it("receipts configured with gateProxyUrl from GATE_PROXY_URL (spot-check private field)", () => {
    const deps = buildDepsFromEnv(baseEnv);
    assert.strictEqual(
      (deps.receipts as unknown as Record<string, string>)["gateProxyUrl"],
      "http://127.0.0.1:3801",
    );
  });

  it("PAPERCLIP_API_KEY is optional — succeeds when absent (defaults to empty string)", () => {
    const { PAPERCLIP_API_KEY: _omit, ...envNoKey } = baseEnv;
    assert.doesNotThrow(() => buildDepsFromEnv(envNoKey));
  });

  it("publicBaseUrl populated from PAPERCLIP_PUBLIC_URL", () => {
    const deps = buildDepsFromEnv(baseEnv);
    assert.strictEqual(deps.publicBaseUrl, "https://app.possiblaw.example");
  });

  it("companyPrefix populated from PAPERCLIP_COMPANY_PREFIX", () => {
    const deps = buildDepsFromEnv(baseEnv);
    assert.strictEqual(deps.companyPrefix, "acme");
  });

  it("publicBaseUrl is undefined when PAPERCLIP_PUBLIC_URL absent", () => {
    const { PAPERCLIP_PUBLIC_URL: _omit, ...envNoUrl } = baseEnv;
    const deps = buildDepsFromEnv(envNoUrl);
    assert.strictEqual(deps.publicBaseUrl, undefined);
  });

  it("companyPrefix is undefined when PAPERCLIP_COMPANY_PREFIX absent", () => {
    const { PAPERCLIP_COMPANY_PREFIX: _omit, ...envNoPrefix } = baseEnv;
    const deps = buildDepsFromEnv(envNoPrefix);
    assert.strictEqual(deps.companyPrefix, undefined);
  });

  it("policy is fail-closed {allowWorkProductText:false} when GATE_POLICY_PATH absent", () => {
    // No GATE_POLICY_PATH in baseEnv → loadFirmFacadePolicy(undefined) → CLOSED
    const deps = buildDepsFromEnv(baseEnv);
    assert.deepStrictEqual(deps.policy, { allowWorkProductText: false });
  });

  it("policy is {allowWorkProductText:true} when GATE_POLICY_PATH points to a valid open YAML", () => {
    const policyPath = writeTempPolicy(
      "firmFacade:\n  allowWorkProductText: true\n",
    );
    try {
      const deps = buildDepsFromEnv({ ...baseEnv, GATE_POLICY_PATH: policyPath });
      assert.deepStrictEqual(deps.policy, { allowWorkProductText: true });
    } finally {
      fs.rmSync(path.dirname(policyPath), { recursive: true, force: true });
    }
  });

  it("policy is fail-closed when GATE_POLICY_PATH points to a non-existent file", () => {
    const deps = buildDepsFromEnv({
      ...baseEnv,
      GATE_POLICY_PATH: "/nonexistent/path/gate-policy.yaml",
    });
    assert.deepStrictEqual(deps.policy, { allowWorkProductText: false });
  });
});
