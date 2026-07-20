import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildPerformers, chunkTextForNotion, PerformerError } from "./connectors.ts";
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
// Route-aware fake fetch (token exchange + vendor call sequences, Task 4.4)
// ---------------------------------------------------------------------------

function makeRoutedFakeFetch(
  routes: Array<{ match: (url: string) => boolean; status: number; body: unknown }>,
): { fetchImpl: typeof fetch; captured: CapturedRequest[] } {
  const captured: CapturedRequest[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    let bodyStr: string | undefined;
    if (init?.body !== undefined && init.body !== null) {
      bodyStr = typeof init.body === "string"
        ? init.body
        : init.body instanceof Uint8Array
          ? Buffer.from(init.body).toString("utf8")
          : String(init.body);
    }
    captured.push({ url, method: init?.method ?? "GET", headers, body: bodyStr });
    const route = routes.find((r) => r.match(url));
    if (!route) throw new Error(`no fake route for ${url}`);
    return new Response(JSON.stringify(route.body), {
      status: route.status,
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
// Task 4.1 — binary upload via contentBase64
// ---------------------------------------------------------------------------

describe("upload_document binary (contentBase64)", () => {
  const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const fakeDocxBytes = Buffer.from("PK\x03\x04 FAKE_DOCX_BINARY_MARKER content", "latin1");
  const fakeDocxB64 = fakeDocxBytes.toString("base64");

  // Happy: gdrive binary → multipart with metadata part + binary part carrying
  // the resolved docx MIME; decoded bytes present in the multipart body.
  it("gdrive binary: multipart carries {name} metadata + docx MIME part + decoded bytes", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "gfile-bin", webViewLink: "https://drive/f" });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    const result = await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "gdrive", name: "brief.docx", contentBase64: fakeDocxB64, documentText: "reviewable text" },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.method, "POST");
    assert.ok(req.url.startsWith("https://www.googleapis.com/upload/drive/v3/files"), "unexpected URL");
    assert.ok(req.body!.includes('{"name":"brief.docx"}'), `metadata part must carry name; got: ${req.body}`);
    assert.ok(req.body!.includes(`Content-Type: ${DOCX_MIME}`), "binary part must carry the resolved docx MIME");
    assert.ok(req.body!.includes("FAKE_DOCX_BINARY_MARKER"), "multipart body must contain the decoded bytes");
    assert.deepEqual(result, { id: "gfile-bin", webUrl: "https://drive/f" });
  });

  // gdrive binary + folderId → parents placement still applies
  it("gdrive binary with folderId → metadata carries parents:[folderId]", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "gfile-bin2" });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "gdrive", name: "brief.docx", contentBase64: fakeDocxB64, documentText: "t", folderId: "folder9" },
        meta: {},
      },
      {},
    );
    assert.equal(captured.length, 1);
    assert.ok(captured[0].body!.includes('"parents":["folder9"]'), "metadata must carry parents");
  });

  // Happy: onedrive binary → PUT with resolved Content-Type and the raw bytes
  it("onedrive binary: PUT with resolved docx Content-Type; body = decoded bytes", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "od-bin", webUrl: "https://od/bin" });
    const performers = buildPerformers({ MS_GRAPH_TOKEN: "graph-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: {
          destination: "onedrive",
          name: "brief.docx",
          contentBase64: fakeDocxB64,
          documentText: "reviewable",
          driveId: "d1",
          parentItemId: "p1",
        },
        meta: {},
      },
      {},
    );
    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.method, "PUT");
    assert.equal(req.headers["content-type"], DOCX_MIME);
    assert.equal(req.body, fakeDocxBytes.toString("utf8"), "PUT body must be the decoded bytes");
  });

  // Explicit mimeType wins over the extension
  it("onedrive binary with explicit mimeType → that Content-Type is used", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "od-bin2" });
    const performers = buildPerformers({ MS_GRAPH_TOKEN: "graph-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: {
          destination: "onedrive",
          name: "brief.docx",
          contentBase64: fakeDocxB64,
          documentText: "t",
          mimeType: "application/pdf",
          driveId: "d1",
          parentItemId: "p1",
        },
        meta: {},
      },
      {},
    );
    assert.equal(captured[0].headers["content-type"], "application/pdf");
  });

  // Unknown extension without explicit mimeType → application/octet-stream
  it("onedrive binary with unknown extension and no mimeType → application/octet-stream", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "od-bin3" });
    const performers = buildPerformers({ MS_GRAPH_TOKEN: "graph-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: {
          destination: "onedrive",
          name: "archive.zip",
          contentBase64: fakeDocxB64,
          documentText: "t",
          driveId: "d1",
          parentItemId: "p1",
        },
        meta: {},
      },
      {},
    );
    assert.equal(captured[0].headers["content-type"], "application/octet-stream");
  });

  // Failure/security: notion cannot take binary — fail closed, fetch NOT called
  it("notion + contentBase64 → unsupported_binary_destination; fetch NOT called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "page-1" });
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, fetchImpl);
    await assert.rejects(
      () =>
        performers["upload_document"](
          {
            tool: "upload_document",
            payload: { destination: "notion", name: "n.docx", contentBase64: fakeDocxB64, documentText: "t", parentPageId: "pp1" },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("unsupported_binary_destination"), `got: ${(err as Error).message}`);
        return true;
      },
    );
    assert.equal(captured.length, 0, "fetch must NOT be called for notion binary");
  });

  // Edge: content + contentBase64 both present → invalid_payload, fetch NOT called
  it("content and contentBase64 both present → invalid_payload; fetch NOT called (gdrive + onedrive)", async () => {
    for (const payload of [
      { destination: "gdrive", name: "f.docx", content: "text", contentBase64: fakeDocxB64, documentText: "t" },
      { destination: "onedrive", name: "f.docx", content: "text", contentBase64: fakeDocxB64, documentText: "t", driveId: "d", parentItemId: "p" },
    ]) {
      const { fetchImpl, captured } = makeFakeFetch(200, {});
      const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "g", MS_GRAPH_TOKEN: "m" }, fetchImpl);
      await assert.rejects(
        () => performers["upload_document"]({ tool: "upload_document", payload, meta: {} }, {}),
        (err: unknown) => {
          assert.ok(err instanceof PerformerError, `PerformerError expected for ${payload.destination}`);
          assert.ok(err.message.includes("invalid_payload"), `got: ${(err as Error).message}`);
          assert.ok(err.message.includes("mutually exclusive"), `got: ${(err as Error).message}`);
          return true;
        },
      );
      assert.equal(captured.length, 0, `fetch must NOT be called for ${payload.destination}`);
    }
  });

  // Failure/security: invalid base64 → invalid_payload, fetch NOT called
  it("invalid base64 → invalid_payload; fetch NOT called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, {});
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "g" }, fetchImpl);
    await assert.rejects(
      () =>
        performers["upload_document"](
          {
            tool: "upload_document",
            payload: { destination: "gdrive", name: "f.docx", contentBase64: "!!not-base64!!", documentText: "t" },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("invalid_payload"), `got: ${(err as Error).message}`);
        assert.ok(err.message.includes("base64"), `got: ${(err as Error).message}`);
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });

  // Failure/security: CRLF in explicit mimeType (header injection) → invalid_payload, fetch NOT called
  it("mimeType with CRLF → invalid_payload; fetch NOT called; value not echoed", async () => {
    const bad = "text/plain\r\nX-Injected: 1";
    const { fetchImpl, captured } = makeFakeFetch(200, {});
    const performers = buildPerformers({ MS_GRAPH_TOKEN: "m" }, fetchImpl);
    await assert.rejects(
      () =>
        performers["upload_document"](
          {
            tool: "upload_document",
            payload: {
              destination: "onedrive",
              name: "f.docx",
              contentBase64: fakeDocxB64,
              documentText: "t",
              mimeType: bad,
              driveId: "d",
              parentItemId: "p",
            },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("invalid_payload"), `got: ${(err as Error).message}`);
        assert.ok(!err.message.includes("X-Injected"), "error must not echo the mimeType value");
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });

  // Backward compatibility: text path untouched (string content, text/plain part)
  it("gdrive text path unchanged: multipart still carries text/plain part", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "gfile-txt" });
    const performers = buildPerformers({ GDRIVE_ACCESS_TOKEN: "gdrive-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "gdrive", name: "doc.txt", content: "plain text body" },
        meta: {},
      },
      {},
    );
    assert.equal(captured.length, 1);
    assert.ok(captured[0].body!.includes("Content-Type: text/plain"), "text path must keep text/plain part");
    assert.ok(captured[0].body!.includes("plain text body"));
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
// Task 4.9 — Notion text chunking (2,000-char rich_text cap; 100-block cap)
// ---------------------------------------------------------------------------

describe("chunkTextForNotion", () => {
  it("short or empty content → single chunk unchanged", () => {
    assert.deepEqual(chunkTextForNotion("hello"), ["hello"]);
    assert.deepEqual(chunkTextForNotion(""), [""]);
    assert.deepEqual(chunkTextForNotion("x".repeat(1900)), ["x".repeat(1900)]);
  });

  it("oversized content without paragraph boundaries → hard split at the cap", () => {
    const chunks = chunkTextForNotion("x".repeat(1901));
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 1900);
    assert.equal(chunks[1].length, 1);
  });

  it("splits on paragraph boundaries where possible, packing paragraphs up to the cap", () => {
    const chunks = chunkTextForNotion("aaa\n\nbbb\n\nccc", 8);
    assert.deepEqual(chunks, ["aaa\n\nbbb", "ccc"]);
  });

  it("a single paragraph over the cap is hard-split", () => {
    const chunks = chunkTextForNotion(`short\n\n${"y".repeat(20)}`, 8);
    assert.deepEqual(chunks, ["short", "yyyyyyyy", "yyyyyyyy", "yyyy"]);
  });

  it("never emits a chunk above the cap", () => {
    const paragraphs = Array.from({ length: 12 }, (_, i) => `${String(i)} `.repeat(120));
    const content = paragraphs.join("\n\n");
    for (const c of chunkTextForNotion(content, 500)) {
      assert.ok(c.length <= 500, `chunk of ${c.length} exceeds cap`);
    }
  });
});

describe("upload_document notion chunking (wire level)", () => {
  it("5,000-char content → ≥3 paragraph blocks in one create; no rich_text content over 2,000 chars", async () => {
    const paragraphs = Array.from({ length: 5 }, (_, i) => `${String(i)}`.padEnd(999, "p"));
    const content = paragraphs.join("\n\n"); // 5×999 + 4×2 = 5,003 chars
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "page-chunk" });
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "notion", name: "Long Note", content, parentPageId: "pp-1" },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 1, "≤100 blocks must need only the create call");
    const body = JSON.parse(captured[0].body!);
    const children = body.children as Array<{ type: string; paragraph: { rich_text: Array<{ text: { content: string } }> } }>;
    assert.ok(children.length >= 3, `expected ≥3 blocks; got ${children.length}`);
    let reassembled = "";
    for (const block of children) {
      assert.equal(block.type, "paragraph");
      for (const rt of block.paragraph.rich_text) {
        assert.ok(rt.text.content.length <= 2000, `rich_text of ${rt.text.content.length} chars exceeds Notion's 2,000 cap`);
        reassembled += rt.text.content;
      }
    }
    // No text lost: everything except the chunk-boundary separators survives
    assert.equal(reassembled.replace(/\n\n/g, ""), content.replace(/\n\n/g, ""));
  });

  it("short content unchanged → exactly 1 block carrying the full content", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "page-short" });
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, fetchImpl);
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "notion", name: "Short", content: "Short body", parentPageId: "pp-1" },
        meta: {},
      },
      {},
    );
    assert.equal(captured.length, 1);
    const body = JSON.parse(captured[0].body!);
    assert.equal(body.children.length, 1);
    assert.equal(body.children[0].paragraph.rich_text[0].text.content, "Short body");
  });

  it(">100 blocks → create carries 100, remaining blocks appended via sequential PATCH /v1/blocks/{page_id}/children (each ≤100)", async () => {
    // 250 paragraphs of 1,000 chars: no two fit in one 1,900-char chunk → 250 blocks
    const content = Array.from({ length: 250 }, (_, i) => `${String(i)}`.padEnd(1000, "q")).join("\n\n");
    const { fetchImpl, captured } = makeRoutedFakeFetch([
      { match: (u) => u === "https://api.notion.com/v1/pages", status: 200, body: { id: "page-big" } },
      { match: (u) => u.includes("/v1/blocks/"), status: 200, body: {} },
    ]);
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, fetchImpl);
    const result = await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "notion", name: "Huge Note", content, parentPageId: "pp-1" },
        meta: {},
      },
      {},
    );

    assert.equal(captured.length, 3, "create + 2 follow-up PATCHes (100+100+50)");
    const createBody = JSON.parse(captured[0].body!);
    assert.equal(createBody.children.length, 100, "create must carry exactly the 100-block cap");

    for (const [idx, expected] of [[1, 100], [2, 50]] as Array<[number, number]>) {
      const req = captured[idx];
      assert.equal(req.method, "PATCH");
      assert.equal(req.url, "https://api.notion.com/v1/blocks/page-big/children");
      assert.equal(req.headers["authorization"], "Bearer notion-tok");
      assert.equal(req.headers["notion-version"], "2022-06-28");
      const children = JSON.parse(req.body!).children as unknown[];
      assert.equal(children.length, expected, `PATCH #${idx} must carry ${expected} blocks`);
    }
    assert.deepEqual(result, { id: "page-big" });
  });

  it("non-string content on notion → invalid_payload; fetch NOT called", async () => {
    const { fetchImpl, captured } = makeFakeFetch(200, { id: "x" });
    const performers = buildPerformers({ NOTION_API_KEY: "notion-tok" }, fetchImpl);
    await assert.rejects(
      () =>
        performers["upload_document"](
          {
            tool: "upload_document",
            payload: { destination: "notion", name: "n", parentPageId: "pp-1" },
            meta: {},
          },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof PerformerError);
        assert.ok(err.message.includes("invalid_payload"), `got: ${(err as Error).message}`);
        return true;
      },
    );
    assert.equal(captured.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Task 4.4 — proxy-side token refresh in front of the performers
// ---------------------------------------------------------------------------

describe("token refresh (proxy-side OAuth)", () => {
  const googleExchange = (url: string) => url.startsWith("https://oauth2.googleapis.com/token");
  const msExchange = (url: string) => url.startsWith("https://login.microsoftonline.com/");

  it("send_email with GMAIL_* refresh vars: exchanges once, then Gmail call carries the exchanged bearer; token cached across calls", async () => {
    const { fetchImpl, captured } = makeRoutedFakeFetch([
      { match: googleExchange, status: 200, body: { access_token: "exchanged-gmail-at", expires_in: 3600 } },
      { match: (u) => u.startsWith("https://gmail.googleapis.com/"), status: 200, body: { id: "msg-1" } },
    ]);
    const performers = buildPerformers(
      { GMAIL_CLIENT_ID: "cid", GMAIL_CLIENT_SECRET: "csec-SECRET", GMAIL_REFRESH_TOKEN: "rt-SECRET" },
      fetchImpl,
    );
    const req = {
      tool: "send_email",
      payload: { to: "a@b.com", subject: "s", body: "b" },
      meta: {},
    };

    await performers["send_email"](req, {});
    assert.equal(captured.length, 2, "first call = exchange + gmail send");
    assert.ok(googleExchange(captured[0].url), "first fetch must be the token exchange");
    const exchangeParams = new URLSearchParams(captured[0].body!);
    assert.equal(exchangeParams.get("grant_type"), "refresh_token");
    assert.equal(captured[1].headers["authorization"], "Bearer exchanged-gmail-at");
    // The refresh token / client secret must never reach the vendor API call
    assert.ok(!captured[1].body!.includes("rt-SECRET"));
    assert.ok(!(captured[1].headers["authorization"] ?? "").includes("rt-SECRET"));

    // Second send on the SAME registry → cached token, only the gmail call
    await performers["send_email"](req, {});
    assert.equal(captured.length, 3, "second call must reuse the cached token");
    assert.equal(captured[2].headers["authorization"], "Bearer exchanged-gmail-at");
  });

  it("upload_document gdrive with GDRIVE_* refresh vars: exchange then Drive upload with exchanged bearer", async () => {
    const { fetchImpl, captured } = makeRoutedFakeFetch([
      { match: googleExchange, status: 200, body: { access_token: "exchanged-drive-at", expires_in: 3600 } },
      { match: (u) => u.startsWith("https://www.googleapis.com/upload/drive/"), status: 200, body: { id: "f1" } },
    ]);
    const performers = buildPerformers(
      { GDRIVE_CLIENT_ID: "cid", GDRIVE_CLIENT_SECRET: "csec", GDRIVE_REFRESH_TOKEN: "rt" },
      fetchImpl,
    );
    await performers["upload_document"](
      { tool: "upload_document", payload: { destination: "gdrive", name: "d.txt", content: "c" }, meta: {} },
      {},
    );
    assert.equal(captured.length, 2);
    assert.ok(googleExchange(captured[0].url));
    assert.equal(captured[1].headers["authorization"], "Bearer exchanged-drive-at");
  });

  it("upload_document onedrive with MS_* client-credentials vars: exchange at tenant endpoint then Graph PUT with exchanged bearer", async () => {
    const { fetchImpl, captured } = makeRoutedFakeFetch([
      { match: msExchange, status: 200, body: { access_token: "exchanged-graph-at", expires_in: 3599 } },
      { match: (u) => u.startsWith("https://graph.microsoft.com/"), status: 200, body: { id: "i1", webUrl: "https://od/i1" } },
    ]);
    const performers = buildPerformers(
      { MS_TENANT_ID: "tenant-x", MS_CLIENT_ID: "cid", MS_CLIENT_SECRET: "csec" },
      fetchImpl,
    );
    await performers["upload_document"](
      {
        tool: "upload_document",
        payload: { destination: "onedrive", name: "d.txt", content: "c", driveId: "d1", parentItemId: "p1" },
        meta: {},
      },
      {},
    );
    assert.equal(captured.length, 2);
    assert.ok(captured[0].url.includes("/tenant-x/oauth2/v2.0/token"), `exchange URL must carry the tenant; got ${captured[0].url}`);
    const params = new URLSearchParams(captured[0].body!);
    assert.equal(params.get("grant_type"), "client_credentials");
    assert.equal(params.get("scope"), "https://graph.microsoft.com/.default");
    assert.equal(captured[1].headers["authorization"], "Bearer exchanged-graph-at");
  });

  it("refresh HTTP failure → credential_refresh_failed; the vendor API is never called", async () => {
    const { fetchImpl, captured } = makeRoutedFakeFetch([
      { match: googleExchange, status: 400, body: { error: "invalid_grant" } },
      { match: () => true, status: 200, body: {} },
    ]);
    const performers = buildPerformers(
      { GMAIL_CLIENT_ID: "cid", GMAIL_CLIENT_SECRET: "csec", GMAIL_REFRESH_TOKEN: "rt-SECRET" },
      fetchImpl,
    );
    await assert.rejects(
      () =>
        performers["send_email"](
          { tool: "send_email", payload: { to: "a@b.com", subject: "s", body: "b" }, meta: {} },
          {},
        ),
      (err: unknown) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /credential_refresh_failed/);
        assert.ok(!err.message.includes("rt-SECRET"), "must not leak the refresh token");
        return true;
      },
    );
    assert.equal(captured.length, 1, "only the failed exchange; gmail never called");
  });

  it("static fallback: GMAIL_TOKEN without refresh vars still works with a single fetch (backward compatible)", async () => {
    const { fetchImpl, captured } = makeRoutedFakeFetch([
      { match: (u) => u.startsWith("https://gmail.googleapis.com/"), status: 200, body: { id: "msg-2" } },
    ]);
    const performers = buildPerformers({ GMAIL_TOKEN: "static-tok" }, fetchImpl);
    await performers["send_email"](
      { tool: "send_email", payload: { to: "a@b.com", subject: "s", body: "b" }, meta: {} },
      {},
    );
    assert.equal(captured.length, 1, "no exchange for a static token");
    assert.equal(captured[0].headers["authorization"], "Bearer static-tok");
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

  it("uses collision-safe UUID filenames for action packages created at the same time", async () => {
    const { fetchImpl } = makeFakeFetch(200, {});
    const pkgDir = path.join(tmpDir, "ap-collision-safe");
    const performers = buildPerformers(
      { GATE_ACTION_PACKAGE_DIR: pkgDir },
      fetchImpl,
    );
    const originalDate = Date;
    const fixedTime = "2026-07-15T12:00:00.000Z";

    globalThis.Date = class extends originalDate {
      constructor(value?: string | number | Date) {
        super(value ?? fixedTime);
      }

      static override now(): number {
        return originalDate.parse(fixedTime);
      }
    } as DateConstructor;

    try {
      const request = {
        tool: "sign_document" as const,
        payload: { documentId: "doc-123" },
        meta: { agentId: "agent-1", issueId: "issue-1" },
      };
      const first = await performers.sign_document(request, {});
      const second = await performers.sign_document(request, {});
      const firstPath = first["actionPackage"] as string;
      const secondPath = second["actionPackage"] as string;
      const uuidV4ActionPackage =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-sign_document\.json$/;

      assert.notEqual(firstPath, secondPath, "concurrent packages must never share a path");
      assert.match(path.basename(firstPath), uuidV4ActionPackage);
      assert.match(path.basename(secondPath), uuidV4ActionPackage);
      assert.equal(fs.readdirSync(pkgDir).length, 2, "both packages must remain on disk");
    } finally {
      globalThis.Date = originalDate;
    }
  });
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
