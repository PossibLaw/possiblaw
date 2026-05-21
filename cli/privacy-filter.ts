/**
 * PossibLaw — Privacy Filter (Sprint 4).
 * Reversible entity substitution: encoder + decoder via local Ollama LLM,
 * with a deterministic rule-based fallback when Ollama is unavailable.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { REPO_ROOT } from './loader.js';
import { isOllamaAvailable, chat } from './ollama.js';

// ---------------------------------------------------------------------------
// Types (exported)
// ---------------------------------------------------------------------------

export interface PrivacyFilterProfile {
  mode: 'always' | 'cloud-only' | 'off';
}

export interface MaskedPayload {
  masked_text: string;
  key_store: Record<string, string>;
  /** Set to 'offline-fallback' when Ollama was unreachable and rule-based encoder was used. */
  mode?: 'llm' | 'offline-fallback';
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class PrivacyFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrivacyFilterError';
  }
}

// ---------------------------------------------------------------------------
// Key store persistence
// ---------------------------------------------------------------------------

function keyStorePath(matterId: string): string {
  return join(REPO_ROOT, 'layer', 'privacy-filter', 'keys', `${matterId}.json`);
}

export function loadKeyStore(matterId: string): Record<string, string> {
  const p = keyStorePath(matterId);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>;
  } catch {
    return {};
  }
}

export function saveKeyStore(matterId: string, store: Record<string, string>): void {
  const dir = join(REPO_ROOT, 'layer', 'privacy-filter', 'keys');
  mkdirSync(dir, { recursive: true });
  const p = keyStorePath(matterId);
  // Atomic write via temp file swap (best-effort on Node; no fs.rename race in single-process)
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  writeFileSync(p, JSON.stringify(store, null, 2), 'utf8');
  try {
    // remove temp if it lingered
    import('node:fs').then((m) => {
      try { m.unlinkSync(tmp); } catch { /* ignore */ }
    }).catch(() => undefined);
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Encoder prompt
// ---------------------------------------------------------------------------

const ENCODER_SYSTEM_PROMPT = `You are an entity-masking encoder. Given INPUT TEXT and EXISTING KEY STORE, identify every confidential business entity (person names, organization names, EINs, SSNs, addresses, monetary amounts in deal terms, deal codenames, account numbers) and replace each with an opaque token of the form «ENT_<TYPE>_<NNN>» where <TYPE> is one of: PERSON, ORG, EIN, SSN, ADDRESS, MONEY, CODENAME, ACCOUNT.

Reuse tokens from the EXISTING KEY STORE for entities you've masked before. For genuinely new entities, allocate fresh token numbers (start from the next available NNN).

Output STRICT JSON:
{
  "masked_text": "<the input text with entities replaced>",
  "new_entities": [{ "token": "«ENT_TYPE_NNN»", "original": "<original text>", "type": "<TYPE>" }]
}

Do NOT mask: dates, common nouns, generic legal phrases ("Confidential Information", "Force Majeure"), publicly-known company names from the operator's alias_hints, jurisdictions (Delaware, California, etc.).`;

// ---------------------------------------------------------------------------
// Decoder prompt
// ---------------------------------------------------------------------------

const DECODER_SYSTEM_PROMPT = `You are an entity-rehydration decoder. Given MASKED TEXT and KEY STORE, replace every «ENT_TYPE_NNN» token with the corresponding original value. If a token appears that's not in the KEY STORE, leave it untouched (we'll handle it post-process). If a token appears with slight variants (e.g., «ent_org_001» vs «ENT_ORG_001»), normalize to the KEY STORE form. Output ONLY the rehydrated text, no commentary, no JSON.`;

// ---------------------------------------------------------------------------
// Rule-based offline encoder
// ---------------------------------------------------------------------------

type EntityType = 'ORG' | 'EIN' | 'SSN' | 'ADDRESS' | 'MONEY' | 'EMAIL' | 'PHONE' | 'CODENAME';

interface RulePattern {
  type: EntityType;
  pattern: RegExp;
}

// Order matters: more specific patterns first.
// ORG pattern: one or more Title-Case words (each starts with uppercase), ending in a legal suffix.
// This prevents matching "NDA for ACME Corp" — "for" is lowercase so it breaks the sequence.
const RULE_PATTERNS: RulePattern[] = [
  { type: 'EIN',      pattern: /\b\d{2}-\d{7}\b/g },
  { type: 'SSN',      pattern: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: 'MONEY',    pattern: /\$[\d,]+(?:\.\d{2})?/g },
  { type: 'EMAIL',    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { type: 'PHONE',    pattern: /\b(?:\+1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { type: 'CODENAME', pattern: /'([A-Z][A-Za-z0-9 ]+)'/g },
  // ORG: sequence of 1+ Title-Case words (no lowercase words between them) ending in a legal suffix
  { type: 'ORG',      pattern: /\b(?:[A-Z][A-Za-z0-9]* )*(?:Corp|Inc|LLC|Ltd|GmbH|LLP|LP|Holdings|Partners|Group|Services|Solutions|Technologies|Capital|Ventures|Associates)\b/g },
  { type: 'ADDRESS',  pattern: /\b\d+\s+[A-Z][A-Za-z0-9\s,]+(?:Way|Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|Lane|Ln|Court|Ct|Place|Pl|Circle|Cir),\s*[A-Z][A-Za-z\s]+(?:\s+[A-Z]{2})?\b/g },
];

interface NewEntity {
  token: string;
  original: string;
  type: string;
}

function nextTokenNumber(keyStore: Record<string, string>, type: string): number {
  const prefix = `«ENT_${type}_`;
  let max = 0;
  for (const token of Object.keys(keyStore)) {
    if (token.startsWith(prefix)) {
      const numStr = token.slice(prefix.length).replace('»', '');
      const n = parseInt(numStr, 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max + 1;
}

function ruleBasedEncode(
  text: string,
  keyStore: Record<string, string>,
  aliasHints?: Record<string, string>
): { masked_text: string; new_entities: NewEntity[] } {
  // Build reverse map: original → token (for reuse)
  const reverseStore: Record<string, string> = {};
  for (const [token, original] of Object.entries(keyStore)) {
    reverseStore[original.toLowerCase()] = token;
  }

  let masked = text;
  const new_entities: NewEntity[] = [];
  const localCounters: Record<string, number> = {};

  // Apply alias hints first
  if (aliasHints) {
    for (const [codename, original] of Object.entries(aliasHints)) {
      if (reverseStore[original.toLowerCase()]) continue;
      const token = `«ENT_CODENAME_${nextTokenNumber(keyStore, 'CODENAME')}»`;
      keyStore[token] = original;
      reverseStore[original.toLowerCase()] = token;
      new_entities.push({ token, original, type: 'CODENAME' });

      const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      masked = masked.replace(new RegExp(escaped, 'g'), codename);
    }
  }

  for (const { type, pattern } of RULE_PATTERNS) {
    pattern.lastIndex = 0;
    masked = masked.replace(pattern, (match) => {
      const key = match.toLowerCase();
      if (reverseStore[key]) return reverseStore[key];

      // Allocate fresh token
      const baseNum = nextTokenNumber(keyStore, type);
      const offset = localCounters[type] ?? 0;
      localCounters[type] = offset + 1;
      const num = String(baseNum + offset).padStart(3, '0');
      const token = `«ENT_${type}_${num}»`;

      keyStore[token] = match;
      reverseStore[key] = token;
      new_entities.push({ token, original: match, type });
      return token;
    });
    pattern.lastIndex = 0;
  }

  return { masked_text: masked, new_entities };
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

export async function encode(
  text: string,
  matterId: string,
  opts?: { aliasHints?: Record<string, string> }
): Promise<MaskedPayload> {
  const keyStore = loadKeyStore(matterId);

  // Try Ollama first
  const ollamaAvailable = await isOllamaAvailable();

  if (ollamaAvailable) {
    // Apply alias hints to key store before LLM call
    if (opts?.aliasHints) {
      for (const [codename, original] of Object.entries(opts.aliasHints)) {
        // Register codename → original mapping so LLM can reuse it
        // Find if we already have this codename
        const existingToken = Object.entries(keyStore).find(([, v]) => v === original)?.[0];
        if (!existingToken) {
          const num = String(nextTokenNumber(keyStore, 'CODENAME')).padStart(3, '0');
          const token = `«ENT_CODENAME_${num}»`;
          keyStore[token] = original;
        }
      }
    }

    const existingJson = JSON.stringify(keyStore, null, 2);
    const aliasJson = opts?.aliasHints ? JSON.stringify(opts.aliasHints, null, 2) : '{}';
    const userMessage = `INPUT TEXT:\n${text}\n\nEXISTING KEY STORE:\n${existingJson}\n\nALIAS HINTS (operator-declared codenames; treat these as already-known, do not mask them):\n${aliasJson}`;

    try {
      const rawResponse = await chat(ENCODER_SYSTEM_PROMPT, userMessage, {
        temperature: 0,
        format: 'json',
      });

      const parsed = JSON.parse(rawResponse) as {
        masked_text?: string;
        new_entities?: Array<{ token: string; original: string; type: string }>;
      };

      const maskedText = parsed.masked_text ?? text;
      const newEntities = parsed.new_entities ?? [];

      // Merge new entities into key store
      for (const e of newEntities) {
        keyStore[e.token] = e.original;
      }
      saveKeyStore(matterId, keyStore);

      return { masked_text: maskedText, key_store: keyStore, mode: 'llm' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If JSON parse fails or Ollama call fails, fall through to offline mode
      console.error(`[privacy-filter] LLM encoder failed (${msg}); falling back to rule-based encoder.`);
    }
  }

  // Offline fallback: rule-based encoder
  const { masked_text, new_entities } = ruleBasedEncode(text, keyStore, opts?.aliasHints);
  for (const e of new_entities) {
    keyStore[e.token] = e.original;
  }
  saveKeyStore(matterId, keyStore);

  return { masked_text, key_store: keyStore, mode: 'offline-fallback' };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

export async function decode(
  text: string,
  keyStore: Record<string, string>
): Promise<string> {
  // Step 1: Deterministic find-and-replace (fast path)
  let rehydrated = text;
  for (const [token, original] of Object.entries(keyStore)) {
    // Escape special regex chars in token
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    rehydrated = rehydrated.replace(new RegExp(escaped, 'g'), original);
  }

  // Step 2: If Ollama is available, do a cleanup pass for LLM-introduced variants
  const ollamaAvailable = await isOllamaAvailable();
  if (ollamaAvailable) {
    const keyStoreJson = JSON.stringify(keyStore, null, 2);
    const userMessage = `MASKED TEXT:\n${rehydrated}\n\nKEY STORE:\n${keyStoreJson}`;
    try {
      const cleaned = await chat(DECODER_SYSTEM_PROMPT, userMessage, { temperature: 0 });
      rehydrated = cleaned.trim();
    } catch {
      // If decoder call fails, use deterministic result
    }
  }

  // Step 3: Pre-delivery scan — reject any leaked placeholder
  if (/«ENT_/.test(rehydrated)) {
    throw new PrivacyFilterError(
      'placeholder leaked into final draft: one or more «ENT_*» tokens remain after rehydration. ' +
      'The response cannot be delivered. Re-encode with a stricter prompt or check the key store.'
    );
  }

  return rehydrated;
}

// ---------------------------------------------------------------------------
// Hash helper (for audit log detection)
// ---------------------------------------------------------------------------

export function hashEntities(keyStore: Record<string, string>): string {
  const sorted = Object.keys(keyStore).sort().join('|');
  return createHash('sha256').update(sorted).digest('hex').slice(0, 16);
}
