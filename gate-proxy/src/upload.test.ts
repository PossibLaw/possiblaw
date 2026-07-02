// gate-proxy/src/upload.test.ts
// Task 4.1 — helpers for binary uploads through the gate: strict base64
// decoding and MIME-type resolution. TDD: written before src/upload.ts.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decodeBase64Strict,
  isValidMimeType,
  resolveUploadMimeType,
  DEFAULT_MAX_UPLOAD_BYTES,
} from "./upload.ts";

// ---------------------------------------------------------------------------
// decodeBase64Strict
// ---------------------------------------------------------------------------

describe("decodeBase64Strict", () => {
  it("decodes valid base64 to the exact original bytes", () => {
    const original = Buffer.from("PK\x03\x04 fake docx bytes", "utf8");
    const decoded = decodeBase64Strict(original.toString("base64"));
    assert.ok(decoded !== null);
    assert.ok(decoded.equals(original), "decoded bytes must match original");
  });

  it("decodes base64 with padding correctly", () => {
    // "a" → "YQ==", "ab" → "YWI=", "abc" → "YWJj"
    assert.equal(decodeBase64Strict("YQ==")!.toString("utf8"), "a");
    assert.equal(decodeBase64Strict("YWI=")!.toString("utf8"), "ab");
    assert.equal(decodeBase64Strict("YWJj")!.toString("utf8"), "abc");
  });

  it("rejects the empty string", () => {
    assert.equal(decodeBase64Strict(""), null);
  });

  it("rejects strings with invalid characters (Node's Buffer.from is forgiving; we are not)", () => {
    assert.equal(decodeBase64Strict("not base64!!"), null);
    assert.equal(decodeBase64Strict("YWJj\nYWJj"), null); // embedded newline
    assert.equal(decodeBase64Strict("YWJj YWJj"), null); // embedded space
    assert.equal(decodeBase64Strict("<script>"), null);
  });

  it("rejects strings whose length is not a multiple of 4", () => {
    assert.equal(decodeBase64Strict("YWJ"), null);
    assert.equal(decodeBase64Strict("Y"), null);
  });

  it("rejects misplaced or excess padding", () => {
    assert.equal(decodeBase64Strict("YW=j"), null); // padding not at end
    assert.equal(decodeBase64Strict("Y==="), null); // 3 padding chars
    assert.equal(decodeBase64Strict("===="), null); // all padding
  });
});

// ---------------------------------------------------------------------------
// isValidMimeType
// ---------------------------------------------------------------------------

describe("isValidMimeType", () => {
  it("accepts common MIME types", () => {
    assert.equal(isValidMimeType("application/pdf"), true);
    assert.equal(
      isValidMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
      true,
    );
    assert.equal(isValidMimeType("text/plain"), true);
  });

  it("rejects non-strings, empty, and malformed values", () => {
    assert.equal(isValidMimeType(undefined), false);
    assert.equal(isValidMimeType(42), false);
    assert.equal(isValidMimeType(""), false);
    assert.equal(isValidMimeType("no-slash"), false);
    assert.equal(isValidMimeType("too/many/slashes"), false);
  });

  it("rejects CRLF and whitespace (header-injection guard)", () => {
    assert.equal(isValidMimeType("text/plain\r\nX-Evil: 1"), false);
    assert.equal(isValidMimeType("text/plain "), false);
    assert.equal(isValidMimeType("text/pla in"), false);
  });

  it("rejects overlong values", () => {
    assert.equal(isValidMimeType(`a/${"b".repeat(300)}`), false);
  });
});

// ---------------------------------------------------------------------------
// resolveUploadMimeType
// ---------------------------------------------------------------------------

describe("resolveUploadMimeType", () => {
  it("explicit valid mimeType wins over the extension", () => {
    assert.equal(resolveUploadMimeType("brief.docx", "application/pdf"), "application/pdf");
  });

  it("explicit invalid mimeType → null (caller fails closed)", () => {
    assert.equal(resolveUploadMimeType("brief.docx", "bad mime\r\n"), null);
    assert.equal(resolveUploadMimeType("brief.docx", 42), null);
  });

  it("derives from the name extension when no explicit mimeType", () => {
    assert.equal(
      resolveUploadMimeType("brief.docx", undefined),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.equal(resolveUploadMimeType("scan.pdf", undefined), "application/pdf");
    assert.equal(resolveUploadMimeType("notes.md", undefined), "text/plain");
    assert.equal(resolveUploadMimeType("notes.txt", undefined), "text/plain");
    assert.equal(resolveUploadMimeType("BRIEF.DOCX", undefined), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });

  it("unknown extension or non-string name without explicit mimeType → application/octet-stream", () => {
    assert.equal(resolveUploadMimeType("archive.zip", undefined), "application/octet-stream");
    assert.equal(resolveUploadMimeType("no-extension", undefined), "application/octet-stream");
    assert.equal(resolveUploadMimeType(undefined, undefined), "application/octet-stream");
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_MAX_UPLOAD_BYTES
// ---------------------------------------------------------------------------

describe("DEFAULT_MAX_UPLOAD_BYTES", () => {
  it("is 25 MB", () => {
    assert.equal(DEFAULT_MAX_UPLOAD_BYTES, 25 * 1024 * 1024);
  });
});
