import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import type { EgressRequest } from "./types.ts";
import { decodeBase64Strict, resolveUploadMimeType } from "./upload.ts";
import {
  makeGoogleTokenProviderFromEnv,
  makeMicrosoftTokenProviderFromEnv,
  type TokenProvider,
} from "./token-provider.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export class PerformerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PerformerError";
  }
}

export interface PerformOptions {
  useLocal?: boolean;
}

export type Performer = (
  req: EgressRequest,
  opts: PerformOptions,
) => Promise<Record<string, unknown>>;

export type PerformerRegistry = Record<string, Performer>;

export interface PerformerEnv {
  MS_GRAPH_TOKEN?: string;
  GDRIVE_ACCESS_TOKEN?: string;
  NOTION_API_KEY?: string;
  GMAIL_TOKEN?: string;
  EXTERNAL_MODEL_URL?: string;
  EXTERNAL_MODEL_API_KEY?: string;
  LOCAL_MODEL_URL?: string;
  GATE_ACTION_PACKAGE_DIR?: string;
  // Task 4.4: proxy-side OAuth refresh. When the full refresh set for a vendor
  // is present it takes precedence over the static token above (which stays a
  // fallback). See token-provider.ts for grant types + security invariants.
  GDRIVE_CLIENT_ID?: string;
  GDRIVE_CLIENT_SECRET?: string;
  GDRIVE_REFRESH_TOKEN?: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  MS_TENANT_ID?: string;
  MS_CLIENT_ID?: string;
  MS_CLIENT_SECRET?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Assert fetch returned a 2xx status. Throws PerformerError with short
 * structured code — never including any payload text.
 */
function assertOk(res: Response, vendor: string): void {
  if (!res.ok) {
    throw new PerformerError(`vendor_error: ${vendor} ${res.status}`);
  }
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * Task 4.1: performer-side defense in depth for the binary upload contract.
 * (The server layer validates the same properties with 400s BEFORE dispatch;
 * performers re-validate because they are independently callable.)
 * Returns the decoded bytes; throws PerformerError with a static message
 * (never echoing payload values) on any violation.
 */
function decodeBinaryUpload(p: Record<string, unknown>): Buffer {
  if (p["content"] !== undefined) {
    throw new PerformerError("invalid_payload: content and contentBase64 are mutually exclusive");
  }
  const b64 = p["contentBase64"];
  if (typeof b64 !== "string") {
    throw new PerformerError("invalid_payload: contentBase64 must be a base64 string");
  }
  const bytes = decodeBase64Strict(b64);
  if (bytes === null) {
    throw new PerformerError("invalid_payload: contentBase64 is not valid base64");
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// Task 4.9 — Notion text chunking
// ---------------------------------------------------------------------------

/** Notion caps rich_text text.content at 2,000 chars; stay under with margin. */
const NOTION_CHUNK_MAX = 1900;

/** Notion caps children at 100 blocks per request (create AND append). */
const NOTION_MAX_BLOCKS_PER_REQUEST = 100;

/**
 * Task 4.9: split document text into ≤maxLen-char chunks, preferring paragraph
 * boundaries ("\n\n"): whole paragraphs are greedily packed (separators kept
 * INSIDE a chunk); a single paragraph longer than maxLen is hard-split. Each
 * chunk becomes one Notion paragraph block, so a chunk boundary renders as the
 * paragraph break it replaced. Exported for unit tests.
 */
export function chunkTextForNotion(content: string, maxLen: number = NOTION_CHUNK_MAX): string[] {
  if (content.length <= maxLen) return [content];
  const chunks: string[] = [];
  let current = "";
  const flush = (): void => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };
  for (const para of content.split("\n\n")) {
    const candidate = current.length === 0 ? para : `${current}\n\n${para}`;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    flush();
    if (para.length <= maxLen) {
      current = para;
      continue;
    }
    // Hard split an oversized paragraph
    for (let i = 0; i < para.length; i += maxLen) {
      chunks.push(para.slice(i, i + maxLen));
    }
  }
  flush();
  return chunks;
}

/** One Notion paragraph block per chunk. */
function notionParagraphBlock(chunk: string): Record<string, unknown> {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ text: { content: chunk } }] },
  };
}

/**
 * Task 4.1: fetch's BodyInit type rejects Buffer<ArrayBufferLike>; expose the
 * same bytes as a Uint8Array view (no copy). Buffers produced by Buffer.from /
 * Buffer.concat are always backed by a plain ArrayBuffer, never a
 * SharedArrayBuffer, so the cast is sound.
 */
function toBodyInit(buf: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(buf.buffer as ArrayBuffer, buf.byteOffset, buf.byteLength);
}

/**
 * Task 4.1: resolve the Content-Type for a binary upload. Invalid explicit
 * mimeType fails closed (header-injection guard) with a static message.
 */
function resolveBinaryMime(p: Record<string, unknown>): string {
  const mime = resolveUploadMimeType(p["name"], p["mimeType"]);
  if (mime === null) {
    throw new PerformerError("invalid_payload: mimeType must be a single valid MIME type token");
  }
  return mime;
}

// ---------------------------------------------------------------------------
// Performer: send_email
// ---------------------------------------------------------------------------

function makeSendEmail(gmailTokens: TokenProvider | null, fetchImpl: typeof fetch): Performer {
  return async (req, _opts) => {
    if (gmailTokens === null) {
      throw new PerformerError(
        "credential_missing: GMAIL_TOKEN (or GMAIL_CLIENT_ID + GMAIL_CLIENT_SECRET + GMAIL_REFRESH_TOKEN)",
      );
    }
    const { to, subject, body } = req.payload as Record<string, unknown>;
    if (!to || !subject || !body) {
      throw new PerformerError("invalid_payload: send_email requires to/subject/body");
    }

    // I3: reject header fields containing CRLF to prevent header injection
    if (typeof to === "string" && /[\r\n]/.test(to)) {
      throw new PerformerError("invalid_payload: header fields must not contain line breaks");
    }
    if (typeof subject === "string" && /[\r\n]/.test(subject)) {
      throw new PerformerError("invalid_payload: header fields must not contain line breaks");
    }

    // Build minimal RFC-2822 message
    const rfc2822 = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
    const raw = base64url(Buffer.from(rfc2822, "utf8"));

    // Task 4.4: token resolved AFTER payload validation so an invalid payload
    // never triggers an OAuth exchange.
    const token = await gmailTokens.getToken();

    const res = await fetchImpl(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      },
    );
    assertOk(res, "gmail");
    const data = (await res.json()) as Record<string, unknown>;
    return { id: data["id"] };
  };
}

// ---------------------------------------------------------------------------
// Performer: upload_document
// ---------------------------------------------------------------------------

function makeUploadDocument(
  env: PerformerEnv,
  fetchImpl: typeof fetch,
  tokens: { gdrive: TokenProvider | null; graph: TokenProvider | null },
): Performer {
  return async (req, _opts) => {
    const p = req.payload as Record<string, unknown>;
    const destination = p["destination"] as string | undefined;

    if (destination === "onedrive") {
      if (tokens.graph === null) {
        throw new PerformerError(
          "credential_missing: MS_GRAPH_TOKEN (or MS_TENANT_ID + MS_CLIENT_ID + MS_CLIENT_SECRET)",
        );
      }
      const driveId = p["driveId"] as string | undefined;
      const parentItemId = p["parentItemId"] as string | undefined;
      const name = p["name"] as string;

      if (!driveId || !parentItemId) {
        throw new PerformerError("invalid_payload: upload_document onedrive requires driveId and parentItemId");
      }

      // Task 4.1: binary path (contentBase64) → PUT decoded bytes with the
      // resolved Content-Type. Text path stays byte-for-byte compatible.
      let body: string | Buffer;
      let contentType: string;
      if (p["contentBase64"] !== undefined) {
        body = decodeBinaryUpload(p);
        contentType = resolveBinaryMime(p);
      } else {
        body = p["content"] as string;
        contentType = "application/octet-stream";
      }

      // Task 4.4: token resolved AFTER payload validation so an invalid
      // payload never triggers an OAuth exchange.
      const graphToken = await tokens.graph.getToken();

      // minor: encodeURIComponent on agent-supplied path segments
      const url = `https://graph.microsoft.com/v1.0/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentItemId)}:/${encodeURIComponent(name)}:/content`;
      const res = await fetchImpl(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${graphToken}`,
          "Content-Type": contentType,
        },
        body: typeof body === "string" ? body : toBodyInit(body),
      });
      assertOk(res, "graph");
      const data = (await res.json()) as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      if (data["id"]) result["id"] = data["id"];
      if (data["webUrl"]) result["webUrl"] = data["webUrl"];
      return result;
    }

    if (destination === "gdrive") {
      if (tokens.gdrive === null) {
        throw new PerformerError(
          "credential_missing: GDRIVE_ACCESS_TOKEN (or GDRIVE_CLIENT_ID + GDRIVE_CLIENT_SECRET + GDRIVE_REFRESH_TOKEN)",
        );
      }
      const name = p["name"] as string;
      const folderId = p["folderId"];

      // Optional folder placement: when the delivery playbook supplies a
      // destination folderId, the file is created inside it (Drive `parents`);
      // absent → lands in My Drive root (backward compatible).
      // folderId is an OPAQUE vendor id — validate fail-closed: non-empty string
      // with no '/', whitespace, or control chars (path-traversal / injection
      // guard). The static error message never echoes the supplied value.
      let parents: string[] | undefined;
      if (folderId !== undefined) {
        if (
          typeof folderId !== "string" ||
          folderId.length === 0 ||
          /[/\s\u0000-\u001f\u007f]/.test(folderId)
        ) {
          throw new PerformerError(
            "invalid_payload: folderId must be a non-empty vendor id with no path, whitespace, or control characters",
          );
        }
        parents = [folderId];
      }

      // minor: random boundary per call (crypto.randomUUID); check content doesn't contain it
      const boundary = crypto.randomUUID().replace(/-/g, "");
      const metadata = JSON.stringify(parents ? { name, parents } : { name });

      // Task 4.1: binary path (contentBase64) → multipart with a metadata part
      // ({name, parents?}) and a binary part carrying the resolved MIME type.
      // Text path stays byte-for-byte compatible.
      let multipartBody: string | Buffer;
      if (p["contentBase64"] !== undefined) {
        const bytes = decodeBinaryUpload(p);
        const mime = resolveBinaryMime(p);
        if (bytes.includes(boundary)) {
          // Astronomically unlikely but guard per spec
          throw new PerformerError("invalid_payload: content conflicts with multipart boundary");
        }
        const head = [
          `--${boundary}`,
          "Content-Type: application/json; charset=UTF-8",
          "",
          metadata,
          `--${boundary}`,
          `Content-Type: ${mime}`,
          "",
          "",
        ].join("\r\n");
        multipartBody = Buffer.concat([
          Buffer.from(head, "utf8"),
          bytes,
          Buffer.from(`\r\n--${boundary}--`, "utf8"),
        ]);
      } else {
        const content = p["content"] as string;
        if (content.includes(boundary)) {
          // Astronomically unlikely but guard per spec
          throw new PerformerError("invalid_payload: content conflicts with multipart boundary");
        }
        multipartBody = [
          `--${boundary}`,
          "Content-Type: application/json; charset=UTF-8",
          "",
          metadata,
          `--${boundary}`,
          "Content-Type: text/plain",
          "",
          content,
          `--${boundary}--`,
        ].join("\r\n");
      }

      // Task 4.4: token resolved AFTER payload validation so an invalid
      // payload never triggers an OAuth exchange.
      const gdriveToken = await tokens.gdrive.getToken();

      const res = await fetchImpl(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gdriveToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: typeof multipartBody === "string" ? multipartBody : toBodyInit(multipartBody),
        },
      );
      assertOk(res, "gdrive");
      const data = (await res.json()) as Record<string, unknown>;
      // Finding 1: without an explicit `fields` query param, Drive's create
      // response omits webViewLink by default — the delivery link would never
      // exist end-to-end for the primary vendor. webUrl is included only when
      // the vendor actually returned a string (defensive per the ReceiptBody
      // contract downstream: never assign an undefined/non-string webUrl).
      const result: Record<string, unknown> = { id: data["id"] };
      if (typeof data["webViewLink"] === "string") result["webUrl"] = data["webViewLink"];
      return result;
    }

    if (destination === "notion") {
      if (!env.NOTION_API_KEY) {
        throw new PerformerError("credential_missing: NOTION_API_KEY");
      }
      // Task 4.1: the Notion pages API takes rich_text blocks, not file bytes —
      // a binary upload targeting notion fails closed with an honest,
      // structured error rather than silently uploading base64 text.
      if (p["contentBase64"] !== undefined) {
        throw new PerformerError("unsupported_binary_destination: the notion pages API cannot accept binary uploads");
      }
      const name = p["name"] as string;
      const content = p["content"];
      const parentPageId = p["parentPageId"] as string | undefined;

      if (!parentPageId) {
        throw new PerformerError("invalid_payload: upload_document notion requires parentPageId");
      }
      // Task 4.9: the chunker needs a real string; fail closed with a static
      // message rather than shipping "undefined" to the vendor.
      if (typeof content !== "string") {
        throw new PerformerError("invalid_payload: upload_document notion requires string content");
      }

      // Task 4.9: Notion caps text.content at 2,000 chars and children at 100
      // blocks per request. Chunk on paragraph boundaries (≤1,900 chars each,
      // one paragraph block per chunk); the first 100 blocks ride on the page
      // create, the rest are appended via sequential PATCH
      // /v1/blocks/{page_id}/children calls of ≤100 blocks each. A PATCH
      // failure part-way surfaces as a vendor_error (502 + error receipt);
      // the page then exists with partial content — honest failure, the
      // receipt shows the error and a human can inspect the page.
      const blocks = chunkTextForNotion(content).map(notionParagraphBlock);

      const notionHeaders = {
        Authorization: `Bearer ${env.NOTION_API_KEY}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      };

      const notionBody = {
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ text: { content: name } }],
          },
        },
        children: blocks.slice(0, NOTION_MAX_BLOCKS_PER_REQUEST),
      };

      const res = await fetchImpl("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: notionHeaders,
        body: JSON.stringify(notionBody),
      });
      assertOk(res, "notion");
      const data = (await res.json()) as Record<string, unknown>;

      // Append any remaining blocks in sequence (each request ≤100 blocks).
      if (blocks.length > NOTION_MAX_BLOCKS_PER_REQUEST) {
        const pageId = data["id"];
        // Fail closed: without a usable page id we cannot append the rest —
        // static message, never echoing vendor response content.
        if (typeof pageId !== "string" || pageId.length === 0 || /[\r\n]/.test(pageId)) {
          throw new PerformerError("vendor_error: notion create response missing usable page id");
        }
        for (
          let i = NOTION_MAX_BLOCKS_PER_REQUEST;
          i < blocks.length;
          i += NOTION_MAX_BLOCKS_PER_REQUEST
        ) {
          const appendRes = await fetchImpl(
            `https://api.notion.com/v1/blocks/${encodeURIComponent(pageId)}/children`,
            {
              method: "PATCH",
              headers: notionHeaders,
              body: JSON.stringify({ children: blocks.slice(i, i + NOTION_MAX_BLOCKS_PER_REQUEST) }),
            },
          );
          assertOk(appendRes, "notion");
        }
      }

      return { id: data["id"] };
    }

    throw new PerformerError("invalid_payload: unknown destination");
  };
}

// ---------------------------------------------------------------------------
// Performer: query_external_model
// ---------------------------------------------------------------------------

function makeQueryExternalModel(env: PerformerEnv, fetchImpl: typeof fetch): Performer {
  return async (req, opts) => {
    const p = req.payload as Record<string, unknown>;
    const prompt = p["prompt"] as string;
    const model = p["model"] as string | undefined;

    if (opts.useLocal) {
      if (!env.LOCAL_MODEL_URL) {
        throw new PerformerError("local_model_unavailable");
      }
      const chatBody: Record<string, unknown> = {
        messages: [{ role: "user", content: prompt }],
      };
      if (model) chatBody["model"] = model;

      const res = await fetchImpl(`${env.LOCAL_MODEL_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatBody),
      });
      assertOk(res, "local_model");
      const data = (await res.json()) as Record<string, unknown>;
      const choices = data["choices"] as Array<{ message: { content: string } }>;
      return { content: choices[0].message.content };
    }

    // Cloud path
    if (!env.EXTERNAL_MODEL_API_KEY) {
      throw new PerformerError("credential_missing: EXTERNAL_MODEL_API_KEY");
    }
    const baseUrl = env.EXTERNAL_MODEL_URL ?? "https://api.openai.com";
    const chatBody: Record<string, unknown> = {
      messages: [{ role: "user", content: prompt }],
    };
    if (model) chatBody["model"] = model;

    const res = await fetchImpl(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.EXTERNAL_MODEL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatBody),
    });
    assertOk(res, "external_model");
    const data = (await res.json()) as Record<string, unknown>;
    const choices = data["choices"] as Array<{ message: { content: string } }>;
    return { content: choices[0].message.content };
  };
}

// ---------------------------------------------------------------------------
// Performer: share_external (not implemented in v1)
// ---------------------------------------------------------------------------

function makeShareExternal(): Performer {
  return async (_req, _opts) => {
    throw new PerformerError(
      "not_implemented: share_external needs an operator-configured destination (v1)",
    );
  };
}

// ---------------------------------------------------------------------------
// Action-package performers
// ---------------------------------------------------------------------------

const DEFAULT_ACTION_PACKAGE_DIR = path.join(os.homedir(), ".possiblaw", "action-packages");

function makeActionPackagePerformer(env: PerformerEnv): Performer {
  return async (req, _opts) => {
    const pkgDir = env.GATE_ACTION_PACKAGE_DIR ?? DEFAULT_ACTION_PACKAGE_DIR;
    // minor: create directory with restricted permissions (0o700)
    fs.mkdirSync(pkgDir, { recursive: true, mode: 0o700 });

    const createdAt = new Date().toISOString();
    const safeTs = createdAt.replace(/[:.]/g, "-");
    const fileName = `${safeTs}-${req.tool}.json`;
    const filePath = path.join(pkgDir, fileName);

    // Intentional data minimization: approvalId, confidentiality, and entities are
    // deliberately excluded from the action package meta — agentId + issueId are
    // sufficient for a human executing the package offline.
    const pkg = {
      tool: req.tool,
      payload: req.payload,
      meta: { agentId: req.meta.agentId, issueId: req.meta.issueId },
      createdAt,
    };
    // minor: write with restricted permissions (0o600)
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2), { encoding: "utf8", mode: 0o600 });

    return {
      actionPackage: filePath,
      note: "no external API in v1 — a human executes this package manually",
    };
  };
}

// ---------------------------------------------------------------------------
// buildPerformers
// ---------------------------------------------------------------------------

export function buildPerformers(
  env: PerformerEnv,
  fetchImpl: typeof fetch = globalThis.fetch,
): PerformerRegistry {
  // Task 4.4: token providers built once per registry (their in-memory caches
  // live as long as the registry). Refresh vars take precedence; static tokens
  // are the fallback; null → the performer throws credential_missing at call
  // time (matching the previous static-env behavior).
  const gmailTokens = makeGoogleTokenProviderFromEnv(
    {
      ...(env.GMAIL_CLIENT_ID !== undefined ? { clientId: env.GMAIL_CLIENT_ID } : {}),
      ...(env.GMAIL_CLIENT_SECRET !== undefined ? { clientSecret: env.GMAIL_CLIENT_SECRET } : {}),
      ...(env.GMAIL_REFRESH_TOKEN !== undefined ? { refreshToken: env.GMAIL_REFRESH_TOKEN } : {}),
      ...(env.GMAIL_TOKEN !== undefined ? { staticToken: env.GMAIL_TOKEN } : {}),
    },
    { fetchImpl },
  );
  const gdriveTokens = makeGoogleTokenProviderFromEnv(
    {
      ...(env.GDRIVE_CLIENT_ID !== undefined ? { clientId: env.GDRIVE_CLIENT_ID } : {}),
      ...(env.GDRIVE_CLIENT_SECRET !== undefined ? { clientSecret: env.GDRIVE_CLIENT_SECRET } : {}),
      ...(env.GDRIVE_REFRESH_TOKEN !== undefined ? { refreshToken: env.GDRIVE_REFRESH_TOKEN } : {}),
      ...(env.GDRIVE_ACCESS_TOKEN !== undefined ? { staticToken: env.GDRIVE_ACCESS_TOKEN } : {}),
    },
    { fetchImpl },
  );
  const graphTokens = makeMicrosoftTokenProviderFromEnv(
    {
      ...(env.MS_TENANT_ID !== undefined ? { tenantId: env.MS_TENANT_ID } : {}),
      ...(env.MS_CLIENT_ID !== undefined ? { clientId: env.MS_CLIENT_ID } : {}),
      ...(env.MS_CLIENT_SECRET !== undefined ? { clientSecret: env.MS_CLIENT_SECRET } : {}),
      ...(env.MS_GRAPH_TOKEN !== undefined ? { staticToken: env.MS_GRAPH_TOKEN } : {}),
    },
    { fetchImpl },
  );

  const actionPkg = makeActionPackagePerformer(env);
  return {
    send_email: makeSendEmail(gmailTokens, fetchImpl),
    upload_document: makeUploadDocument(env, fetchImpl, { gdrive: gdriveTokens, graph: graphTokens }),
    query_external_model: makeQueryExternalModel(env, fetchImpl),
    share_external: makeShareExternal(),
    file_court_document: actionPkg,
    sign_document: actionPkg,
    send_payment: actionPkg,
    delete_external_resource: actionPkg,
  };
}
