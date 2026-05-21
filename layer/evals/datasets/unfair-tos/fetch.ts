/**
 * UNFAIR-ToS dataset fetch script.
 *
 * Source:  HuggingFace lex_glue (unfair_tos subset) — also available via
 *          https://github.com/lpz-cla/unfair-tos
 * License: CC BY 4.0  https://creativecommons.org/licenses/by/4.0/
 * Paper:   Lippi et al. 2019  https://arxiv.org/abs/1805.01217
 *
 * Usage:
 *   node --loader tsx layer/evals/datasets/unfair-tos/fetch.ts [--limit N]
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CACHE_DIR = join(__dirname, 'cache');
const SAMPLES_FILE = join(CACHE_DIR, 'samples.jsonl');
const METADATA_FILE = join(__dirname, 'METADATA.json');

// UNFAIR-ToS labels (per LexGLUE benchmark)
// 0 = O (fair), 1 = CR, 2 = CH, 3 = TER, 4 = USE, 5 = LTD, 6 = J, 7 = PINC
export type UnfairTosLabel = 'fair' | 'unfair';

export interface UnfairTosSample {
  id: string;
  text: string;
  gold_label: UnfairTosLabel;
  category: string;
}

const HF_API_BASE = 'https://datasets-server.huggingface.co/rows';
const HF_DATASET = 'lex_glue';
const HF_CONFIG = 'unfair_tos';

/** Map LexGLUE integer label to 'fair' | 'unfair'. */
function mapLabel(label: number): UnfairTosLabel {
  // 0 = O (other/fair), any positive label = unfair
  return label === 0 ? 'fair' : 'unfair';
}

/** Category names for LexGLUE unfair_tos labels. */
const CATEGORY_NAMES: Record<number, string> = {
  0: 'O (Other/Fair)',
  1: 'CR (Content Removal)',
  2: 'CH (Contract by Using)',
  3: 'TER (Termination)',
  4: 'USE (Use of Data)',
  5: 'LTD (Limitation of Liability)',
  6: 'J (Jurisdiction)',
  7: 'PINC (Privacy Included)',
};

function parseLimitArg(): number | null {
  const idx = process.argv.indexOf('--limit');
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = parseInt(process.argv[idx + 1], 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

async function fetchPage(offset: number, length: number): Promise<UnfairTosSample[]> {
  const url =
    `${HF_API_BASE}?dataset=${encodeURIComponent(HF_DATASET)}&config=${HF_CONFIG}&split=train` +
    `&offset=${offset}&length=${length}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HF API returned ${res.status} for ${url}`);
  }

  interface HFRow {
    row: { text?: string; labels?: number[] };
    row_idx: number;
  }

  const data = (await res.json()) as { rows?: HFRow[] };
  if (!data.rows) return [];

  return data.rows.map((r: HFRow): UnfairTosSample => {
    const labels = r.row.labels ?? [0];
    const primaryLabel = labels[0] ?? 0;
    return {
      id: `unfair-tos-${r.row_idx}`,
      text: r.row.text ?? '',
      gold_label: mapLabel(primaryLabel),
      category: CATEGORY_NAMES[primaryLabel] ?? 'Unknown',
    };
  });
}

async function main(): Promise<void> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const limit = parseLimitArg() ?? 200;
  console.log(`[unfair-tos/fetch] Fetching up to ${limit} samples from HuggingFace...`);

  const samples: UnfairTosSample[] = [];
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

  console.log(`[unfair-tos/fetch] Done. ${samples.length} samples written to ${SAMPLES_FILE}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    console.error('[unfair-tos/fetch] Error:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export function loadSamples(limit?: number): UnfairTosSample[] {
  if (!existsSync(SAMPLES_FILE)) return [];
  const raw = readFileSync(SAMPLES_FILE, 'utf8');
  const lines = raw.trim().split('\n').filter((l) => l.trim() !== '');
  const samples = lines.map((l) => JSON.parse(l) as UnfairTosSample);
  return limit ? samples.slice(0, limit) : samples;
}

export const isCached = (): boolean => existsSync(SAMPLES_FILE);
