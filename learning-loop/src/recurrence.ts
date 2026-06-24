import type { Lesson } from "./types.ts";

export function distinctMattersByTopic(lessons: Lesson[]): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const l of lessons) {
    if (l.status !== "accepted") continue;
    const set = sets.get(l.topic) ?? new Set<string>();
    for (const s of l.sources) set.add(s.matterId);
    sets.set(l.topic, set);
  }
  return new Map([...sets].map(([k, v]) => [k, v.size]));
}

export function topicsAtThreshold(lessons: Lesson[], n = 3): string[] {
  return [...distinctMattersByTopic(lessons)]
    .filter(([, count]) => count >= n)
    .map(([topic]) => topic);
}
