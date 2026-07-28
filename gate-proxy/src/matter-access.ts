// gate-proxy/src/matter-access.ts
// C3 — the firm's user→matter access document: schema, fail-closed parsing, and
// compilation against the Paperclip directory.
//
// This module holds the BASELINE half of C3 only. Effective access is the
// baseline folded together with receipted override events (grant / revoke),
// which land in a later unit. Nothing here decides an access question; it turns
// a document a partner can read into ids the gate can compare.
//
// WHY A FIRM DOCUMENT. The agent must never adjudicate entitlement. A model
// deciding who may see what is non-deterministic, self-attested, and defeatable
// by prompt injection — the one control that would live inside the model. The
// firm authors this file instead, and the gate checks it outside the model.
//
// WHY EMAIL AND `issues.identifier`. Both are things a firm can actually write
// down. Paperclip's `user.id` is opaque and generated; its issue ids are uuids.
// A control document that partners cannot read is not a control they can audit,
// so the human-facing keys are the source and resolution happens at load.
//
// The compile pipeline mirrors `gate-authorization.json` (see
// bin/possiblaw): a checked-in, firm-authored document is resolved against the
// live control plane at startup and refused outright if anything is ambiguous.
//
// FAIL CLOSED, EVERYWHERE. Unlike tracing — which is evidence *about* a control
// and therefore fail-soft — this IS a control. A malformed document, an
// unknown email, or an identifier matching two issues aborts startup. Absence
// is never permission.
import fs from "node:fs";
import { sha256hex, canonicalJson } from "./receipts.ts";
import type { BoundaryType } from "./types.ts";

export class MatterAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatterAccessError";
  }
}

// ---------------------------------------------------------------------------
// Bounds and shapes
// ---------------------------------------------------------------------------

/** Boundaries over which decision authority can be granted. */
export const MATTER_ACCESS_BOUNDARIES: readonly BoundaryType[] = Object.freeze([
  "THIRD_PARTY_EGRESS",
  "CONFIDENTIAL_TO_CLOUD",
  "COURT_FILING",
  "SIGNATURE",
  "MONEY_MOVEMENT",
  "IRREVERSIBLE_EXTERNAL_OP",
]);

const BOUNDARY_SET: ReadonlySet<string> = new Set(MATTER_ACCESS_BOUNDARIES);

const MAX_PRINCIPALS = 512;
const MAX_MATTERS_PER_PRINCIPAL = 1024;
const MAX_PRINCIPALS_PER_BOUNDARY = 512;
const MAX_EMAIL_LENGTH = 254;

/**
 * Deliberately stricter than RFC 5322. This is a firm roster, not an inbox: a
 * comment-bearing or quoted-local-part address here is far likelier to be a
 * mistake or an injection attempt than a real lawyer.
 */
const SAFE_EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

/**
 * Matter identifiers are `issues.identifier` values such as `LEG-142`. The
 * pattern excludes path separators and dots-only sequences so an identifier can
 * never be read as a traversal by anything downstream.
 */
const SAFE_MATTER_IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

export interface MatterAccessDocument {
  version: 1;
  default: "deny";
  /**
   * Whether the gate ACTS on this roster. Default "off".
   *
   * This is deliberately opt-in, and the reasoning is worth keeping. The
   * document ships deny-all, so a strictly fail-closed reading would refuse
   * every human-gated egress the moment this merges — turning a security
   * feature into a firm-wide outage for anyone already running the gate.
   *
   * So enforcement is a switch the firm throws once its roster is complete.
   * With "off" the registry still loads, still folds, and still receipts, but
   * no decision changes; the firm can populate and inspect the roster before it
   * bites. With "on" deny-by-default applies in full.
   *
   * The honest cost: a deployment that never flips this gets no enforcement.
   * That is why it is surfaced at startup and in the Matter Trust Report rather
   * than left implicit in a config file.
   */
  enforcement: "off" | "on";
  /** Lower-cased principal email → matter identifiers, as written by the firm. */
  matterAccess: Record<string, string[]>;
  /** Boundary → lower-cased principal emails. */
  decisionAuthority: Record<string, string[]>;
}

export interface CompiledMatterAccess {
  version: 1;
  default: "deny";
  enforcement: "off" | "on";
  /** Paperclip user id → issue uuids. */
  matterAccess: Record<string, string[]>;
  /** Boundary → Paperclip user ids. */
  decisionAuthority: Record<string, string[]>;
  /**
   * SHA-256 over the canonicalised source document. A reload appends a receipt
   * carrying this hash, which opens a new epoch: revokes recorded before it do
   * not suppress pairs the new document grants. Without the epoch a runtime
   * revoke would silently outlive the firm's own edit.
   */
  documentSha256: string;
}

/** Everything denied. Used when no document is configured at all. */
export const DEFAULT_MATTER_ACCESS: Readonly<MatterAccessDocument> = Object.freeze({
  version: 1,
  default: "deny",
  enforcement: "off",
  matterAccess: {},
  decisionAuthority: {},
}) as Readonly<MatterAccessDocument>;

/** Resolution inputs, gathered from Paperclip read-only at startup. */
export interface MatterAccessDirectory {
  /** Lower-cased email → matching Paperclip user ids. */
  usersByEmail: Record<string, string[]>;
  /** `issues.identifier` → matching issue uuids. */
  issuesByIdentifier: Record<string, string[]>;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const ALLOWED_TOP_LEVEL_KEYS: ReadonlySet<string> = new Set([
  "version",
  "default",
  "enforcement",
  "matterAccess",
  "decisionAuthority",
]);

function parseStringList(
  raw: unknown,
  label: string,
  limit: number,
  validate: (value: string) => boolean,
): string[] {
  if (!Array.isArray(raw)) {
    throw new MatterAccessError(`${label} must be an array`);
  }
  if (raw.length > limit) {
    throw new MatterAccessError(`${label} exceeds the maximum of ${limit} entries`);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || !validate(entry)) {
      throw new MatterAccessError(`${label} contains an invalid entry`);
    }
    if (seen.has(entry)) {
      throw new MatterAccessError(`${label} contains a duplicate entry`);
    }
    seen.add(entry);
    out.push(entry);
  }
  return out;
}

function normaliseEmail(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.length > MAX_EMAIL_LENGTH || !SAFE_EMAIL_RE.test(raw)) {
    throw new MatterAccessError(`${label} must be an email address`);
  }
  // Lower-cased for comparison. Two roster rows differing only by case are
  // treated as ambiguity below rather than as two people — otherwise a
  // near-duplicate row could quietly widen or shadow a grant.
  return raw.toLowerCase();
}

/**
 * Validate and normalise a raw document. Throws on anything unexpected — an
 * unknown key, an unknown boundary, a malformed email — rather than ignoring
 * it, so a typo cannot silently disable a section of the roster.
 */
export function parseMatterAccessDocument(raw: unknown): MatterAccessDocument {
  if (!isPlainObject(raw)) {
    throw new MatterAccessError("matter access document must be a JSON object");
  }
  for (const key of Object.keys(raw)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      throw new MatterAccessError(`matter access document contains an unknown key: ${key}`);
    }
  }
  if (raw["version"] !== 1) {
    throw new MatterAccessError("matter access document requires version 1");
  }
  if (raw["default"] !== "deny") {
    throw new MatterAccessError('matter access document requires default "deny"');
  }
  const enforcementRaw = raw["enforcement"];
  if (enforcementRaw !== undefined && enforcementRaw !== "off" && enforcementRaw !== "on") {
    throw new MatterAccessError('enforcement must be exactly "off" or "on"');
  }
  const enforcement: "off" | "on" = enforcementRaw === "on" ? "on" : "off";

  const matterAccess: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const matterAccessRaw = raw["matterAccess"];
  if (matterAccessRaw !== undefined) {
    if (!isPlainObject(matterAccessRaw)) {
      throw new MatterAccessError("matterAccess must be a mapping");
    }
    const entries = Object.entries(matterAccessRaw);
    if (entries.length > MAX_PRINCIPALS) {
      throw new MatterAccessError(`matterAccess exceeds the maximum of ${MAX_PRINCIPALS} principals`);
    }
    for (const [emailRaw, mattersRaw] of entries) {
      const email = normaliseEmail(emailRaw, "matterAccess principal");
      if (Object.prototype.hasOwnProperty.call(matterAccess, email)) {
        throw new MatterAccessError(
          `matterAccess lists ${email} more than once (entries differing only by case are ambiguous)`,
        );
      }
      matterAccess[email] = parseStringList(
        mattersRaw,
        `matterAccess[${email}]`,
        MAX_MATTERS_PER_PRINCIPAL,
        (v) => SAFE_MATTER_IDENTIFIER_RE.test(v),
      );
    }
  }

  const decisionAuthority: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const decisionAuthorityRaw = raw["decisionAuthority"];
  if (decisionAuthorityRaw !== undefined) {
    if (!isPlainObject(decisionAuthorityRaw)) {
      throw new MatterAccessError("decisionAuthority must be a mapping");
    }
    for (const [boundary, principalsRaw] of Object.entries(decisionAuthorityRaw)) {
      if (!BOUNDARY_SET.has(boundary)) {
        throw new MatterAccessError(`decisionAuthority names an unknown boundary: ${boundary}`);
      }
      const principals = parseStringList(
        principalsRaw,
        `decisionAuthority[${boundary}]`,
        MAX_PRINCIPALS_PER_BOUNDARY,
        (v) => v.length <= MAX_EMAIL_LENGTH && SAFE_EMAIL_RE.test(v),
      ).map((v) => v.toLowerCase());
      const seen = new Set<string>();
      for (const p of principals) {
        if (seen.has(p)) {
          throw new MatterAccessError(
            `decisionAuthority[${boundary}] lists ${p} more than once (entries differing only by case are ambiguous)`,
          );
        }
        seen.add(p);
      }
      decisionAuthority[boundary] = principals;
    }
  }

  return { version: 1, default: "deny", enforcement, matterAccess, decisionAuthority };
}

/**
 * Read and parse the document from disk. A missing or unreadable file throws —
 * absence is not permission, and silently falling back to a default would make
 * a deleted roster look like a working one.
 */
export function loadMatterAccessDocument(filePath: string): MatterAccessDocument {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    // Message carries the path only; a roster is not secret but its contents
    // are not worth echoing into a startup log either.
    throw new MatterAccessError(`matter access document could not be read: ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MatterAccessError(`matter access document is not valid JSON: ${filePath}`);
  }
  return parseMatterAccessDocument(parsed);
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

function resolveExactlyOne(
  index: Record<string, string[]>,
  key: string,
  kind: string,
): string {
  const matches = Object.prototype.hasOwnProperty.call(index, key) ? index[key] : undefined;
  if (matches === undefined || matches.length === 0) {
    throw new MatterAccessError(`${kind} ${key} matches no record in the control plane`);
  }
  if (matches.length > 1) {
    // Refusing is the point. Picking one would silently bind an entitlement to
    // a person or matter the firm did not name.
    throw new MatterAccessError(`${kind} ${key} is ambiguous: it matches ${matches.length} records`);
  }
  return matches[0] as string;
}

/**
 * Resolve a parsed document against the control plane, producing the id-keyed
 * policy the gate compares against. Any email or identifier that resolves to
 * zero or more than one record aborts the compile.
 */
export function compileMatterAccess(
  doc: MatterAccessDocument,
  directory: MatterAccessDirectory,
): CompiledMatterAccess {
  const usersByEmail: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [email, ids] of Object.entries(directory.usersByEmail)) {
    usersByEmail[email.toLowerCase()] = ids;
  }

  const matterAccess: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [email, identifiers] of Object.entries(doc.matterAccess)) {
    const userId = resolveExactlyOne(usersByEmail, email, "principal");
    const issueIds = identifiers.map((identifier) =>
      resolveExactlyOne(directory.issuesByIdentifier, identifier, "matter"),
    );
    // Two roster rows resolving to one user is the same ambiguity as above,
    // seen from the other side.
    if (Object.prototype.hasOwnProperty.call(matterAccess, userId)) {
      throw new MatterAccessError(`principal ${email} resolves to an already-granted user id`);
    }
    matterAccess[userId] = issueIds;
  }

  const decisionAuthority: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  for (const [boundary, emails] of Object.entries(doc.decisionAuthority)) {
    decisionAuthority[boundary] = emails.map((email) =>
      resolveExactlyOne(usersByEmail, email, "principal"),
    );
  }

  return {
    version: 1,
    default: "deny",
    enforcement: doc.enforcement,
    matterAccess,
    decisionAuthority,
    // Hash the SOURCE document, not the compiled output: the epoch should change
    // when the firm edits the roster, not when Paperclip reassigns an id.
    documentSha256: sha256hex(
      canonicalJson({
        version: doc.version,
        default: doc.default,
        enforcement: doc.enforcement,
        matterAccess: doc.matterAccess,
        decisionAuthority: doc.decisionAuthority,
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Directory ingestion — C3 PR 1b
// ---------------------------------------------------------------------------

/**
 * Build a resolution directory from what the launcher fetched out of Paperclip,
 * read-only: `GET /api/companies/:id/members` and
 * `GET /api/companies/:id/issues`.
 *
 * Both indexes are MULTI-VALUED on purpose. Collapsing duplicates here would
 * hide exactly the ambiguity `compileMatterAccess` must refuse: two users
 * sharing an email, or two issues sharing an identifier, mean the firm's roster
 * cannot be resolved to one person or one matter, and the gate must not guess.
 *
 * Records missing an email or identifier are skipped rather than rejected — a
 * company legitimately contains users and issues the roster never names, and
 * failing on those would make an unrelated record able to block startup.
 */
export function buildMatterAccessDirectory(input: {
  members: unknown;
  issues: unknown;
}): MatterAccessDirectory {
  const usersByEmail: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
  const issuesByIdentifier: Record<string, string[]> = Object.create(null) as Record<string, string[]>;

  const memberList = Array.isArray(input.members)
    ? input.members
    : isPlainObject(input.members) && Array.isArray(input.members["members"])
      ? (input.members["members"] as unknown[])
      : [];
  for (const raw of memberList) {
    if (!isPlainObject(raw)) continue;
    // Accepts both the nested `{ user: { id, email } }` shape returned by
    // /members and a flat `{ id, email }`, so the launcher can hand over either.
    const user = isPlainObject(raw["user"]) ? raw["user"] : raw;
    const id = user["id"];
    const email = user["email"];
    if (typeof id !== "string" || id === "") continue;
    if (typeof email !== "string" || !SAFE_EMAIL_RE.test(email)) continue;
    const key = email.toLowerCase();
    (usersByEmail[key] ??= []).push(id);
  }

  const issueList = Array.isArray(input.issues)
    ? input.issues
    : isPlainObject(input.issues) && Array.isArray(input.issues["issues"])
      ? (input.issues["issues"] as unknown[])
      : [];
  for (const raw of issueList) {
    if (!isPlainObject(raw)) continue;
    const id = raw["id"];
    const identifier = raw["identifier"];
    if (typeof id !== "string" || id === "") continue;
    if (typeof identifier !== "string" || !SAFE_MATTER_IDENTIFIER_RE.test(identifier)) continue;
    (issuesByIdentifier[identifier] ??= []).push(id);
  }

  return { usersByEmail, issuesByIdentifier };
}

/** Read a launcher-written `{ members, issues }` bundle from disk, fail-closed. */
export function loadMatterAccessDirectory(filePath: string): MatterAccessDirectory {
  let text: string;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    throw new MatterAccessError(`matter access directory could not be read: ${filePath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MatterAccessError(`matter access directory is not valid JSON: ${filePath}`);
  }
  if (!isPlainObject(parsed)) {
    throw new MatterAccessError("matter access directory must be a JSON object");
  }
  return buildMatterAccessDirectory({ members: parsed["members"], issues: parsed["issues"] });
}
