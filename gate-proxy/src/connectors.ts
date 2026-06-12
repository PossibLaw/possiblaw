import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { EgressRequest } from "./types.ts";

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

// ---------------------------------------------------------------------------
// Performer: send_email
// ---------------------------------------------------------------------------

function makeSendEmail(env: PerformerEnv, fetchImpl: typeof fetch): Performer {
  return async (req, _opts) => {
    if (!env.GMAIL_TOKEN) {
      throw new PerformerError("credential_missing: GMAIL_TOKEN");
    }
    const { to, subject, body } = req.payload as Record<string, unknown>;
    if (!to || !subject || !body) {
      throw new PerformerError("invalid_payload: send_email requires to/subject/body");
    }

    // Build minimal RFC-2822 message
    const rfc2822 = `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`;
    const raw = base64url(Buffer.from(rfc2822, "utf8"));

    const res = await fetchImpl(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GMAIL_TOKEN}`,
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

function makeUploadDocument(env: PerformerEnv, fetchImpl: typeof fetch): Performer {
  return async (req, _opts) => {
    const p = req.payload as Record<string, unknown>;
    const destination = p["destination"] as string | undefined;

    if (destination === "onedrive") {
      if (!env.MS_GRAPH_TOKEN) {
        throw new PerformerError("credential_missing: MS_GRAPH_TOKEN");
      }
      const driveId = p["driveId"] as string | undefined;
      const parentItemId = p["parentItemId"] as string | undefined;
      const name = p["name"] as string;
      const content = p["content"] as string;

      if (!driveId || !parentItemId) {
        throw new PerformerError("invalid_payload: upload_document onedrive requires driveId and parentItemId");
      }

      const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentItemId}:/${name}:/content`;
      const res = await fetchImpl(url, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${env.MS_GRAPH_TOKEN}`,
          "Content-Type": "application/octet-stream",
        },
        body: content,
      });
      assertOk(res, "graph");
      const data = (await res.json()) as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      if (data["id"]) result["id"] = data["id"];
      if (data["webUrl"]) result["webUrl"] = data["webUrl"];
      return result;
    }

    if (destination === "gdrive") {
      if (!env.GDRIVE_ACCESS_TOKEN) {
        throw new PerformerError("credential_missing: GDRIVE_ACCESS_TOKEN");
      }
      const name = p["name"] as string;
      const content = p["content"] as string;

      // Multipart upload: metadata part + media part
      const boundary = "gdrive_multipart_boundary";
      const metadata = JSON.stringify({ name });
      const multipartBody = [
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

      const res = await fetchImpl(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.GDRIVE_ACCESS_TOKEN}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        },
      );
      assertOk(res, "gdrive");
      const data = (await res.json()) as Record<string, unknown>;
      return { id: data["id"] };
    }

    if (destination === "notion") {
      if (!env.NOTION_API_KEY) {
        throw new PerformerError("credential_missing: NOTION_API_KEY");
      }
      const name = p["name"] as string;
      const content = p["content"] as string;
      const parentPageId = p["parentPageId"] as string | undefined;

      if (!parentPageId) {
        throw new PerformerError("invalid_payload: upload_document notion requires parentPageId");
      }

      const notionBody = {
        parent: { page_id: parentPageId },
        properties: {
          title: {
            title: [{ text: { content: name } }],
          },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content } }],
            },
          },
        ],
      };

      const res = await fetchImpl("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.NOTION_API_KEY}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(notionBody),
      });
      assertOk(res, "notion");
      const data = (await res.json()) as Record<string, unknown>;
      return { id: data["id"] };
    }

    throw new PerformerError(`invalid_payload: unknown destination ${String(destination)}`);
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
    fs.mkdirSync(pkgDir, { recursive: true });

    const createdAt = new Date().toISOString();
    const safeTs = createdAt.replace(/[:.]/g, "-");
    const fileName = `${safeTs}-${req.tool}.json`;
    const filePath = path.join(pkgDir, fileName);

    const pkg = {
      tool: req.tool,
      payload: req.payload,
      meta: { agentId: req.meta.agentId, issueId: req.meta.issueId },
      createdAt,
    };
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2), "utf8");

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
  const actionPkg = makeActionPackagePerformer(env);
  return {
    send_email: makeSendEmail(env, fetchImpl),
    upload_document: makeUploadDocument(env, fetchImpl),
    query_external_model: makeQueryExternalModel(env, fetchImpl),
    share_external: makeShareExternal(),
    file_court_document: actionPkg,
    sign_document: actionPkg,
    send_payment: actionPkg,
    delete_external_resource: actionPkg,
  };
}
