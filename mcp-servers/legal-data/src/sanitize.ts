// mcp-servers/legal-data/src/sanitize.ts
//
// Outbound-query privacy defense in depth. A CourtListener search is a read to
// a third party; the query itself can carry privileged facts. Callers MUST use
// neutral legal terms as the primary control. These deterministic heuristics
// remove common identifiers before egress but cannot prove a query is safe.
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

const PERSON_NAME = "[A-Z][A-Za-z'’.-]*";
const PERSON_CAPTION_RE = new RegExp(
  `\\b${PERSON_NAME}(?:\\s+${PERSON_NAME}){0,3}\\s+v(?:s\\.?|ersus|\\.)?\\s+` +
    `${PERSON_NAME}(?:\\s+${PERSON_NAME}){0,3}\\b`,
  "g",
);
const LABELED_PERSON_RE = new RegExp(
  "\\b(?:client|Client|party|Party|plaintiff|Plaintiff|defendant|Defendant|" +
    "petitioner|Petitioner|respondent|Respondent|witness|Witness)" +
    `\\s*(?:[:=-]\\s*)?${PERSON_NAME}(?:\\s+${PERSON_NAME}){1,3}\\b`,
  "g",
);
const LABELED_MATTER_RE =
  /\b(?:docket|matter|case|file)\s*(?:no\.?|number|#)?\s*[:#-]?\s*[A-Z0-9][A-Z0-9._/-]{3,}\b/gi;
const BARE_MATTER_NUMBER_RE =
  /\b(?:[12]\d{3}-[A-Z]{1,8}-\d{2,12}|[A-Z]{2,10}-\d{2,4}-\d{2,12})\b/g;

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

  // Captions first so both sides are removed before entity/person sub-rules
  // can leave the opposing party behind.
  out = out.replace(PERSON_CAPTION_RE, (m) => {
    redactions.push({ type: "PERSON_CAPTION", value: m.trim() });
    return " ";
  });
  out = out.replace(LABELED_PERSON_RE, (m) => {
    redactions.push({ type: "PERSON", value: m.trim() });
    return " ";
  });
  out = out.replace(LABELED_MATTER_RE, (m) => {
    redactions.push({ type: "MATTER_NUMBER", value: m.trim() });
    return " ";
  });
  out = out.replace(BARE_MATTER_NUMBER_RE, (m) => {
    redactions.push({ type: "MATTER_NUMBER", value: m.trim() });
    return " ";
  });

  // Entity names after caption/person handling.
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
