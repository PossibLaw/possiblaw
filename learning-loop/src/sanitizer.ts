// Deterministic, fail-closed screen ensuring a candidate lesson carries no
// client-identifying facts. Mirrors gate-proxy/src/anonymize.ts pattern classes.
// Supplied `entities` (the matter party list) are the primary wall; PII patterns
// are a backstop. v1 deliberately does NOT reject bare currency/dates (too many
// false positives for legitimate firm preferences) — LLM generalization + human
// review cover those.

const PII_PATTERNS: { label: string; re: RegExp }[] = [
  { label: "email", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/ },
  { label: "phone", re: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { label: "ssn", re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { label: "ein", re: /\b\d{2}-\d{7}\b/ },
];

const ORG_STOPWORDS = new Set([
  "inc", "inc.", "llc", "corp", "corp.", "ltd", "ltd.", "co", "co.",
  "company", "the", "and", "group", "plc", "lp", "llp",
]);

function norm(s: string): string {
  return s.normalize("NFC").toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface SanitizeResult {
  ok: boolean;
  violations: string[];
}

export function sanitizeLesson(text: string, entities: string[] = []): SanitizeResult {
  const violations: string[] = [];
  const hay = norm(text);

  for (const e of entities) {
    const needle = norm(e).trim();
    if (needle.length >= 2 && hay.includes(needle)) {
      violations.push(`entity:${e}`);
      continue;
    }
    // Fuzzy floor (Fix 5). Case is already folded by norm() on both sides, so
    // "Acme" matches "ACME" already. The exact word-boundary token match misses
    // possessive/plural surface forms ("Acme's", "Acmes"), so the token regex
    // now allows an optional possessive ('s / ’s) or plural (s) suffix before the
    // trailing boundary. Word boundaries are preserved, so "academy" still does
    // NOT trip the "acme" token.
    //
    // Minimum token length stays 4 (not lowered to 3). Rationale: 3-char company
    // tokens collide with common English words (Sun, Sky, Box, Law), which at
    // render time would silently drop legitimate generalized lessons. Short (2–3
    // char) entities are still caught by the >=2 substring floor above; the only
    // residual gap is a multi-word entity whose sole distinguishing token is
    // exactly 3 chars and whose full phrase is absent verbatim — mitigated by the
    // PII backstop and human review. Lowering would require a labelled fixture to
    // prove no false-positive explosion; none exists, so we keep 4 and document.
    const tokens = needle.split(/\s+/).filter((t) => t.length >= 4 && !ORG_STOPWORDS.has(t));
    if (tokens.some((t) => new RegExp(`\\b${escapeRegex(t)}(?:'s|’s|s)?\\b`).test(hay))) {
      violations.push(`entity-token:${e}`);
    }
  }

  for (const { label, re } of PII_PATTERNS) {
    if (re.test(text)) violations.push(`pattern:${label}`);
  }

  return { ok: violations.length === 0, violations };
}

// Reduce raw violations to reason codes safe to surface in CLI/log output.
// `entity:*` / `entity-token:*` carry the client-identifying name after the
// colon, so those are collapsed to the bare label; `pattern:*` labels
// (email/phone/ssn/ein) name no content and pass through unchanged. Deduped.
export function redactViolations(violations: string[]): string[] {
  const out: string[] = [];
  for (const v of violations) {
    let code: string;
    if (v.startsWith("pattern:")) code = v;
    else if (v.startsWith("entity-token:")) code = "entity-token";
    else if (v.startsWith("entity:")) code = "entity";
    else code = v.split(":")[0];
    if (!out.includes(code)) out.push(code);
  }
  return out;
}
