/**
 * PossibLaw v2 — Per-dataset matter-prompt adapters (Sprint 9).
 *
 * Each adapter converts a normalized dataset sample into a matter prompt
 * that can be fed to a PossibLaw workflow.
 *
 * Prompt templates are designed to elicit the exact information needed
 * for the per-dataset scorer to evaluate the response.
 */

import type { CuadSample } from '../layer/evals/datasets/cuad/fetch.js';
import type { MaudSample } from '../layer/evals/datasets/maud/fetch.js';
import type { AcordSample } from '../layer/evals/datasets/acord/fetch.js';
import type { UnfairTosSample } from '../layer/evals/datasets/unfair-tos/fetch.js';
import type { LedgarSample } from '../layer/evals/datasets/ledgar/fetch.js';

// ---------------------------------------------------------------------------
// CUAD adapter
// ---------------------------------------------------------------------------

/**
 * Template: "Review this contract excerpt and identify the <question> clause.
 * Return the exact text of that clause if present, or 'NOT_FOUND' if absent."
 *
 * Scorer: scoreCuad — looks for span overlap with gold spans.
 */
export function adaptCuad(sample: CuadSample): string {
  const truncatedText = sample.text.length > 4000
    ? sample.text.slice(0, 4000) + '\n[...text truncated for eval...]'
    : sample.text;

  return (
    `Review this contract excerpt and identify the "${sample.question}" clause.\n` +
    `Return the exact text of that clause if present, or "NOT_FOUND" if absent.\n` +
    `Do not add commentary — return only the clause text or NOT_FOUND.\n\n` +
    `Contract excerpt:\n${truncatedText}`
  );
}

// ---------------------------------------------------------------------------
// MAUD adapter
// ---------------------------------------------------------------------------

/**
 * Template: "Read this merger agreement excerpt and answer the question by
 * selecting the best answer from the provided choices."
 *
 * Scorer: scoreMaud — checks for answer string in prediction.
 */
export function adaptMaud(sample: MaudSample): string {
  const truncatedText = sample.text.length > 4000
    ? sample.text.slice(0, 4000) + '\n[...text truncated for eval...]'
    : sample.text;

  const choiceList = sample.choices.length > 0
    ? `\nChoices:\n${sample.choices.map((c, i) => `  ${String.fromCharCode(65 + i)}. ${c}`).join('\n')}`
    : '';

  return (
    `Read this merger agreement excerpt and answer the question below.\n` +
    `Select the single best answer.${choiceList ? ' Return only the letter and answer text.' : ' Return your answer concisely.'}\n\n` +
    `Question: ${sample.question}${choiceList}\n\n` +
    `Excerpt:\n${truncatedText}`
  );
}

// ---------------------------------------------------------------------------
// ACORD adapter
// ---------------------------------------------------------------------------

/**
 * Template: "Extract key fields from this insurance certificate.
 * Return each field on its own line as 'FIELD_NAME: value'."
 *
 * Scorer: scoreAcord — checks that gold field values appear in prediction.
 */
export function adaptAcord(sample: AcordSample): string {
  return (
    `Extract the following key fields from this ${sample.form_type} document.\n` +
    `Return each field on its own line in the format "FIELD_NAME: value".\n` +
    `Fields to extract: named_insured, insurer, policy_number, effective_date, expiration_date, ` +
    `each_occurrence_limit, general_aggregate_limit, coverage_amount, deductible.\n` +
    `If a field is not present, write "FIELD_NAME: NOT_FOUND".\n\n` +
    `Document:\n${sample.text}`
  );
}

// ---------------------------------------------------------------------------
// UNFAIR-ToS adapter
// ---------------------------------------------------------------------------

/**
 * Template: "Classify this Terms of Service clause as 'fair' or 'unfair'.
 * If unfair, briefly state why."
 *
 * Scorer: scoreUnfairTos — looks for unfair keywords in prediction.
 */
export function adaptUnfairTos(sample: UnfairTosSample): string {
  return (
    `Classify this Terms of Service clause as either "fair" or "unfair" from a consumer protection perspective.\n` +
    `An unfair clause is one that may violate consumer rights, limit user recourse, allow unexpected data use,\n` +
    `impose unreasonable liability, or allow unilateral changes without notice.\n\n` +
    `Respond with exactly one of: "FAIR" or "UNFAIR", followed by a one-sentence reason.\n\n` +
    `Clause:\n${sample.text}`
  );
}

// ---------------------------------------------------------------------------
// LEDGAR adapter
// ---------------------------------------------------------------------------

/**
 * Template: "Identify the topic category of this legal contract provision."
 *
 * Scorer: scoreLedgar — checks for topic string in prediction.
 */
export function adaptLedgar(sample: LedgarSample): string {
  return (
    `Identify the primary topic category of this legal contract provision.\n` +
    `Return the category name only (e.g. "Termination", "Indemnification", "Governing Law",\n` +
    `"Confidentiality", "Intellectual Property", "Warranties", "Assignment", etc.).\n\n` +
    `Provision:\n${sample.text}`
  );
}

// ---------------------------------------------------------------------------
// Generic adapter dispatcher
// ---------------------------------------------------------------------------

export type KnownDataset = 'cuad' | 'maud' | 'acord' | 'unfair-tos' | 'ledgar';

export function adaptSample(
  dataset: KnownDataset,
  sample: Record<string, unknown>
): string {
  switch (dataset) {
    case 'cuad':
      return adaptCuad(sample as unknown as CuadSample);
    case 'maud':
      return adaptMaud(sample as unknown as MaudSample);
    case 'acord':
      return adaptAcord(sample as unknown as AcordSample);
    case 'unfair-tos':
      return adaptUnfairTos(sample as unknown as UnfairTosSample);
    case 'ledgar':
      return adaptLedgar(sample as unknown as LedgarSample);
  }
}
