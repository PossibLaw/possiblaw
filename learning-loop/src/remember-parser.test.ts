import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRememberThis } from "./remember-parser.ts";

test("extracts a colon-form remember directive", () => {
  assert.equal(parseRememberThis("remember this: cap indemnity at fees paid"), "cap indemnity at fees paid");
});

test("extracts a 'for us' dash-form directive case-insensitively", () => {
  assert.equal(parseRememberThis("Remember this for us - always Delaware law"), "always Delaware law");
});

test("returns null when no directive present", () => {
  assert.equal(parseRememberThis("please review the draft"), null);
});
