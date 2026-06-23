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
    const tokens = needle.split(/\s+/).filter((t) => t.length >= 4 && !ORG_STOPWORDS.has(t));
    if (tokens.some((t) => new RegExp(`\\b${escapeRegex(t)}\\b`).test(hay))) {
      violations.push(`entity-token:${e}`);
    }
  }

  for (const { label, re } of PII_PATTERNS) {
    if (re.test(text)) violations.push(`pattern:${label}`);
  }

  return { ok: violations.length === 0, violations };
}
