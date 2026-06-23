import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { Lesson } from "./types.ts";
import { parseLedger, serializeLedger, renderLedgerMarkdown } from "./ledger.ts";
import { renderHotMemory } from "./memory.ts";

const HOT_MAX_LINES = 100;

export async function loadStore(businessDir: string): Promise<Lesson[]> {
  try {
    const raw = await readFile(join(businessDir, "learnings", "ledger.jsonl"), "utf8");
    return parseLedger(raw);
  } catch (e: unknown) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function saveStore(businessDir: string, lessons: Lesson[]): Promise<void> {
  const learnings = join(businessDir, "learnings");
  const memory = join(businessDir, "memory");
  const archive = join(memory, "archive");
  await mkdir(learnings, { recursive: true });
  await mkdir(archive, { recursive: true });

  await writeFile(join(learnings, "ledger.jsonl"), serializeLedger(lessons), "utf8");
  await writeFile(join(learnings, "ledger.md"), renderLedgerMarkdown(lessons), "utf8");

  const { hot, overflow } = renderHotMemory(lessons, { maxLines: HOT_MAX_LINES });
  await writeFile(join(memory, "firm-memory.md"), hot, "utf8");
  if (overflow.length) {
    const day = (overflow[0].createdAt || "archive").slice(0, 10);
    const block = overflow.map((l) => `- (${l.topic}) [${l.id}] ${l.text}`).join("\n") + "\n";
    await appendFile(join(archive, `${day}.md`), block, "utf8");
  }
}
