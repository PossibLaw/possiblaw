/**
 * LEDGAR dataset fetch script.
 *
 * Source:  HuggingFace lex_glue (ledgar subset)
 * License: CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
 * Paper:   Tuggener et al. 2020  https://aclanthology.org/2020.lrec-1.155/
 *
 * Usage:
 *   node --loader tsx layer/evals/datasets/ledgar/fetch.ts [--limit N]
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, 'cache');
const SAMPLES_FILE = join(CACHE_DIR, 'samples.jsonl');
const METADATA_FILE = join(__dirname, 'METADATA.json');

export interface LedgarSample {
  id: string;
  text: string;
  gold_label: string;
  topic: string;
}

const HF_API_BASE = 'https://datasets-server.huggingface.co/rows';
const HF_DATASET = 'lex_glue';
const HF_CONFIG = 'ledgar';

function parseLimitArg(): number | null {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function fetchPage(offset: number, length: number): Promise<LedgarSample[]> {
  const url =
    `${HF_API_BASE}?dataset=${encodeURIComponent(HF_DATASET)}&config=${HF_CONFIG}&split=train` +
    `&offset=${offset}&length=${length}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API returned ${res.status} for ${url}`);
  }

  interface HFRow {
    row: { provision?: string; label?: string | number };
    row_idx: number;
  }

  const data = (await res.json()) as { rows?: HFRow[] };
  if (!data.rows) return [];

  return data.rows.map((r: HFRow): LedgarSample => {
    const label = String(r.row.label ?? 'Unknown');
    return {
      id: `ledgar-${r.row_idx}`,
      text: r.row.provision ?? '',
      gold_label: label,
      topic: label,
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const limit = parseLimitArg() ?? 200;
  console.log(`[ledgar/fetch] Fetching up to ${limit} samples from HuggingFace...`);

  const samples: LedgarSample[] = [];
  const batchSize = Math.min(limit, 100);
  let offset = 0;

  while (samples.length < limit) {
    const batch = await fetchPage(offset, Math.min(batchSize, limit - samples.length));
    if (batch.length === 0) break;
    samples.push(...batch);
    offset += batch.length;
    process.stdout.write(`  fetched ${samples.length}/${limit}\r`);
  }
  console.log('');

  writeFileSync(SAMPLES_FILE, samples.map((s) => JSON.stringify(s)).join('\n') + '\n', 'utf8');

  const meta = JSON.parse(readFileSync(METADATA_FILE, 'utf8')) as Record<string, unknown>;
  meta['fetched_at'] = new Date().toISOString();
  meta['num_samples_cached'] = samples.length;
  writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(`[ledgar/fetch] Done. ${samples.length} samples written to ${SAMPLES_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error('[ledgar/fetch] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export function loadSamples(limit?: number): LedgarSample[] {
  if (!existsSync(SAMPLES_FILE)) return [];
  const raw = readFileSync(SAMPLES_FILE, 'utf8');
  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const samples = lines.map((l) => JSON.parse(l) as LedgarSample);
  return limit ? samples.slice(0, limit) : samples;
}

export const isCached = (): boolean => existsSync(SAMPLES_FILE);
