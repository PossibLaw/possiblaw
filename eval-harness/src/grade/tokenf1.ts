// eval-harness/src/grade/tokenf1.ts

/**
 * Token-level F1 similarity score between prediction and gold strings.
 * Tokenizes by splitting on non-word characters, drops empty tokens,
 * and computes F1 over multisets (set intersection for v1).
 * Returns 0..1.
 */
export function tokenF1(prediction: string, gold: string): number {
  const tokenize = (s: string): string[] =>
    s.toLowerCase().split(/\W+/).filter(t => t.length > 0);

  const predTokens = tokenize(prediction);
  const goldTokens = tokenize(gold);

  if (predTokens.length === 0 || goldTokens.length === 0) return 0;

  // Build multisets
  const predMap = toMultiset(predTokens);
  const goldMap = toMultiset(goldTokens);

  // Intersection count (min counts per token)
  let intersection = 0;
  for (const [token, count] of predMap) {
    const goldCount = goldMap.get(token) ?? 0;
    intersection += Math.min(count, goldCount);
  }

  if (intersection === 0) return 0;

  const precision = intersection / predTokens.length;
  const recall = intersection / goldTokens.length;
  return (2 * precision * recall) / (precision + recall);
}

function toMultiset(tokens: string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const t of tokens) {
    map.set(t, (map.get(t) ?? 0) + 1);
  }
  return map;
}
