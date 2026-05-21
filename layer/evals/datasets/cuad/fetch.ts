/**
 * CUAD dataset fetch script.
 *
 * Source:  HuggingFace theatticusproject/cuad-qa
 * License: CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
 * Paper:   Hendrycks et al. 2021  https://arxiv.org/abs/2103.06268
 *
 * Usage:
 *   node --loader tsx layer/evals/datasets/cuad/fetch.ts [--limit N]
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, 'cache');
const SAMPLES_FILE = join(CACHE_DIR, 'samples.jsonl');
const METADATA_FILE = join(__dirname, 'METADATA.json');

/** Normalized sample shape consumed by the eval harness. */
export interface CuadSample {
  id: string;
  text: string;
  question: string;
  gold_label: string;
  gold_spans: Array<{ start: number; end: number; text: string }>;
}

/**
 * HuggingFace datasets API — streaming parquet rows for the CUAD-QA split.
 * We hit the `/rows` endpoint which returns JSON paginated.
 */
const HF_API_BASE = 'https://datasets-server.huggingface.co/rows';
const HF_DATASET = 'theatticusproject/cuad-qa';

function parseLimitArg(): number | null {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function fetchPage(offset: number, length: number): Promise<CuadSample[]> {
  const url =
    `${HF_API_BASE}?dataset=${encodeURIComponent(HF_DATASET)}&config=default&split=train` +
    `&offset=${offset}&length=${length}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API returned ${res.status} for ${url}`);
  }

  interface HFRow {
    row: {
      id?: string;
      context?: string;
      question?: string;
      answers?: { text?: string[]; answer_start?: number[] };
    };
    row_idx: number;
  }

  const data = (await res.json()) as { rows?: HFRow[]; num_rows_total?: number };

  if (!data.rows) return [];

  return data.rows.map((r: HFRow): CuadSample => {
    const row = r.row;
    const context = row.context ?? '';
    const answerTexts: string[] = row.answers?.text ?? [];
    const answerStarts: number[] = row.answers?.answer_start ?? [];

    const gold_spans = answerTexts.map((t, i) => ({
      start: answerStarts[i] ?? 0,
      end: (answerStarts[i] ?? 0) + t.length,
      text: t,
    }));

    return {
      id: row.id ?? `cuad-${r.row_idx}`,
      text: context,
      question: row.question ?? '',
      gold_label: answerTexts[0] ?? 'NOT_FOUND',
      gold_spans,
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });

  const limit = parseLimitArg() ?? 200;
  console.log(`[cuad/fetch] Fetching up to ${limit} samples from HuggingFace...`);

  const samples: CuadSample[] = [];
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

  // Write samples.jsonl
  const lines = samples.map((s) => JSON.stringify(s)).join('\n') + '\n';
  writeFileSync(SAMPLES_FILE, lines, 'utf8');

  // Update metadata timestamp
  const meta = JSON.parse(readFileSync(METADATA_FILE, 'utf8')) as Record<string, unknown>;
  meta['fetched_at'] = new Date().toISOString();
  meta['num_samples_cached'] = samples.length;
  writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2) + '\n', 'utf8');

  console.log(`[cuad/fetch] Done. ${samples.length} samples written to ${SAMPLES_FILE}`);
}

// Only run as script (not when imported)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error('[cuad/fetch] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

/**
 * Load samples: if cache/samples.jsonl exists return those,
 * otherwise fall back to the bundled fixtures.jsonl.
 */
export function loadSamples(limit?: number): CuadSample[] {
  const source = existsSync(SAMPLES_FILE)
    ? SAMPLES_FILE
    : join(__dirname, 'fixtures.jsonl');

  const raw = readFileSync(source, 'utf8');
  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const samples = lines.map((l) => JSON.parse(l) as CuadSample);
  return limit ? samples.slice(0, limit) : samples;
}

export const isCached = (): boolean => existsSync(SAMPLES_FILE);
