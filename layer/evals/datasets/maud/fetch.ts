/**
 * MAUD dataset fetch script.
 *
 * Source:  HuggingFace theatticusproject/maud
 * License: CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
 * Paper:   Koreeda & Manning 2021  https://arxiv.org/abs/2301.00876
 *
 * Usage:
 *   node --loader tsx layer/evals/datasets/maud/fetch.ts [--limit N]
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, 'cache');
const SAMPLES_FILE = join(CACHE_DIR, 'samples.jsonl');
const METADATA_FILE = join(__dirname, 'METADATA.json');

export interface MaudSample {
  id: string;
  text: string;
  question: string;
  gold_label: string;
  choices: string[];
}

const HF_API_BASE = 'https://datasets-server.huggingface.co/rows';
const HF_DATASET = 'theatticusproject/maud';

function parseLimitArg(): number | null {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function fetchPage(offset: number, length: number): Promise<MaudSample[]> {
  const url =
    `${HF_API_BASE}?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train` +
    `&offset=${offset}&length=${length}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API returned ${res.status} for ${url}`);
  }

  interface HFRow {
    row: {
      example_id?: string;
      text?: string;
      question?: string;
      answer?: string;
      choices?: string[];
    };
    row_idx: number;
  }

  const data = (await res.json()) as { rows?: HFRow[] };
  if (!data.rows) return [];

  return data.rows.map((r: HFRow): MaudSample => {
    const row = r.row;
    return {
      id: row.example_id ?? `maud-${r.row_idx}`,
      text: row.text ?? '',
      question: row.question ?? '',
      gold_label: row.answer ?? '',
      choices: row.choices ?? [],
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const limit = parseLimitArg() ?? 200;
  console.log(`[maud/fetch] Fetching up to ${limit} samples from HuggingFace...`);

  const samples: MaudSample[] = [];
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

  console.log(`[maud/fetch] Done. ${samples.length} samples written to ${SAMPLES_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error('[maud/fetch] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export function loadSamples(limit?: number): MaudSample[] {
  if (!existsSync(SAMPLES_FILE)) {
    // No HF cache — return empty (MAUD has no bundled fixtures)
    return [];
  }
  const raw = readFileSync(SAMPLES_FILE, 'utf8');
  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const samples = lines.map((l) => JSON.parse(l) as MaudSample);
  return limit ? samples.slice(0, limit) : samples;
}

export const isCached = (): boolean => existsSync(SAMPLES_FILE);
