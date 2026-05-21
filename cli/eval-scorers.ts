/**
 * PossibLaw v2 — Eval scoring functions (Sprint 9).
 *
 * Each scorer compares the model's predicted output against a gold standard.
 * All scores are in [0, 1]. Tolerances are documented per function.
 */

// ---------------------------------------------------------------------------
// CUAD — Span-overlap F1
// ---------------------------------------------------------------------------

/**
 * Compute character-level token-overlap F1 between predicted text and gold spans.
 *
 * Tolerance: case-insensitive, whitespace-normalized. A prediction scores 1.0
 * if the gold span text appears verbatim (normalised) anywhere in the prediction,
 * and scores by word-level F1 overlap otherwise.
 *
 * Gold spans: array of {start, end, text} (character offsets into the source document).
 * If gold_spans is empty and gold_label is 'NOT_FOUND', scores 1.0 iff prediction
 * contains 'NOT_FOUND'.
 */
export function scoreCuad(
  predicted: string,
  gold: { spans: Array<{ start: number; end: number; text: string }> }
): number {
  if (gold.spans.length === 0) {
    // No span — "NOT_FOUND" prediction is correct
    return /not.found/i.test(predicted) ? 1.0 : 0.0;
  }

  // Take best F1 across gold spans (multiple valid answers)
  let bestF1 = 0;
  for (const span of gold.spans) {
    const f1 = wordOverlapF1(normalize(predicted), normalize(span.text));
    if (f1 > bestF1) bestF1 = f1;
  }
  return bestF1;
}

// ---------------------------------------------------------------------------
// MAUD — Per-question accuracy (multiple-choice)
// ---------------------------------------------------------------------------

/**
 * Exact-match after normalization.
 * Tolerance: case-insensitive, whitespace-normalized. Checks whether the
 * gold answer appears anywhere in the predicted text (substring match).
 * Scores 1.0 for a match, 0.0 otherwise.
 */
export function scoreMaud(
  predicted: string,
  gold: { answer: string }
): number {
  const pred = normalize(predicted);
  const ans = normalize(gold.answer);
  if (pred === ans) return 1.0;
  if (pred.includes(ans)) return 1.0;
  // Accept first-character / letter shorthand (e.g. predicted "A" vs answer "A. blah")
  if (ans.length > 0 && pred.startsWith(ans[0])) return 0.5;
  return 0.0;
}

// ---------------------------------------------------------------------------
// UNFAIR-ToS — Clause classification F1
// ---------------------------------------------------------------------------

/**
 * Binary fair/unfair classification accuracy.
 * Tolerance: prediction is searched for keywords 'unfair', 'potentially unfair',
 * 'clause', 'problematic' to detect an "unfair" prediction; otherwise 'fair'.
 * Returns 1.0 on correct label, 0.0 otherwise.
 */
export function scoreUnfairTos(
  predicted: string,
  gold: { label: 'fair' | 'unfair' }
): number {
  const pred = predicted.toLowerCase();
  const predictedLabel: 'fair' | 'unfair' =
    /unfair|potentially.unfair|problematic|violat|harmful|unreasonab/i.test(pred)
      ? 'unfair'
      : 'fair';
  return predictedLabel === gold.label ? 1.0 : 0.0;
}

// ---------------------------------------------------------------------------
// LEDGAR — Topic-classification accuracy
// ---------------------------------------------------------------------------

/**
 * Exact label match after normalization (case-insensitive).
 * Tolerance: 1.0 for exact or substring match of the gold topic in the prediction.
 * 0.0 otherwise.
 */
export function scoreLedgar(
  predicted: string,
  gold: { topic: string }
): number {
  const pred = normalize(predicted);
  const topic = normalize(gold.topic);
  if (pred === topic) return 1.0;
  if (pred.includes(topic)) return 1.0;
  if (topic.includes(pred) && pred.length > 3) return 0.5;
  return 0.0;
}

// ---------------------------------------------------------------------------
// ACORD — Structured field extraction accuracy
// ---------------------------------------------------------------------------

/**
 * Per-field exact-match accuracy averaged across all gold fields.
 * Tolerance: case-insensitive, whitespace-normalized.
 * For each gold field, scores 1.0 if the gold value appears verbatim (normalised)
 * anywhere in the predicted text; 0.0 otherwise.
 * Final score = matched_fields / total_fields.
 */
export function scoreAcord(
  predicted: string,
  gold: { fields: Record<string, string> }
): number {
  const entries = Object.entries(gold.fields);
  if (entries.length === 0) return 1.0;

  const pred = normalize(predicted);
  let matched = 0;

  for (const [, value] of entries) {
    if (pred.includes(normalize(value))) matched++;
  }

  return matched / entries.length;
}

// ---------------------------------------------------------------------------
// Confusion matrix helper
// ---------------------------------------------------------------------------

export interface ConfusionEntry {
  predicted: string;
  gold: string;
  count: number;
}

/**
 * Build a flat confusion matrix from arrays of predicted and gold labels.
 * Returns entries sorted by count descending.
 */
export function buildConfusionMatrix(
  predictions: string[],
  golds: string[]
): ConfusionEntry[] {
  const counts = new Map<string, number>();
  for (let i = 0; i < predictions.length; i++) {
    const key = `${predictions[i]}|||${golds[i]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => {
      const [predicted, gold] = key.split('|||') as [string, string];
      return { predicted, gold, count };
    })
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenize(s: string): string[] {
  return s.split(/\s+/).filter((t) => t.length > 0);
}

function wordOverlapF1(a: string, b: string): number {
  if (a === b) return 1.0;
  const tokA = new Set(tokenize(a));
  const tokB = new Set(tokenize(b));
  if (tokA.size === 0 || tokB.size === 0) return 0.0;

  let common = 0;
  for (const t of tokA) {
    if (tokB.has(t)) common++;
  }
  if (common === 0) return 0.0;

  const precision = common / tokA.size;
  const recall = common / tokB.size;
  return (2 * precision * recall) / (precision + recall);
}
