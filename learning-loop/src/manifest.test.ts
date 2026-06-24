import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseManifest, serializeManifest, loadManifest, saveManifest,
  upsertDelivery, markProcessed,
} from "./manifest.ts";
import type { DeliveryRecord } from "./types.ts";

const rec = (over: Partial<DeliveryRecord> = {}): DeliveryRecord => ({
  vendorFileId: "FILE1", destinationKind: "gdrive", matter: "POS-1",
  agentId: "ag1", skillSlug: "legal-nda-playbook", deliveredAt: "2026-06-23T00:00:00Z",
  draftHash: "h0", draftPath: "/x.md", ...over,
});

test("serialize then parse round-trips", () => {
  const r = [rec()];
  assert.deepEqual(parseManifest(serializeManifest(r)), r);
});

test("loadManifest returns [] for a fresh dir", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  assert.deepEqual(await loadManifest(dir), []);
});

test("save then load round-trips", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ll-"));
  await saveManifest(dir, [rec()]);
  assert.deepEqual(await loadManifest(dir), [rec()]);
});

test("upsertDelivery replaces by vendorFileId (latest delivery wins)", () => {
  const r1 = [rec({ draftHash: "h0" })];
  const r2 = upsertDelivery(r1, rec({ draftHash: "h1" }));
  assert.equal(r2.length, 1);
  assert.equal(r2[0].draftHash, "h1");
});

test("markProcessed sets lastProcessedHash on the matching record", () => {
  const r = markProcessed([rec()], "FILE1", "hX");
  assert.equal(r[0].lastProcessedHash, "hX");
});
