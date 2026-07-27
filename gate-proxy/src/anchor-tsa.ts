// gate-proxy/src/anchor-tsa.ts
//
// RFC 3161 external anchoring for the receipt chain.
//
// WHY: the hash chain detects ALTERATION — any edit to a past receipt breaks
// the linkage and anyone holding the file can see it. It does not detect
// REGENERATION: an operator can rebuild the whole chain with different
// contents and it verifies perfectly, because every timestamp in it is the
// operator's own assertion. Anchoring the head to a Time Stamping Authority
// binds it to a signed time from outside our trust domain, so a chain cannot
// be backdated or silently rewritten after the fact.
//
// SCOPE — deliberately narrow, and worth stating plainly:
//   We BUILD a standards-compliant TimeStampReq, POST it, check the TSA's
//   status, and persist the returned token verbatim. We do NOT verify the
//   token's CMS signature or certificate chain — that needs a real ASN.1/CMS
//   stack, and reimplementing one here would be its own liability. The token
//   is standard evidence: any third party verifies it with
//     openssl ts -verify -in <token>.tsr -queryfile <req>.tsq -CAfile <ca>.pem
//   Producing verifiable evidence is the goal; being its own verifier is not.
//
// Dependency-free by design: the gate proxy carries one runtime dependency
// (js-yaml) and this module adds none.

import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class TsaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TsaError";
  }
}

// ---------------------------------------------------------------------------
// Minimal DER writer
// ---------------------------------------------------------------------------

const TAG_BOOLEAN = 0x01;
const TAG_INTEGER = 0x02;
const TAG_OCTET_STRING = 0x04;
const TAG_NULL = 0x05;
const TAG_OID = 0x06;
const TAG_SEQUENCE = 0x30;

/** DER length octets: short form below 128, else long form. */
export function derLength(n: number): Uint8Array<ArrayBuffer> {
  if (n < 0) throw new TsaError("negative DER length");
  if (n < 0x80) return Uint8Array.from([n]);
  const bytes: number[] = [];
  let v = n;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v >>>= 8;
  }
  if (bytes.length > 0x7e) throw new TsaError("DER length too large");
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Uint8Array): Uint8Array<ArrayBuffer> {
  const len = derLength(content.length);
  const out = new Uint8Array(1 + len.length + content.length);
  out[0] = tag;
  out.set(len, 1);
  out.set(content, 1 + len.length);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * DER INTEGER from an unsigned big-endian byte string. Leading zeros are
 * stripped and a 0x00 is prepended when the high bit is set, so the value
 * always encodes as positive.
 */
export function derInteger(unsignedBigEndian: Uint8Array): Uint8Array<ArrayBuffer> {
  let start = 0;
  while (start < unsignedBigEndian.length - 1 && unsignedBigEndian[start] === 0) start += 1;
  let body: Uint8Array = new Uint8Array(unsignedBigEndian.subarray(start));
  if (body.length === 0) body = Uint8Array.from([0]);
  if ((body[0] as number) & 0x80) body = concat([Uint8Array.from([0]), body]);
  return tlv(TAG_INTEGER, body);
}

function derIntegerFromNumber(n: number): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  let v = n;
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return derInteger(Uint8Array.from(bytes));
}

/** OID 2.16.840.1.101.3.4.2.1 — sha256. */
const OID_SHA256_BODY = Uint8Array.from([0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

// ---------------------------------------------------------------------------
// Minimal DER reader
// ---------------------------------------------------------------------------

interface Tlv {
  tag: number;
  contentStart: number;
  contentEnd: number;
  end: number;
}

export function readTlv(buf: Uint8Array, offset: number): Tlv {
  if (offset + 2 > buf.length) throw new TsaError("truncated DER: header");
  const tag = buf[offset] as number;
  const first = buf[offset + 1] as number;
  let contentStart: number;
  let length: number;
  if (first < 0x80) {
    length = first;
    contentStart = offset + 2;
  } else {
    const numBytes = first & 0x7f;
    if (numBytes === 0) throw new TsaError("indefinite DER length not permitted");
    if (offset + 2 + numBytes > buf.length) throw new TsaError("truncated DER: length");
    length = 0;
    for (let i = 0; i < numBytes; i += 1) length = length * 256 + (buf[offset + 2 + i] as number);
    contentStart = offset + 2 + numBytes;
  }
  const contentEnd = contentStart + length;
  if (contentEnd > buf.length) throw new TsaError("truncated DER: content");
  return { tag, contentStart, contentEnd, end: contentEnd };
}

// ---------------------------------------------------------------------------
// TimeStampReq
// ---------------------------------------------------------------------------

export interface TimeStampRequest {
  der: Uint8Array<ArrayBuffer>;
  /** Echoed back by the TSA; retained so a caller can bind response to request. */
  nonce: Uint8Array;
}

/**
 * Build an RFC 3161 TimeStampReq over a SHA-256 digest.
 *
 * certReq is TRUE so the response carries the TSA certificate — without it the
 * token cannot be verified by a third party who does not already hold that
 * cert, which would defeat the point.
 */
export function buildTimeStampRequest(
  sha256Digest: Uint8Array,
  opts: { nonce?: Uint8Array } = {},
): TimeStampRequest {
  if (sha256Digest.length !== 32) {
    throw new TsaError(`expected a 32-byte sha256 digest, got ${sha256Digest.length}`);
  }
  const nonce = opts.nonce ?? new Uint8Array(crypto.randomBytes(8));

  const algorithmIdentifier = tlv(
    TAG_SEQUENCE,
    concat([tlv(TAG_OID, OID_SHA256_BODY), tlv(TAG_NULL, new Uint8Array(0))]),
  );
  const messageImprint = tlv(
    TAG_SEQUENCE,
    concat([algorithmIdentifier, tlv(TAG_OCTET_STRING, sha256Digest)]),
  );
  const der = tlv(
    TAG_SEQUENCE,
    concat([
      derIntegerFromNumber(1), // version v1
      messageImprint,
      derInteger(nonce),
      tlv(TAG_BOOLEAN, Uint8Array.from([0xff])), // certReq TRUE
    ]),
  );
  return { der, nonce };
}

// ---------------------------------------------------------------------------
// TimeStampResp
// ---------------------------------------------------------------------------

/** RFC 3161 PKIStatus. 0 granted, 1 grantedWithMods; everything else is failure. */
export const TSA_STATUS_GRANTED = 0;
export const TSA_STATUS_GRANTED_WITH_MODS = 1;

export interface TimeStampResponse {
  status: number;
  granted: boolean;
  /** The TimeStampToken (a CMS ContentInfo), verbatim. Absent on rejection. */
  token?: Uint8Array<ArrayBuffer>;
}

/**
 * Parse enough of a TimeStampResp to decide granted/rejected and lift the
 * token out verbatim. Deliberately shallow — we never interpret the token.
 */
export function parseTimeStampResponse(der: Uint8Array): TimeStampResponse {
  const outer = readTlv(der, 0);
  if (outer.tag !== TAG_SEQUENCE) throw new TsaError("malformed TimeStampResp: not a SEQUENCE");

  const statusInfo = readTlv(der, outer.contentStart);
  if (statusInfo.tag !== TAG_SEQUENCE) {
    throw new TsaError("malformed TimeStampResp: PKIStatusInfo is not a SEQUENCE");
  }
  const statusInt = readTlv(der, statusInfo.contentStart);
  if (statusInt.tag !== TAG_INTEGER) {
    throw new TsaError("malformed TimeStampResp: status is not an INTEGER");
  }
  let status = 0;
  for (let i = statusInt.contentStart; i < statusInt.contentEnd; i += 1) {
    status = status * 256 + (der[i] as number);
  }
  const granted = status === TSA_STATUS_GRANTED || status === TSA_STATUS_GRANTED_WITH_MODS;

  // The token, when present, is whatever follows PKIStatusInfo inside the outer
  // SEQUENCE. Lifted verbatim so the bytes we persist are the bytes the TSA signed.
  if (statusInfo.end < outer.contentEnd) {
    const token = readTlv(der, statusInfo.end);
    return { status, granted, token: new Uint8Array(der.subarray(statusInfo.end, token.end)) };
  }
  return { status, granted };
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export interface TsaOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  nonce?: Uint8Array;
}

export interface TsaResult {
  token: Uint8Array<ArrayBuffer>;
  tokenSha256: string;
  status: number;
  /** The request DER, so an operator can run `openssl ts -verify -queryfile`. */
  request: Uint8Array<ArrayBuffer>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** A timestamp token is a few KB; anything larger is not one. */
const MAX_RESPONSE_BYTES = 256 * 1024;

/**
 * Obtain an RFC 3161 token over `digest` from `tsaUrl`.
 *
 * Throws TsaError on any failure — unreachable TSA, non-2xx, oversized body,
 * malformed DER, or a rejection status. Callers MUST NOT swallow this: an
 * operator who configured a TSA and silently got a self-attested anchor
 * instead is in exactly the position this feature exists to prevent.
 */
export async function requestTimestamp(
  tsaUrl: string,
  digest: Uint8Array,
  opts: TsaOptions = {},
): Promise<TsaResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { der: request } = buildTimeStampRequest(digest, { nonce: opts.nonce });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(tsaUrl, {
      method: "POST",
      headers: {
        "content-type": "application/timestamp-query",
        accept: "application/timestamp-reply",
      },
      body: request,
      signal: controller.signal,
    });
  } catch (err) {
    throw new TsaError(`tsa_unreachable: ${(err as Error).name}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new TsaError(`tsa_http_error: ${res.status}`);

  const raw = new Uint8Array(await res.arrayBuffer());
  if (raw.length === 0) throw new TsaError("tsa_empty_response");
  if (raw.length > MAX_RESPONSE_BYTES) throw new TsaError("tsa_response_too_large");

  const parsed = parseTimeStampResponse(raw);
  if (!parsed.granted) throw new TsaError(`tsa_rejected: status=${parsed.status}`);
  if (!parsed.token) throw new TsaError("tsa_granted_without_token");

  return {
    token: parsed.token,
    tokenSha256: crypto.createHash("sha256").update(parsed.token).digest("hex"),
    status: parsed.status,
    request,
  };
}

/** Resolve the configured TSA endpoint, or null when anchoring stays local. */
export function resolveTsaUrl(env: Record<string, string | undefined>): string | null {
  const raw = env["GATE_TSA_URL"];
  if (raw === undefined || raw === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new TsaError("GATE_TSA_URL must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TsaError("GATE_TSA_URL must be an http(s) URL");
  }
  return parsed.toString();
}
