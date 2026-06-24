import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { DeliveryRecord } from "./types.ts";

export function serializeManifest(records: DeliveryRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
}

export function parseManifest(jsonl: string): DeliveryRecord[] {
  return jsonl.split("\n").map((s) => s.trim()).filter(Boolean)
    .map((s) => JSON.parse(s) as DeliveryRecord);
}

export async function loadManifest(businessDir: string): Promise<DeliveryRecord[]> {
  try {
    const raw = await readFile(join(businessDir, "deliveries", "manifest.jsonl"), "utf8");
    return parseManifest(raw);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function saveManifest(businessDir: string, records: DeliveryRecord[]): Promise<void> {
  const dir = join(businessDir, "deliveries");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "manifest.jsonl"), serializeManifest(records), "utf8");
}

export function upsertDelivery(records: DeliveryRecord[], rec: DeliveryRecord): DeliveryRecord[] {
  const without = records.filter((r) => r.vendorFileId !== rec.vendorFileId);
  return [...without, rec];
}

export function markProcessed(records: DeliveryRecord[], vendorFileId: string, hash: string): DeliveryRecord[] {
  return records.map((r) => (r.vendorFileId === vendorFileId ? { ...r, lastProcessedHash: hash } : r));
}
