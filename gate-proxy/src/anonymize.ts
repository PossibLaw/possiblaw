// ---------------------------------------------------------------------------
// anonymize.ts
//
// Deterministic, NER-free text anonymizer for the gate-proxy.
// Caller supplies the matter's known entity strings; we mask those exact strings
// plus regex pattern classes (email, phone, SSN, EIN, USD amounts, dates).
// No I/O. Pure module.
// ---------------------------------------------------------------------------

export interface AnonymizeResult {
  masked: string;
  /** token → original string (e.g. "ENTITY_A" → "Acme Corp") */
  map: Record<string, string>;
  /** v1: binary. 1 = every supplied entity verifiably absent from masked AND entities list non-empty. 0 otherwise. */
  confidence: 0 | 1;
}

// ---------------------------------------------------------------------------
// Pattern classes
//
// Order matters: apply patterns in a fixed class order so tokens are numbered
// consistently regardless of text layout.
// ---------------------------------------------------------------------------

const PATTERN_CLASSES: ReadonlyArray<{ prefix: string; re: RegExp }> = [
  {
    prefix: "SSN",
    // SSN: 123-45-6789 — must come before phone to avoid EIN/phone false positives
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    prefix: "EIN",
    // EIN: 12-3456789
    re: /\b\d{2}-\d{7}\b/g,
  },
  {
    prefix: "EMAIL",
    // Standard email local@domain.tld
    re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    prefix: "PHONE",
    // US phone: many common formats
    // +1 555 123 4567, (555) 123-4567, 555-123-4567, 555.123.4567
    re: /(?:\+1\s?)?(?:\(\d{3}\)|\d{3})[\s.\-]\d{3}[\s.\-]\d{4}\b/g,
  },
  {
    prefix: "AMOUNT",
    // $1,234.56 / $500 / $1.2 million / $3.7 billion etc.
    re: /\$[\d,]+(?:\.\d+)?(?:\s*(?:thousand|million|billion))?/gi,
  },
  {
    prefix: "DATE",
    // ISO: 2026-01-02
    // US slashed: 01/02/2026
    // Long: January 2, 2026 | Jan 2, 2026 | December 14, 2025
    re: /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},\s+\d{4})\b/g,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Escape a string for use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build a token like ENTITY_A, ENTITY_B, …, ENTITY_Z, ENTITY_AA, …
 * We use an alphabetic suffix so tokens are simple identifiers.
 */
function entityToken(index: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let suffix = "";
  let n = index;
  do {
    suffix = alphabet[n % 26] + suffix;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `ENTITY_${suffix}`;
}

/** Build a pattern token like EMAIL_1, PHONE_2, etc. */
function patternToken(prefix: string, index: number): string {
  return `${prefix}_${index}`;
}

// ---------------------------------------------------------------------------
// checkCoverage — exported for direct testing
// ---------------------------------------------------------------------------

/**
 * Returns true iff every entity string is absent from masked (case-insensitive).
 * An empty entities array trivially returns true.
 */
export function checkCoverage(masked: string, entities: string[]): boolean {
  const lower = masked.toLowerCase();
  for (const entity of entities) {
    if (lower.includes(entity.toLowerCase())) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// anonymize
// ---------------------------------------------------------------------------

export function anonymize(text: string, entities: string[]): AnonymizeResult {
  // map: token → original string
  const map: Record<string, string> = {};

  // Working copy we'll progressively replace
  let masked = text;

  // ---- Step 1: mask entities (longest-first to prevent partial double-masking) ----

  // Deduplicate while preserving input order, then sort longest-first.
  const seenEntities = new Map<string, string>(); // lower → original (first occurrence)
  for (const e of entities) {
    const lk = e.toLowerCase();
    if (!seenEntities.has(lk)) {
      seenEntities.set(lk, e);
    }
  }

  // Assign tokens in INPUT ORDER (first occurrence in the original array).
  const entityTokenMap = new Map<string, string>(); // lower → token
  let tokenIndex = 0;
  for (const e of entities) {
    const lk = e.toLowerCase();
    if (!entityTokenMap.has(lk)) {
      const tok = entityToken(tokenIndex++);
      entityTokenMap.set(lk, tok);
      map[tok] = seenEntities.get(lk)!;
    }
  }

  // Sort by length descending for masking (longest-first)
  const sortedEntityKeys = [...entityTokenMap.keys()].sort((a, b) => b.length - a.length);

  for (const lk of sortedEntityKeys) {
    const tok = entityTokenMap.get(lk)!;
    const original = seenEntities.get(lk)!;
    // Case-insensitive, global replace — use escapeRegex on the original
    const re = new RegExp(escapeRegex(original), "gi");
    masked = masked.replace(re, tok);
  }

  // ---- Step 2: mask pattern classes ----

  // For each class, we need: original → token (dedup) + a counter.
  // We process the CURRENT masked string (entities already replaced).
  for (const { prefix, re } of PATTERN_CLASSES) {
    // Reset lastIndex before exec loop (re has /g flag)
    re.lastIndex = 0;

    // First pass: collect all matches with positions to deduplicate.
    // We collect them all, deduplicate, and assign tokens.
    const originalToToken = new Map<string, string>(); // lower-original → token
    let counter = 1;

    const matches: Array<{ match: string; index: number }> = [];
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(masked)) !== null) {
      matches.push({ match: m[0], index: m.index });
    }

    // Assign tokens in appearance order (first time we see an original string)
    for (const { match } of matches) {
      const lk = match.toLowerCase();
      if (!originalToToken.has(lk)) {
        const tok = patternToken(prefix, counter++);
        originalToToken.set(lk, tok);
        map[tok] = match; // original text as found
      }
    }

    // Second pass: replace all occurrences in masked.
    // We must replace longest-first (or sort) — but for pattern classes,
    // tokens are for distinct patterns so we replace each distinct original.
    // Sort by original length descending to avoid partial overlaps.
    const sortedOriginals = [...originalToToken.keys()].sort(
      (a, b) => b.length - a.length,
    );
    for (const lk of sortedOriginals) {
      const tok = originalToToken.get(lk)!;
      // Find the actual cased original stored in map — we need to escape it.
      const original = map[tok];
      const replaceRe = new RegExp(escapeRegex(original), "gi");
      masked = masked.replace(replaceRe, tok);
    }
  }

  // ---- Step 3: compute confidence ----
  let confidence: 0 | 1;
  if (entities.length === 0) {
    confidence = 0;
  } else if (checkCoverage(masked, entities)) {
    confidence = 1;
  } else {
    confidence = 0;
  }

  return { masked, map, confidence };
}

// ---------------------------------------------------------------------------
// deanonymize
// ---------------------------------------------------------------------------

/**
 * Replace every token in masked with its original from map.
 * Replaces longest-token-first to avoid prefix collisions (e.g. ENTITY_A vs ENTITY_AB).
 */
export function deanonymize(masked: string, map: Record<string, string>): string {
  // Sort tokens longest-first
  const tokens = Object.keys(map).sort((a, b) => b.length - a.length);

  let result = masked;
  for (const tok of tokens) {
    const original = map[tok];
    // Tokens only contain word chars + underscore + digits; word boundary safe.
    const re = new RegExp(escapeRegex(tok), "g");
    result = result.replace(re, original);
  }
  return result;
}
