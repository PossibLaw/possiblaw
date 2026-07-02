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

// --- Fuzzy floor (Fix 5): case-insensitive already via norm(); add possessive/plural ---

test("a plural form of a multi-word party token fails closed", () => {
  // Substring path can't catch this (full phrase absent); token path must.
  const r = sanitizeLesson("Acmes shipped the redlines yesterday.", ["Acme Corp"]);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.startsWith("entity")));
});

test("a possessive form of a party token fails closed (straight and curly apostrophe)", () => {
  const straight = sanitizeLesson("Acme's preferred term is two years.", ["Acme Corp"]);
  assert.equal(straight.ok, false);
  assert.ok(straight.violations.some((v) => v.startsWith("entity")));
  const curly = sanitizeLesson("Acme’s preferred term is two years.", ["Acme Corp"]);
  assert.equal(curly.ok, false);
  assert.ok(curly.violations.some((v) => v.startsWith("entity")));
});

test("uppercase party token still fails closed (case folding)", () => {
  const r = sanitizeLesson("ACME wanted a carve-out.", ["Acme Corp"]);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.startsWith("entity")));
});

test("fuzzy floor does not over-match an unrelated longer word", () => {
  // "academy" must NOT trip the "acme" token — word boundary preserved.
  const r = sanitizeLesson("The academy shipped a template revision.", ["Acme Corp"]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.violations, []);
});
