import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  buildTimeStampRequest,
  derInteger,
  derLength,
  parseTimeStampResponse,
  readTlv,
  requestTimestamp,
  resolveTsaUrl,
  TsaError,
  TSA_STATUS_GRANTED_WITH_MODS,
} from "./anchor-tsa.ts";

const DIGEST = new Uint8Array(crypto.createHash("sha256").update("receipt-chain-head").digest());
const NONCE = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

function hex(b: Uint8Array): string {
  return Buffer.from(b).toString("hex");
}
function fromHex(s: string): Uint8Array<ArrayBuffer> {
  // Uint8Array.from copies the bytes. Do NOT reach for Buffer.from(...).buffer —
  // Node serves small Buffers from a shared pool, so .buffer is the whole pool.
  return Uint8Array.from(Buffer.from(s, "hex"));
}

// ---------------------------------------------------------------------------
// DER primitives
// ---------------------------------------------------------------------------

test("DER length uses short form below 128 and long form at or above", () => {
  assert.equal(hex(derLength(0)), "00");
  assert.equal(hex(derLength(127)), "7f");
  assert.equal(hex(derLength(128)), "8180");
  assert.equal(hex(derLength(256)), "820100");
  assert.equal(hex(derLength(65535)), "82ffff");
});

test("DER INTEGER strips leading zeros and stays positive", () => {
  assert.equal(hex(derInteger(Uint8Array.from([0x00, 0x00, 0x2a]))), "02012a");
  // High bit set → 0x00 prefix so the value is not read as negative.
  assert.equal(hex(derInteger(Uint8Array.from([0x80]))), "02020080");
  assert.equal(hex(derInteger(Uint8Array.from([0xff, 0xff]))), "020300ffff");
  // All-zero collapses to a single zero byte rather than an empty INTEGER.
  assert.equal(hex(derInteger(Uint8Array.from([0x00, 0x00]))), "020100");
});

test("readTlv rejects truncated and indefinite-length encodings", () => {
  assert.throws(() => readTlv(fromHex("30"), 0), TsaError);
  assert.throws(() => readTlv(fromHex("300a"), 0), TsaError); // length exceeds buffer
  assert.throws(() => readTlv(fromHex("3080"), 0), TsaError); // indefinite length
});

// ---------------------------------------------------------------------------
// TimeStampReq
//
// The expected bytes below were cross-checked against OpenSSL 3.0.13:
//   openssl ts -query -in <req>.tsq -text
// reports version 1, sha256, this exact message digest, nonce 0x0102030405060708,
// and "Certificate required: yes".
// ---------------------------------------------------------------------------

test("builds a TimeStampReq OpenSSL accepts", () => {
  const { der, nonce } = buildTimeStampRequest(DIGEST, { nonce: NONCE });
  assert.deepEqual(nonce, NONCE);

  const outer = readTlv(der, 0);
  assert.equal(outer.tag, 0x30);
  assert.equal(outer.end, der.length, "no trailing bytes after the outer SEQUENCE");

  // version = 1
  const version = readTlv(der, outer.contentStart);
  assert.equal(version.tag, 0x02);
  assert.equal(der[version.contentStart], 1);

  // messageImprint = SEQUENCE { AlgorithmIdentifier, OCTET STRING }
  const imprint = readTlv(der, version.end);
  assert.equal(imprint.tag, 0x30);
  const algId = readTlv(der, imprint.contentStart);
  const oid = readTlv(der, algId.contentStart);
  assert.equal(oid.tag, 0x06);
  assert.equal(
    hex(der.slice(oid.contentStart, oid.contentEnd)),
    "608648016503040201",
    "sha256 OID 2.16.840.1.101.3.4.2.1",
  );
  const digestOctets = readTlv(der, algId.end);
  assert.equal(digestOctets.tag, 0x04);
  assert.equal(hex(der.slice(digestOctets.contentStart, digestOctets.contentEnd)), hex(DIGEST));

  // nonce, then certReq TRUE
  const nonceTlv = readTlv(der, imprint.end);
  assert.equal(nonceTlv.tag, 0x02);
  assert.equal(hex(der.slice(nonceTlv.contentStart, nonceTlv.contentEnd)), "0102030405060708");
  const certReq = readTlv(der, nonceTlv.end);
  assert.equal(certReq.tag, 0x01);
  assert.equal(der[certReq.contentStart], 0xff);
});

test("a random nonce is generated when none is supplied", () => {
  const a = buildTimeStampRequest(DIGEST);
  const b = buildTimeStampRequest(DIGEST);
  assert.equal(a.nonce.length, 8);
  assert.notEqual(hex(a.nonce), hex(b.nonce));
});

test("only a 32-byte sha256 digest is accepted", () => {
  assert.throws(() => buildTimeStampRequest(new Uint8Array(20)), TsaError);
  assert.throws(() => buildTimeStampRequest(new Uint8Array(0)), TsaError);
});

// ---------------------------------------------------------------------------
// TimeStampResp
//
// Both fixtures are DER emitted by OpenSSL (`openssl asn1parse -genconf`),
// not by this module — the parser is checked against a real ASN.1 encoder.
// ---------------------------------------------------------------------------

/** SEQUENCE { SEQUENCE { INTEGER 0 }, SEQUENCE { INTEGER 0x2a } } */
const GRANTED_DER = fromHex("300a3003020100300302012a");
/** SEQUENCE { SEQUENCE { INTEGER 2 } } — rejection, no token */
const REJECTED_DER = fromHex("30053003020102");

test("parses a granted response and lifts the token verbatim", () => {
  const parsed = parseTimeStampResponse(GRANTED_DER);
  assert.equal(parsed.status, 0);
  assert.equal(parsed.granted, true);
  assert.ok(parsed.token);
  // The token is exactly the second SEQUENCE, byte for byte.
  assert.equal(hex(parsed.token), "300302012a");
});

test("parses a rejection and reports no token", () => {
  const parsed = parseTimeStampResponse(REJECTED_DER);
  assert.equal(parsed.status, 2);
  assert.equal(parsed.granted, false);
  assert.equal(parsed.token, undefined);
});

test("grantedWithMods counts as granted", () => {
  const der = fromHex("300a3003020101300302012a");
  const parsed = parseTimeStampResponse(der);
  assert.equal(parsed.status, TSA_STATUS_GRANTED_WITH_MODS);
  assert.equal(parsed.granted, true);
});

test("malformed responses throw rather than being read optimistically", () => {
  assert.throws(() => parseTimeStampResponse(fromHex("020100")), TsaError); // not a SEQUENCE
  assert.throws(() => parseTimeStampResponse(fromHex("3003020100")), TsaError); // status not a SEQUENCE
  assert.throws(() => parseTimeStampResponse(fromHex("30053003300101")), TsaError); // status not an INTEGER
});

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

function okResponse(body: Uint8Array<ArrayBuffer>): Response {
  return new Response(body, { status: 200 });
}

test("posts a timestamp-query and returns the token with its hash", async () => {
  let seenUrl = "";
  let seenType = "";
  let seenBody: Uint8Array | null = null;
  const res = await requestTimestamp("https://tsa.example/tsr", DIGEST, {
    nonce: NONCE,
    fetchImpl: (async (url: string, init: RequestInit) => {
      seenUrl = String(url);
      seenType = (init.headers as Record<string, string>)["content-type"] as string;
      seenBody = new Uint8Array(init.body as Uint8Array);
      return okResponse(GRANTED_DER);
    }) as unknown as typeof fetch,
  });

  assert.equal(seenUrl, "https://tsa.example/tsr");
  assert.equal(seenType, "application/timestamp-query");
  assert.ok(seenBody);
  assert.equal(hex(seenBody!), hex(buildTimeStampRequest(DIGEST, { nonce: NONCE }).der));

  assert.equal(hex(res.token), "300302012a");
  assert.equal(res.tokenSha256, crypto.createHash("sha256").update(res.token).digest("hex"));
  assert.equal(res.status, 0);
});

test("a rejection, a non-2xx, an empty body, and an unreachable TSA all throw", async () => {
  const cases: { label: string; impl: typeof fetch }[] = [
    {
      label: "rejected",
      impl: (async () => okResponse(REJECTED_DER)) as unknown as typeof fetch,
    },
    {
      label: "http error",
      impl: (async () => new Response(new Uint8Array(0), { status: 500 })) as unknown as typeof fetch,
    },
    {
      label: "empty body",
      impl: (async () => okResponse(new Uint8Array(0))) as unknown as typeof fetch,
    },
    {
      label: "unreachable",
      impl: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    },
  ];
  for (const { label, impl } of cases) {
    await assert.rejects(
      () => requestTimestamp("https://tsa.example/tsr", DIGEST, { fetchImpl: impl }),
      TsaError,
      label,
    );
  }
});

test("an oversized response is rejected rather than buffered", async () => {
  await assert.rejects(
    () =>
      requestTimestamp("https://tsa.example/tsr", DIGEST, {
        fetchImpl: (async () => okResponse(new Uint8Array(300 * 1024))) as unknown as typeof fetch,
      }),
    TsaError,
  );
});

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

test("GATE_TSA_URL is absent, valid, or an error — never silently ignored", () => {
  assert.equal(resolveTsaUrl({}), null);
  assert.equal(resolveTsaUrl({ GATE_TSA_URL: "" }), null);
  assert.equal(resolveTsaUrl({ GATE_TSA_URL: "https://freetsa.org/tsr" }), "https://freetsa.org/tsr");
  assert.throws(() => resolveTsaUrl({ GATE_TSA_URL: "not-a-url" }), TsaError);
  assert.throws(() => resolveTsaUrl({ GATE_TSA_URL: "ftp://tsa.example/tsr" }), TsaError);
});
