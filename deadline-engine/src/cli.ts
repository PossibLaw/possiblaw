/**
 * cli.ts — Thin stdin/--json CLI wrapper for computeDeadline.
 *
 * Usage:
 *   echo '{"triggerDate":"2024-12-20","days":21,"direction":"forward","jurisdiction":"US-FED"}' \
 *     | node --import tsx deadline-engine/src/cli.ts
 *
 *   node --import tsx deadline-engine/src/cli.ts \
 *     --json '{"triggerDate":"2024-12-20","days":21,"direction":"forward","jurisdiction":"US-FED"}'
 *
 * Exit codes:
 *   0 — computed result or supported:false result written to stdout
 *   1 — malformed JSON or missing required fields
 */
import { computeDeadline, type DeadlineInput } from './engine.ts';

function parseArgs(): string | null {
  const idx = process.argv.indexOf('--json');
  if (idx !== -1 && process.argv[idx + 1] != null) {
    return process.argv[idx + 1];
  }
  return null;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  return Buffer.concat(chunks).toString('utf-8').trim();
}

function validateInput(raw: unknown): raw is DeadlineInput {
  if (typeof raw !== 'object' || raw === null) return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj['triggerDate'] === 'string' &&
    typeof obj['days'] === 'number' &&
    (obj['direction'] === 'forward' || obj['direction'] === 'backward') &&
    typeof obj['jurisdiction'] === 'string'
  );
}

async function main(): Promise<void> {
  let rawJson: string;

  const fromArg = parseArgs();
  if (fromArg != null) {
    rawJson = fromArg;
  } else {
    rawJson = await readStdin();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    process.stderr.write('deadline-engine: invalid JSON input\n');
    process.exit(1);
  }

  if (!validateInput(parsed)) {
    process.stderr.write(
      'deadline-engine: input must include triggerDate, days, direction, jurisdiction\n'
    );
    process.exit(1);
  }

  const result = computeDeadline(parsed);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`deadline-engine: unexpected error — ${String(err)}\n`);
  process.exit(1);
});
