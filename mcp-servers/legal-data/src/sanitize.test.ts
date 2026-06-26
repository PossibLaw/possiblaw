// mcp-servers/legal-data/src/sanitize.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeQuery } from "./sanitize.ts";

test("standard tier passes the query through unchanged", () => {
  const r = sanitizeQuery("ACME Inc. arbitration clause", "standard");
  assert.equal(r.query, "ACME Inc. arbitration clause");
  assert.equal(r.redactions.length, 0);
});

test("confidential tier strips legal-entity client identifiers", () => {
  const r = sanitizeQuery("ACME Inc. v. Smith indemnification dispute", "confidential");
  assert.ok(!/ACME Inc\./.test(r.query), `entity name leaked: ${r.query}`);
  assert.ok(r.redactions.length >= 1);
  // neutral legal terms survive
  assert.match(r.query, /indemnification/);
});

test("privileged tier strips emails and SSNs", () => {
  const r = sanitizeQuery("contact jane@acme.com SSN 123-45-6789 breach", "privileged");
  assert.ok(!/jane@acme\.com/.test(r.query), `email leaked: ${r.query}`);
  assert.ok(!/123-45-6789/.test(r.query), `ssn leaked: ${r.query}`);
  assert.match(r.query, /breach/);
});

test("confidential tier strips a Party=... matter caption", () => {
  const r = sanitizeQuery("Globex Holdings LLP merger antitrust review", "confidential");
  assert.ok(!/Globex Holdings LLP/.test(r.query));
  assert.match(r.query, /antitrust/);
});

test("redaction never leaves an empty query when neutral terms remain", () => {
  const r = sanitizeQuery("ACME Inc. software license", "confidential");
  assert.ok(r.query.trim().length > 0);
});
