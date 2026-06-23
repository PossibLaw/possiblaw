// gate-proxy/src/document-text.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDocumentText } from "./document-text.ts";

test("extracts the mapped field for each gated tool", () => {
  assert.equal(extractDocumentText("file_court_document", { documentText: "Brief re Roe v. Wade" }), "Brief re Roe v. Wade");
  assert.equal(extractDocumentText("upload_document", { content: "memo body" }), "memo body");
  assert.equal(extractDocumentText("send_email", { body: "email body" }), "email body");
});

test("returns null when the document field is absent or not a string", () => {
  assert.equal(extractDocumentText("file_court_document", {}), null);
  assert.equal(extractDocumentText("file_court_document", { documentText: 42 }), null);
  assert.equal(extractDocumentText("send_email", { subject: "no body here" }), null);
});

test("returns null for tools that carry no reviewable document", () => {
  assert.equal(extractDocumentText("send_payment", { amount: 100 }), null);
});
