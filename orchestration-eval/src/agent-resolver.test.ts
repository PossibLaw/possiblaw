import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AgentResolutionError,
  buildAgentDirectory,
  isUuidLike,
  normalizeAgentSlug,
  strictUuidOnlyDirectory,
} from "./agent-resolver.ts";

const UUID_IMM = "11111111-1111-4111-8111-111111111111";
const UUID_COS = "22222222-2222-4222-8222-222222222222";
const UUID_DUP = "33333333-3333-4333-8333-333333333333";

test("1.1: normalizeAgentSlug mirrors paperclip's normalizeAgentUrlKey", () => {
  assert.equal(normalizeAgentSlug("Immigration Lead"), "immigration-lead");
  assert.equal(normalizeAgentSlug("  Chief of Staff! "), "chief-of-staff");
  assert.equal(normalizeAgentSlug("immigration-lead"), "immigration-lead");
  assert.equal(normalizeAgentSlug("---"), null);
  assert.equal(normalizeAgentSlug(undefined), null);
});

test("1.1: isUuidLike accepts UUIDs and rejects slugs", () => {
  assert.equal(isUuidLike(UUID_IMM), true);
  assert.equal(isUuidLike("immigration-lead"), false);
  assert.equal(isUuidLike(""), false);
});

test("1.1 happy: resolveId maps a manifest slug to the agent's UUID via urlKey", () => {
  const dir = buildAgentDirectory([
    { id: UUID_IMM, name: "Immigration Lead", urlKey: "immigration-lead" },
    { id: UUID_COS, name: "Chief of Staff", urlKey: "chief-of-staff" },
  ]);
  assert.equal(dir.resolveId("immigration-lead"), UUID_IMM);
  assert.equal(dir.resolveId("chief-of-staff"), UUID_COS);
});

test("1.1: resolveId falls back to normalized display name when urlKey is absent", () => {
  const dir = buildAgentDirectory([{ id: UUID_IMM, name: "Immigration Lead" }]);
  assert.equal(dir.resolveId("immigration-lead"), UUID_IMM);
});

test("1.1: resolveId passes UUIDs through unchanged", () => {
  const dir = buildAgentDirectory([]);
  assert.equal(dir.resolveId(UUID_IMM), UUID_IMM);
});

test("1.1 edge: duplicate display names -> AgentResolutionError naming the slug", () => {
  const dir = buildAgentDirectory([
    { id: UUID_IMM, name: "Immigration Lead" },
    { id: UUID_DUP, name: "Immigration  Lead" }, // normalizes to the same key
  ]);
  assert.throws(
    () => dir.resolveId("immigration-lead"),
    (e: unknown) =>
      e instanceof AgentResolutionError &&
      e.slug === "immigration-lead" &&
      /ambiguous/.test(e.message) &&
      /immigration-lead/.test(e.message),
  );
});

test("1.1 failure: unknown slug -> AgentResolutionError naming the slug", () => {
  const dir = buildAgentDirectory([{ id: UUID_COS, name: "Chief of Staff" }]);
  assert.throws(
    () => dir.resolveId("immigration-lead"),
    (e: unknown) =>
      e instanceof AgentResolutionError &&
      e.slug === "immigration-lead" &&
      /immigration-lead/.test(e.message),
  );
});

test("1.1: labelFor returns the agent's slug label, falling back to the raw id", () => {
  const dir = buildAgentDirectory([{ id: UUID_IMM, name: "Immigration Lead" }]);
  assert.equal(dir.labelFor(UUID_IMM), "immigration-lead");
  assert.equal(dir.labelFor("unknown-id"), "unknown-id");
  assert.equal(dir.labelFor(null), null);
});

test("1.1 security: strictUuidOnlyDirectory never passes a slug through", () => {
  const dir = strictUuidOnlyDirectory();
  assert.equal(dir.resolveId(UUID_IMM), UUID_IMM);
  assert.throws(() => dir.resolveId("immigration-lead"), AgentResolutionError);
});
