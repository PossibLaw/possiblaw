import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { EgressRequest } from "./types.ts";

describe("scaffold canary", () => {
  it("EgressRequest type is usable and tsx+node:test harness runs TypeScript", () => {
    const req: EgressRequest = {
      tool: "http.post",
      payload: { url: "https://example.com" },
      meta: {
        agentId: "agent-001",
        confidentiality: "standard",
      },
    };

    assert.equal(req.tool, "http.post");
    assert.equal(req.meta.confidentiality, "standard");
    assert.ok(true, "canary passed");
  });
});
