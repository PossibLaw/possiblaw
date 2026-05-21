/**
 * ACORD dataset fetch script.
 *
 * License: ACORD forms are copyrighted by ACORD Corporation.
 *          Use restricted to research/evaluation only.
 *          See METADATA.json for details.
 *
 * NOTE: Unlike other datasets, ACORD has no public HuggingFace corpus.
 * This script uses synthetic samples that mirror the public ACORD form schema
 * for research and evaluation purposes only.
 * No real ACORD-licensed form content is bundled or fetched.
 *
 * Usage:
 *   node --loader tsx layer/evals/datasets/acord/fetch.ts [--limit N]
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, 'cache');
const SAMPLES_FILE = join(CACHE_DIR, 'samples.jsonl');
const METADATA_FILE = join(__dirname, 'METADATA.json');

export interface AcordSample {
  id: string;
  text: string;
  form_type: string;
  gold_label: string;
  gold_fields: Record<string, string>;
}

/** Synthetic ACORD-schema samples — mirrors public ACORD 25 / 27 form field structure. */
const SYNTHETIC_SAMPLES: AcordSample[] = [
  {
    id: 'acord-synth-001',
    form_type: 'ACORD 25 (Certificate of Liability Insurance)',
    text: 'CERTIFICATE OF LIABILITY INSURANCE\nNAMED INSURED: Apex Tech LLC\nADDRESS: 100 Innovation Dr, Austin TX 78701\nINSURER: Continental Insurance Co\nPOLICY NUMBER: GL-2025-88412\nEFFECTIVE DATE: 2025-01-01\nEXPIRATION DATE: 2026-01-01\nEACH OCCURRENCE LIMIT: $1,000,000\nGENERAL AGGREGATE LIMIT: $2,000,000',
    gold_label: 'Apex Tech LLC',
    gold_fields: {
      named_insured: 'Apex Tech LLC',
      insurer: 'Continental Insurance Co',
      policy_number: 'GL-2025-88412',
      effective_date: '2025-01-01',
      expiration_date: '2026-01-01',
      each_occurrence_limit: '$1,000,000',
      general_aggregate_limit: '$2,000,000',
    },
  },
  {
    id: 'acord-synth-002',
    form_type: 'ACORD 25 (Certificate of Liability Insurance)',
    text: 'CERTIFICATE OF LIABILITY INSURANCE\nNAMED INSURED: BuildRight Construction Inc\nADDRESS: 500 Builder Blvd, Denver CO 80201\nINSURER: Liberty Mutual Insurance\nPOLICY NUMBER: WC-2025-44210\nEFFECTIVE DATE: 2025-03-15\nEXPIRATION DATE: 2026-03-15\nEACH OCCURRENCE LIMIT: $500,000\nGENERAL AGGREGATE LIMIT: $1,000,000',
    gold_label: 'BuildRight Construction Inc',
    gold_fields: {
      named_insured: 'BuildRight Construction Inc',
      insurer: 'Liberty Mutual Insurance',
      policy_number: 'WC-2025-44210',
      effective_date: '2025-03-15',
      expiration_date: '2026-03-15',
      each_occurrence_limit: '$500,000',
      general_aggregate_limit: '$1,000,000',
    },
  },
  {
    id: 'acord-synth-003',
    form_type: 'ACORD 27 (Evidence of Property Insurance)',
    text: 'EVIDENCE OF PROPERTY INSURANCE\nNAMED INSURED: Riverside Realty Partners\nADDRESS: 2200 River Walk, Chicago IL 60601\nINSURER: Travelers Property Casualty\nPOLICY NUMBER: CP-2025-77831\nEFFECTIVE DATE: 2025-06-01\nEXPIRATION DATE: 2026-06-01\nCOVERAGE AMOUNT: $5,000,000\nDEDUCTIBLE: $25,000',
    gold_label: 'Riverside Realty Partners',
    gold_fields: {
      named_insured: 'Riverside Realty Partners',
      insurer: 'Travelers Property Casualty',
      policy_number: 'CP-2025-77831',
      effective_date: '2025-06-01',
      expiration_date: '2026-06-01',
      coverage_amount: '$5,000,000',
      deductible: '$25,000',
    },
  },
];

function parseLimitArg(): number | null {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const limit = parseLimitArg() ?? SYNTHETIC_SAMPLES.length;
  const samples = SYNTHETIC_SAMPLES.slice(0, limit);

  console.log(`[acord/fetch] Using ${samples.length} synthetic ACORD-schema samples (research use only — no real ACORD form content).`);

  writeFileSync(SAMPLES_FILE, samples.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');

  const meta = JSON.parse(readFileSync(METADATA_FILE, 'utf8')) as Record<string, unknown>;
  meta['fetched_at'] = new Date().toISOString();
  meta['num_samples_cached'] = samples.length;
  writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(`[acord/fetch] Done. ${samples.length} samples written to ${SAMPLES_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error('[acord/fetch] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export function loadSamples(limit?: number): AcordSample[] {
  if (existsSync(SAMPLES_FILE)) {
    const raw = readFileSync(SAMPLES_FILE, 'utf8');
    const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
    const samples = lines.map((l) => JSON.parse(l) as AcordSample);
    return limit ? samples.slice(0, limit) : samples;
  }
  // Fall back to in-memory synthetic samples
  return limit ? SYNTHETIC_SAMPLES.slice(0, limit) : [...SYNTHETIC_SAMPLES];
}

export const isCached = (): boolean => existsSync(SAMPLES_FILE);
