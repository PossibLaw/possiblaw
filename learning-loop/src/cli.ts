import { loadStore, saveStore } from "./store.ts";
import { sanitizeLesson } from "./sanitizer.ts";
import { nextLessonId, setStatus } from "./ledger.ts";
import { appendLesson } from "./memory.ts";
import { topicsAtThreshold } from "./recurrence.ts";
import type { Lesson } from "./types.ts";

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function args(argv: string[], name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === `--${name}`) out.push(argv[i + 1]);
  return out;
}
function isoNow(): string {
  return new Date().toISOString();
}

export async function run(argv: string[]): Promise<{ code: number; stdout: string }> {
  const cmd = argv[0];
  const dir = arg(argv, "business");
  if (!cmd || !dir) return { code: 1, stdout: "usage: <propose|accept|reject|recurring|render> --business <dir> ..." };

  const lessons = await loadStore(dir);

  if (cmd === "propose") {
    const text = arg(argv, "text") ?? "";
    const entities = args(argv, "entity");
    const sane = sanitizeLesson(text, entities);
    if (!sane.ok) return { code: 2, stdout: JSON.stringify({ ok: false, violations: sane.violations }) };
    const now = isoNow();
    const id = nextLessonId(lessons, now.slice(0, 10).replace(/-/g, ""));
    const lesson: Lesson = {
      id, createdAt: now, text, topic: arg(argv, "topic") ?? "general", status: "pending",
      sources: [{ matterId: arg(argv, "matter") ?? "", feedback: arg(argv, "feedback") ?? "" }],
    };
    const { lessons: next, action } = appendLesson(lessons, lesson);
    if (action === "duplicate") return { code: 0, stdout: "duplicate" };
    await saveStore(dir, next);
    return { code: 0, stdout: id };
  }

  if (cmd === "accept" || cmd === "reject") {
    const id = arg(argv, "id");
    if (!id) return { code: 1, stdout: "missing --id" };
    const next = setStatus(lessons, id, cmd === "accept" ? "accepted" : "rejected");
    await saveStore(dir, next);
    return { code: 0, stdout: id };
  }

  if (cmd === "recurring") {
    const n = parseInt(arg(argv, "n") ?? "3", 10);
    return { code: 0, stdout: JSON.stringify(topicsAtThreshold(lessons, n)) };
  }

  if (cmd === "render") {
    await saveStore(dir, lessons);
    return { code: 0, stdout: "rendered" };
  }

  return { code: 1, stdout: `unknown command: ${cmd}` };
}

// Process entrypoint (not exercised by unit tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).then((r) => {
    process.stdout.write(r.stdout + "\n");
    process.exit(r.code);
  });
}
