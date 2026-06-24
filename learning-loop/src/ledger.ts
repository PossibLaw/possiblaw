import type { Lesson, LessonStatus } from "./types.ts";

export function nextLessonId(existing: Lesson[], dateStr: string): string {
  const prefix = `LRN-${dateStr}-`;
  const nums = existing
    .filter((l) => l.id.startsWith(prefix))
    .map((l) => parseInt(l.id.slice(prefix.length), 10))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export function serializeLedger(lessons: Lesson[]): string {
  return lessons.map((l) => JSON.stringify(l)).join("\n") + (lessons.length ? "\n" : "");
}

export function parseLedger(jsonl: string): Lesson[] {
  return jsonl
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => JSON.parse(s) as Lesson);
}

const VALID: Record<LessonStatus, LessonStatus[]> = {
  pending: ["accepted", "rejected"],
  accepted: ["archived"],
  rejected: [],
  archived: [],
};

export function setStatus(lessons: Lesson[], id: string, status: LessonStatus): Lesson[] {
  return lessons.map((l) => {
    if (l.id !== id) return l;
    if (!VALID[l.status].includes(status)) {
      throw new Error(`invalid status transition ${l.status} -> ${status} for ${id}`);
    }
    return { ...l, status };
  });
}

export function renderLedgerMarkdown(lessons: Lesson[]): string {
  const lines = ["# Learnings Ledger", ""];
  for (const l of lessons) {
    lines.push(`## ${l.id} — ${l.topic} (${l.status})`);
    lines.push(`- Created: ${l.createdAt}`);
    lines.push(`- Lesson: ${l.text}`);
    lines.push(`- Sources: ${l.sources.map((s) => s.matterId).join(", ") || "(none)"}`);
    lines.push("");
  }
  return lines.join("\n");
}
