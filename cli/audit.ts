/**
 * PossibLaw v2 — Append-only audit log.
 * Writes one JSON line per event to layer/audit/<matter-id>.jsonl.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from './loader.js';
import type { AuditEvent } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function auditDir(): string {
  return join(REPO_ROOT, 'layer', 'audit');
}

function auditPath(matterId: string): string {
  return join(auditDir(), `${matterId}.jsonl`);
}

// ---------------------------------------------------------------------------
// AuditLogger class
// ---------------------------------------------------------------------------

export class AuditLogger {
  private readonly matterId: string;
  private readonly filePath: string;

  constructor(matterId: string) {
    this.matterId = matterId;
    const dir = auditDir();
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.filePath = auditPath(matterId);
  }

  /** Append one audit event. Computes prompt_hash / output_hash from prompt / output fields. */
  log(event: Omit<AuditEvent, 'ts' | 'matter_id'> & { prompt?: string; output?: string }): void {
    const full: AuditEvent = {
      ts: new Date().toISOString(),
      matter_id: this.matterId,
      ...event,
      prompt_hash: event.prompt ? sha256(event.prompt) : event.prompt_hash,
      output_hash: event.output ? sha256(event.output) : event.output_hash,
    };
    appendFileSync(this.filePath, JSON.stringify(full) + '\n', 'utf8');
  }

  get path(): string {
    return this.filePath;
  }
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createAuditLog(matterId: string): AuditLogger {
  return new AuditLogger(matterId);
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export function replay(filePath: string): AuditEvent[] {
  if (!existsSync(filePath)) {
    return [];
  }
  const raw = readFileSync(filePath, 'utf8');
  return raw
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as AuditEvent);
}
