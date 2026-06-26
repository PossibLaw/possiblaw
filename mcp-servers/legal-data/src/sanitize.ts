// mcp-servers/legal-data/src/sanitize.ts
//
// Outbound-query privacy. A CourtListener search is a read to a third party;
// the query string itself can carry privileged facts (client names, matter
// captions). For confidential/privileged matters we strip client identifiers
// BEFORE the search so only neutral legal terms leave the boundary.
//
// This mirrors the neutral-terms rule in docs/connectors-inventory.md:40 and the
// detection rules in the `privacy-encoder` skill (companies/legal-operations/
// skills/privacy-encoder/SKILL.md). Unlike the encoder (which substitutes
// reversible placeholders for round-trip cloud calls), a search query is one-way
// and the result must stay a useful legal search — so we DELETE the identifier
// span rather than leave a placeholder token that would pollute relevance.

export type PrivacyTier = "standard" | "confidential" | "privileged";

export interface SanitizeResult {
  query: string;
  /** Spans removed, by detection type. Strings are the redacted text (kept local; never sent). */
  redactions: { type: string; value: string }[];
}

// Legal entity suffixes (Rule 3 of privacy-encoder). A run of 1-6 capitalized
// tokens immediately followed by one of these is treated as a PARTY name.
const ENTITY_SUFFIX =
  "(?:LLC|L\\.L\\.C\\.|Inc\\.?|Corp\\.?|Corporation|Ltd\\.?|Limited|Co\\.?|Company|GmbH|AG|B\\.V\\.|S\\.A\\.|S\\.A\\.S\\.|S\\.r\\.l\\.|LP|L\\.P\\.|LLP|L\\.L\\.P\\.|PLC|PLLC|PC|P\\.C\\.|N\\.V\\.|Holdings|Partners)";
const ENTITY_RE = new RegExp(
  "\\b(?:[A-Z][\\w&'\\-]*\\s){0,5}[A-Z][\\w&'\\-]*\\s" + ENTITY_SUFFIX + "\\b",
  "g",
);

// Structured identifiers (Rule 2 of privacy-encoder).
const STRUCTURED: { type: string; re: RegExp }[] = [
  { type: "EMAIL", re: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g },
  { type: "SSN", re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { type: "EIN", re: /\b\d{2}-\d{7}\b/g },
  { type: "PHONE", re: /(?:\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}/g },
];

/**
 * Strip client identifiers from an outbound search query for confidential /
 * privileged matters. Standard-tier queries pass through unchanged.
 */
export function sanitizeQuery(query: string, tier: PrivacyTier = "standard"): SanitizeResult {
  if (tier === "standard") {
    return { query, redactions: [] };
  }

  const redactions: { type: string; value: string }[] = [];
  let out = query;

  // Entity names first (longest-precedence, mirrors encoder rule order).
  out = out.replace(ENTITY_RE, (m) => {
    redactions.push({ type: "PARTY", value: m.trim() });
    return " ";
  });

  // Then structured identifiers.
  for (const { type, re } of STRUCTURED) {
    out = out.replace(re, (m) => {
      redactions.push({ type, value: m });
      return " ";
    });
  }

  // Collapse the whitespace the deletions left behind.
  out = out.replace(/\s+/g, " ").trim();

  return { query: out, redactions };
}
