// gate-proxy/src/upload.ts
// Task 4.1 — shared helpers for binary uploads through the gate.
//
// Used by BOTH the server layer (structural validation + receipt metadata)
// and the connectors layer (performer-side defense in depth). Kept free of
// imports from server.ts/connectors.ts to avoid circular dependencies.
//
// SECURITY:
//   - decodeBase64Strict rejects anything Node's forgiving Buffer.from would
//     silently "repair" (invalid chars, bad padding, embedded whitespace) —
//     invalid base64 must fail closed, never decode to surprise bytes.
//   - isValidMimeType is a header-injection guard: the resolved MIME type is
//     interpolated into a Content-Type header and into receipt metadata, so
//     CRLF / whitespace / unbounded values are rejected outright.

/** Default decoded-size cap for contentBase64 uploads: 25 MB (env-overridable
 * via GATE_MAX_UPLOAD_BYTES, wired in index.ts → GateServerDeps.maxUploadBytes). */
export const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Strict base64: ≥1 data char, correct padding at the end only, length % 4 === 0. */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/** Conservative MIME token: type/subtype, RFC-ish charset, no parameters,
 * no whitespace, no CR/LF, bounded length. */
const MIME_RE = /^[A-Za-z0-9!#$&^_.+-]{1,127}\/[A-Za-z0-9!#$&^_.+-]{1,127}$/;

/** Extension → default MIME map for the fixed payload contract. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".md": "text/plain",
  ".txt": "text/plain",
});

/**
 * Decode a base64 string STRICTLY. Returns the decoded bytes, or null when the
 * input is not canonical base64 (empty, invalid characters, embedded
 * whitespace/newlines, bad length, or misplaced/excess padding).
 */
export function decodeBase64Strict(b64: string): Buffer | null {
  if (typeof b64 !== "string" || b64.length === 0 || b64.length % 4 !== 0) return null;
  if (!BASE64_RE.test(b64)) return null;
  return Buffer.from(b64, "base64");
}

/** True when v is a bounded, single-token MIME type safe for a Content-Type header. */
export function isValidMimeType(v: unknown): v is string {
  return typeof v === "string" && MIME_RE.test(v);
}

/**
 * Resolve the MIME type for a binary upload per the fixed payload contract:
 *   - explicit `mimeType` wins when present — but an INVALID explicit value
 *     returns null so callers fail closed (400 at the server, PerformerError
 *     at the connector) rather than silently defaulting;
 *   - otherwise derived from the `name` extension (.docx/.pdf/.md/.txt);
 *   - unknown extension (or non-string name) → application/octet-stream.
 */
export function resolveUploadMimeType(name: unknown, explicit: unknown): string | null {
  if (explicit !== undefined) {
    return isValidMimeType(explicit) ? explicit : null;
  }
  if (typeof name === "string") {
    const dot = name.lastIndexOf(".");
    if (dot >= 0) {
      const ext = name.slice(dot).toLowerCase();
      // Prototype guard: only own properties of the extension map count.
      if (Object.prototype.hasOwnProperty.call(MIME_BY_EXTENSION, ext)) {
        return MIME_BY_EXTENSION[ext];
      }
    }
  }
  return "application/octet-stream";
}
