import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeLesson } from "./sanitizer.ts";

test("clean generalized lesson passes even with entities supplied", () => {
  const r = sanitizeLesson("Cap indemnity at fees paid for mutual NDAs.", ["ACME Inc.", "Globex Corp."]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});

test("a leaked party name token fails closed", () => {
  const r = sanitizeLesson("ACME always wants a two-year term.", ["ACME Inc."]);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.startsWith("entity")));
});

test("an email address fails closed", () => {
  const r = sanitizeLesson("Send drafts to jane@acme.com first.", []);
  assert.equal(r.ok, false);
  assert.ok(r.violations.includes("pattern:email"));
});

test("org stopwords alone do not trip the wall", () => {
  const r = sanitizeLesson("Prefer LLC over Inc for new entities.", ["ACME Inc."]);
  assert.equal(r.ok, true);
});

test("a short party-name acronym fails closed", () => {
  const r = sanitizeLesson("BP acquired the target this quarter.", ["BP"]);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.startsWith("entity")));
});
