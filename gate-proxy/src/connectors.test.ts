import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildPerformers, PerformerError } from "./connectors.ts";
import { TOOL_BOUNDARIES } from "./boundary.ts";

// ---------------------------------------------------------------------------
// Fake fetch factory
// ---------------------------------------------------------------------------

interface CapturedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function makeFakeFetch(
  status: number,
  responseBody: unknown,
): { fetchImpl: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      const h = init.headers as Record<string, string>;
      for (const [k, v] of Object.entries(h)) {
        headers[k.toLowerCase()] = v;
      }
    }
    let bodyStr: string | undefined;
    if (init?.body !== undefined && init.body !== null) {
      if (typeof init.body === "string") {
        bodyStr = init.body;
      } else if (init.body instanceof Uint8Array) {
        bodyStr = Buffer.from(init.body).toString("utf8");
      } else {
        bodyStr = String(init.body);
      }
    }
    captured.push({ url, method: init?.method ?? "GET", headers, body: bodyStr });
    const json = JSON.stringify(responseBody);
    return new Response(json, {
      status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, captured };
}

// ---------------------------------------------------------------------------
// Temp dir helpers for action packages
// ---------------------------------------------------------------------------

let tmpDir: string;

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "connectors-test-"));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. send_email — correct request shape, returns id
// ---------------------------------------------------------------------------

describe("send_email", () => {
  it("posts to Gmail send endpoint with bearer token; raw decodes to contain To/Subject/body", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "msg-abc" });
    const performers = buildPerformers({ GMAIL_TOKEN: "tok-123" }, fetchImpl);
    const result = await performers["send_email"](
      {
        tool: "send_email",
        payload: { to: "alice@example.com", subject: "Test", body: "Hello world" },
        meta: { agentId: "agent-1" },
      },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.url, "https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    assert.equal(req.method, "POST");
    assert.equal(req.headers["authorization"], "Bearer tok-123");

    // Parse the raw field and base64url-decode
    const body = JSON.parse(req.body!);
    const rawDecoded = Buffer.from(body.raw, "base64url").toString("utf8");
    assert.ok(rawDecoded.includes("To: alice@example.com"), "missing To header");
    assert.ok(rawDecoded.includes("Subject: Test"), "missing Subject header");
    assert.ok(rawDecoded.includes("Hello world"), "missing body text");

    assert.deepEqual(result, { id: "msg-abc" });
  });

  // ---------------------------------------------------------------------------
  // 2. send_email without GMAIL_TOKEN → PerformerError credential_missing; fetch NOT called
  // ---------------------------------------------------------------------------

  it("throws credential_missing when GMAIL_TOKEN absent; fetch not called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {});
    const performers = buildPerformers({}, fetchImpl);
    await assert.rejects(
      () =>
        performers["send_email"](
          { tool: "send_email", payload: { to: "a@b.com", subject: "s", body: "b" }, meta: {} },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("credential_missing: GMAIL_TOKEN"));
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });

  // ---------------------------------------------------------------------------
  // 3. send_email missing `to` → invalid_payload; fetch NOT called
  // ---------------------------------------------------------------------------

  it("throws invalid_payload when to is missing; fetch not called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {});
    const performers = buildPerformers({ GMAIL_TOKEN: "tok" }, fetchImpl);
    await assert.rejects(
      () =>
        performers["send_email"](
          { tool: "send_email", payload: { subject: "s", body: "b" }, meta: {} },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("invalid_payload"));
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. upload_document — onedrive: PUT URL contains driveId/parentItemId/name
// ---------------------------------------------------------------------------

describe("upload_document", () => {
  it("onedrive: PUT URL contains driveId/parentItemId/name; bearer MS_GRAPH_TOKEN; body = content", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "item-xyz", webUrl: "https://od/item" });
    const performers = buildPerformers({ MS_GRAPH_TOKEN: "graph-tok" }, fetchImpl);
    const result = await performers["upload_document"](
      {
        tool: "upload_document",
        payload: {
          destination: "onedrive",
          name: "brief.pdf",
          content: "CONTENT_BYTES",
          driveId: "drive-1",
          parentItemId: "parent-1",
        },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.ok(req.url.includes("drive-1"), "URL missing driveId");
    assert.ok(req.url.includes("parent-1"), "URL missing parentItemId");
    assert.ok(req.url.includes("brief.pdf"), "URL missing fileName");
    assert.equal(req.method, "PUT");
    assert.equal(req.headers["authorization"], "Bearer graph-tok");
    assert.equal(req.body, "CONTENT_BYTES");
    assert.ok("id" in result || "webUrl" in result);
  });

  // ---------------------------------------------------------------------------
  // 5a. upload_document gdrive: multipart POST with bearer
  // ---------------------------------------------------------------------------

  it("gdrive: multipart POST includes bearer GDRIVE_ACCESS_TOKEN", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "gdrive-file-1" });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "gdrive", name: "doc.txt", content: "file content" },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.ok(
      req.url.startsWith("https://www.googleapis.com/upload/drive/v3/files"),
      "unexpected URL",
    );
    assert.equal(req.method, "POST");
    assert.equal(req.headers["authorization"], "Bearer gdrive-tok");
    // Finding 1: request the webViewLink field so the delivery link exists
    // end-to-end — without this, Drive's default response omits it.
    assert.ok(
      req.url.includes("fields=id,webViewLink"),
      `upload URL must request id,webViewLink fields; got: ${req.url}`,
    );
  });

  // ---------------------------------------------------------------------------
  // 5b. upload_document notion: URL + Notion-Version header + bearer
  // ---------------------------------------------------------------------------

  it("notion: posts to /v1/pages with Notion-Version header and bearer NOTION_API_KEY", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "page-abc" });
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: {
          destination: "notion",
          name: "Research Note",
          content: "Content of the page",
          parentPageId: "parent-page-1",
        },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.url, "https://api.notion.com/v1/pages");
    assert.equal(req.method, "POST");
    assert.equal(req.headers["authorization"], "Bearer notion-tok");
    assert.equal(req.headers["notion-version"], "2022-06-28");
  });

  // ---------------------------------------------------------------------------
  // 6. upload_document unknown destination → invalid_payload
  // ---------------------------------------------------------------------------

  it("throws invalid_payload for unknown destination", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {});
    const performers = buildPerformers(
      { MS_GRAPH_TOKEN: "x", GDRIVE_ACCESS_TOKEN: "x", NOTION_API_KEY: "x" },
      fetchImpl,
    );
    await assert.rejects(
      () =>
        performers["upload_document"](
          {
            tool: "upload_document",
            payload: { destination: "dropbox", name: "f", content: "c" },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("invalid_payload"));
        // Static message — payload value (destination) must NOT be echoed
        assert.ok(!err.message.includes("dropbox"), `error must not echo payload value; got: ${(err as Error).message}`);
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Task 4.3a — gdrive folder placement via optional folderId → parents
// ---------------------------------------------------------------------------

describe("upload_document gdrive folderId (parents placement)", () => {
  // Happy: folderId present → multipart metadata carries parents:[folderId]
  it("gdrive with folderId → metadata part contains \"parents\":[folderId]; upload proceeds", async () => {
    // Finding 1: mock a real-gdrive-shaped response (id + webViewLink, as Drive
    // returns once `fields=id,webViewLink` is requested) so this test covers the
    // end-to-end webUrl contract, not just the id.
    const webUrl = "https://drive.google.com/file/d/gdrive-file-2/view";
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "gdrive-file-2", webViewLink: webUrl });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    const result = await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "gdrive", name: "doc.txt", content: "file content", folderId: "abc123" },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1, "upload must proceed (fetch called once)");
    const req = captured[0];
    assert.ok(
      req.body!.includes('"parents":["abc123"]'),
      `multipart body must contain parents:[folderId]; got: ${req.body}`,
    );
    assert.deepEqual(result, { id: "gdrive-file-2", webUrl });
  });

  // Edge: no folderId → metadata is {name} exactly (no parents) — backward compatible
  it("gdrive without folderId → metadata is {name} exactly, no parents key", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "gdrive-file-3" });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "gdrive", name: "doc.txt", content: "file content" },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.ok(!req.body!.includes("parents"), `metadata must not contain parents when folderId absent; got: ${req.body}`);
    assert.ok(req.body!.includes('{"name":"doc.txt"}'), `metadata must be {name} exactly; got: ${req.body}`);
  });

  // Failure/security: folderId with traversal / whitespace / control chars → invalid_payload, fetch NOT called
  it("gdrive with path-traversal folderId → invalid_payload, fetch NOT called, value not echoed", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "x" });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    const badFolder = "../../etc";
    await assert.rejects(
      () =>
        performers["upload_document"](
          {
            tool: "upload_document",
            payload: { destination: "gdrive", name: "doc.txt", content: "c", folderId: badFolder },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("invalid_payload"), `message should be invalid_payload; got: ${(err as Error).message}`);
        assert.ok(!err.message.includes(badFolder), `error must not echo folderId value; got: ${(err as Error).message}`);
        return true;
      },
    );
    assert.equal(captured.length, 0, "fetch must NOT be called on invalid folderId");
  });

  it("gdrive with whitespace/control-char/empty folderId → invalid_payload, fetch NOT called", async () => {
    for (const bad of ["has space", "tab\tid", "line\nid", "ctrl\u0001id", ""]) {
      const { fetchImpl, captured } = makeFakeFetch(200, {});
      const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
      await assert.rejects(
        () =>
          performers["upload_document"](
            {
              tool: "upload_document",
              payload: { destination: "gdrive", name: "doc.txt", content: "c", folderId: bad },
              meta: {},
            },
            {},
          ),
        (err: unknown) => {
          assert.ok(err instanceof PerformerError, `should be PerformerError for folderId=${JSON.stringify(bad)}`);
          assert.ok(err.message.includes("invalid_payload"));
          return true;
        },
      );
      assert.equal(captured.length, 0, `fetch must NOT be called for folderId=${JSON.stringify(bad)}`);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. query_external_model — cloud path
// ---------------------------------------------------------------------------

describe("query_external_model", () => {
  it("cloud: POSTs to EXTERNAL_MODEL_URL/v1/chat/completions with bearer; returns content", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {
      choices: [{ message: { content: "answer text" } }],
    });
    const performers = buildPerformers(
      {
        EXTERNAL_MODEL_URL: "https://api.openai.com",
        EXTERNAL_MODEL_API_KEY: "sk-key",
      },
      fetchImpl,
    );
    const result = await performers["query_external_model"](
      { tool: "query_external_model", payload: { prompt: "What is law?" }, meta: {} },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(req.method, "POST");
    assert.equal(req.headers["authorization"], "Bearer sk-key");
    const reqBody = JSON.parse(req.body!);
    assert.ok(Array.isArray(reqBody.messages));
    assert.ok(
      reqBody.messages.some((m: { role: string; content: string }) => m.content.includes("What is law?")),
    );
    assert.deepEqual(result, { content: "answer text" });
  });

  // ---------------------------------------------------------------------------
  // 8. query_external_model useLocal — NO Authorization header
  // ---------------------------------------------------------------------------

  it("useLocal: POSTs to LOCAL_MODEL_URL with no Authorization header", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {
      choices: [{ message: { content: "local answer" } }],
    });
    const performers = buildPerformers(
      { LOCAL_MODEL_URL: "http://127.0.0.1:11434" },
      fetchImpl,
    );
    await performers["query_external_model"](
      { tool: "query_external_model", payload: { prompt: "hello" }, meta: {} },
      { useLocal: true },
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.ok(req.url.startsWith("http://127.0.0.1:11434"), "unexpected URL");
    assert.ok(!("authorization" in req.headers), "should NOT have Authorization header");
  });

  // ---------------------------------------------------------------------------
  // 9. query_external_model useLocal without LOCAL_MODEL_URL → local_model_unavailable
  // ---------------------------------------------------------------------------

  it("useLocal without LOCAL_MODEL_URL → local_model_unavailable", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {});
    const performers = buildPerformers({}, fetchImpl);
    await assert.rejects(
      () =>
        performers["query_external_model"](
          { tool: "query_external_model", payload: { prompt: "hi" }, meta: {} },
          { useLocal: true },
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.equal(err.message, "local_model_unavailable");
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 10. share_external → not_implemented
// ---------------------------------------------------------------------------

describe("share_external", () => {
  it("always throws not_implemented", async () => {
    const { fetchImpl } = makeFakeFetch(200, {});
    const performers = buildPerformers({}, fetchImpl);
    await assert.rejects(
      () =>
        performers["share_external"](
          { tool: "share_external", payload: {}, meta: {} },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("not_implemented"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Action-package performers: file_court_document, sign_document, send_payment, delete_external_resource
// ---------------------------------------------------------------------------

describe("action-package performers", () => {
  const actionTools = [
    "file_court_document",
    "sign_document",
    "send_payment",
    "delete_external_resource",
  ] as const;

  for (const tool of actionTools) {
    it(`${tool}: writes action package file with tool/payload/createdAt; returns path + note`, async () => {
      const { fetchImpl } = makeFakeFetch(200, {});
      const pkgDir = path.join(tmpDir, `ap-${tool}`);
      const performers = buildPerformers(
        { GATE_ACTION_PACKAGE_DIR: pkgDir },
        fetchImpl,
      );

      const sentinelPayload = { caseNumber: "SENTINEL_DATA_DO_NOT_LOG", amount: 100 };
      const result = await performers[tool](
        { tool, payload: sentinelPayload, meta: { agentId: "a1", issueId: "i1" } },
        {},
      );

      assert.ok(typeof result["actionPackage"] === "string", "result.actionPackage must be a string");
      assert.ok(typeof result["note"] === "string");

      const pkgPath = result["actionPackage"] as string;
      assert.ok(fs.existsSync(pkgPath), `action package file not found at ${pkgPath}`);

      const pkgContent = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      assert.equal(pkgContent.tool, tool);
      assert.deepEqual(pkgContent.payload, sentinelPayload);
      assert.ok(typeof pkgContent.createdAt === "string", "createdAt must be a string");
      assert.deepEqual(pkgContent.meta, { agentId: "a1", issueId: "i1" });
    });
  }
});

// ---------------------------------------------------------------------------
// 12. vendor 500 → PerformerError with status; message does NOT contain payload sentinel
// ---------------------------------------------------------------------------

describe("vendor error sanitization", () => {
  it("vendor 500 → PerformerError vendor_error with status 500; message does not contain payload text", async () => {
    const SENTINEL = "PAYLOAD_SENTINEL_XYZ_DO_NOT_APPEAR_IN_ERROR";
    const { fetchImpl } = makeFakeFetch(500, { error: "server error" });
    const performers = buildPerformers({ GMAIL_TOKEN: "tok" }, fetchImpl);

    await assert.rejects(
      () =>
        performers["send_email"](
          {
            tool: "send_email",
            payload: { to: SENTINEL + "@example.com", subject: SENTINEL, body: SENTINEL },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("vendor_error"), "should include vendor_error");
        assert.ok(err.message.includes("500"), "should include status code");
        assert.ok(!err.message.includes(SENTINEL), "error message must NOT contain payload sentinel");
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// 13. Registry keys === exactly the 8 tools — matches TOOL_BOUNDARIES
// ---------------------------------------------------------------------------

describe("registry completeness", () => {
  it("performer registry keys match TOOL_BOUNDARIES keys exactly", () => {
    const performers = buildPerformers({});
    const performerKeys = Object.keys(performers).sort();
    const boundaryKeys = Object.keys(TOOL_BOUNDARIES).sort();
    assert.deepEqual(performerKeys, boundaryKeys);
  });
});

// ---------------------------------------------------------------------------
// I3 regression — CRLF header injection in send_email
// ---------------------------------------------------------------------------

describe("I3 — CRLF header injection regression", () => {
  it("subject with CRLF injection throws PerformerError; fetch NOT called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "msg-x" });
    const performers = buildPerformers({ GMAIL_TOKEN: "tok-x" }, fetchImpl);

    await assert.rejects(
      () =>
        performers["send_email"](
          {
            tool: "send_email",
            payload: {
              to: "alice@example.com",
              subject: "Hi\r\nBcc: attacker@evil.com",
              body: "body",
            },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError, "should be PerformerError");
        assert.ok(
          err.message.includes("header fields must not contain line breaks"),
          `message should mention line breaks; got: ${(err as Error).message}`,
        );
        return true;
      },
    );
    assert.equal(captured.length, 0, "fetch must NOT be called on CRLF injection attempt");
  });

  it("to field with CRLF injection throws PerformerError; fetch NOT called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "msg-x" });
    const performers = buildPerformers({ GMAIL_TOKEN: "tok-x" }, fetchImpl);

    await assert.rejects(
      () =>
        performers["send_email"](
          {
            tool: "send_email",
            payload: {
              to: "alice@example.com\r\nBcc: attacker@evil.com",
              subject: "Subject",
              body: "body",
            },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });
});
