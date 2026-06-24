import { createHash } from "node:crypto";

export function hashText(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function normLines(s: string): string[] {
  return s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 0);
}

export function diffLines(
  base: string,
  current: string,
): { changed: boolean; added: string[]; removed: string[] } {
  const b = normLines(base);
  const c = normLines(current);
  const bSet = new Set(b);
  const cSet = new Set(c);
  const added = c.filter((l) => !bSet.has(l));
  const removed = b.filter((l) => !cSet.has(l));
  return { changed: added.length > 0 || removed.length > 0, added, removed };
}
