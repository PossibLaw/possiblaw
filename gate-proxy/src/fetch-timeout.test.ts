import { it } from "node:test";
import assert from "node:assert/strict";
import {
  FetchResponseTooLargeError,
  FetchTimeoutError,
  resolveFetchMaxResponseBytes,
  resolveFetchTimeoutMs,
  withFetchTimeout,
} from "./fetch-timeout.ts";

it("aborts and rejects an outbound fetch that exceeds its deadline", async () => {
  let observedSignal: AbortSignal | undefined;
  const neverSettles = ((_input: RequestInfo | URL, init?: RequestInit) => {
    observedSignal = init?.signal ?? undefined;
    return new Promise<Response>(() => {});
  }) as typeof fetch;

  const timedFetch = withFetchTimeout(neverSettles, 20);
  await assert.rejects(
    timedFetch("https://example.invalid"),
    (err: unknown) => err instanceof FetchTimeoutError,
  );
  assert.equal(observedSignal?.aborted, true);
});

it("clears the deadline after a completed fetch", async () => {
  let observedSignal: AbortSignal | undefined;
  const completes = ((_input: RequestInfo | URL, init?: RequestInit) => {
    observedSignal = init?.signal ?? undefined;
    return Promise.resolve(new Response("ok"));
  }) as typeof fetch;

  const timedFetch = withFetchTimeout(completes, 20);
  assert.equal((await timedFetch("https://example.invalid")).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(observedSignal?.aborted, false);
});

it("keeps the deadline active until the response body is fully consumed", async () => {
  const headersThenStall = (async () => new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"partial":'));
    },
  }))) as typeof fetch;

  await assert.rejects(
    withFetchTimeout(headersThenStall, 20)("https://example.invalid"),
    (err: unknown) => err instanceof FetchTimeoutError,
  );
});

it("buffers successful response bodies and rejects responses above the byte cap", async () => {
  const small = (async () => new Response('{"ok":true}', {
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
  const buffered = await withFetchTimeout(small, 1_000, 1024)("https://example.invalid");
  assert.deepEqual(await buffered.json(), { ok: true });

  await assert.rejects(
    withFetchTimeout(small, 1_000, 4)("https://example.invalid"),
    (err: unknown) => err instanceof FetchResponseTooLargeError,
  );
});

it("rejects immediately when the caller signal is already aborted", async () => {
  const ignoresAbort = (() => new Promise<Response>(() => {})) as typeof fetch;
  const caller = new AbortController();
  caller.abort();
  const started = Date.now();
  await assert.rejects(
    withFetchTimeout(ignoresAbort, 1_000)("https://example.invalid", {
      signal: caller.signal,
    }),
    /outbound_request_aborted/,
  );
  assert.ok(Date.now() - started < 100);
});

it("uses a bounded default and rejects unsafe timeout configuration", () => {
  assert.equal(resolveFetchTimeoutMs({}), 15_000);
  assert.equal(resolveFetchTimeoutMs({ GATE_FETCH_TIMEOUT_MS: "2500" }), 2_500);
  for (const value of ["0", "999", "120001", "1.5", "nope"]) {
    assert.throws(
      () => resolveFetchTimeoutMs({ GATE_FETCH_TIMEOUT_MS: value }),
      /GATE_FETCH_TIMEOUT_MS/,
    );
  }

  assert.equal(resolveFetchMaxResponseBytes({}), 10 * 1024 * 1024);
  assert.equal(
    resolveFetchMaxResponseBytes({ GATE_FETCH_MAX_RESPONSE_BYTES: "2048" }),
    2_048,
  );
  for (const value of ["0", "1023", String(50 * 1024 * 1024 + 1), "1.5", "nope"]) {
    assert.throws(
      () => resolveFetchMaxResponseBytes({ GATE_FETCH_MAX_RESPONSE_BYTES: value }),
      /GATE_FETCH_MAX_RESPONSE_BYTES/,
    );
  }
});
