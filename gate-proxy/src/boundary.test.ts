import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classify, UnknownToolError } from "./boundary.ts";
import type { EgressRequest } from "./types.ts";

function req(tool: string, meta: EgressRequest["meta"] = {}): EgressRequest {
  return { tool, payload: {}, meta };
}

describe("classify", () => {
  it("send_email → THIRD_PARTY_EGRESS", () => {
    assert.equal(classify(req("send_email")), "THIRD_PARTY_EGRESS");
  });

  it("upload_document → THIRD_PARTY_EGRESS", () => {
    assert.equal(classify(req("upload_document")), "THIRD_PARTY_EGRESS");
  });

  it("share_external → THIRD_PARTY_EGRESS", () => {
    assert.equal(classify(req("share_external")), "THIRD_PARTY_EGRESS");
  });

  it("query_external_model with confidentiality=privileged → CONFIDENTIAL_TO_CLOUD", () => {
    assert.equal(
      classify(req("query_external_model", { confidentiality: "privileged" })),
      "CONFIDENTIAL_TO_CLOUD",
    );
  });

  it("query_external_model with confidentiality=confidential → CONFIDENTIAL_TO_CLOUD", () => {
    assert.equal(
      classify(req("query_external_model", { confidentiality: "confidential" })),
      "CONFIDENTIAL_TO_CLOUD",
    );
  });

  it("query_external_model with confidentiality=standard → null", () => {
    assert.equal(
      classify(req("query_external_model", { confidentiality: "standard" })),
      null,
    );
  });

  it("query_external_model with no confidentiality in meta → null", () => {
    assert.equal(classify(req("query_external_model", {})), null);
  });

  it("sign_document → SIGNATURE", () => {
    assert.equal(classify(req("sign_document")), "SIGNATURE");
  });

  it("send_payment → MONEY_MOVEMENT", () => {
    assert.equal(classify(req("send_payment")), "MONEY_MOVEMENT");
  });

  it("file_court_document → COURT_FILING", () => {
    assert.equal(classify(req("file_court_document")), "COURT_FILING");
  });

  it("delete_external_resource → IRREVERSIBLE_EXTERNAL_OP", () => {
    assert.equal(classify(req("delete_external_resource")), "IRREVERSIBLE_EXTERNAL_OP");
  });

  it("unknown tool throws UnknownToolError with tool name in message", () => {
    const toolName = "exfiltrate_everything";
    assert.throws(
      () => classify(req(toolName)),
      (err: unknown) => {
        assert.ok(err instanceof UnknownToolError, "should be UnknownToolError");
        assert.ok(
          (err as UnknownToolError).message.includes(toolName),
          `message should contain "${toolName}"`,
        );
        return true;
      },
    );
  });

  // I4 — prototype-named tool regression
  it("I4: prototype-named tools throw UnknownToolError (not inherited member)", () => {
    const protoTools = ["__proto__", "toString", "valueOf", "constructor"];
    for (const toolName of protoTools) {
      assert.throws(
        () => classify(req(toolName)),
        (err: unknown) => {
          assert.ok(
            err instanceof UnknownToolError,
            `"${toolName}" should throw UnknownToolError, got: ${String(err)}`,
          );
          return true;
        },
        `classify("${toolName}") should throw UnknownToolError`,
      );
    }
  });
});
