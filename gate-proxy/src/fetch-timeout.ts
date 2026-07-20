const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
const MIN_FETCH_TIMEOUT_MS = 1_000;
const MAX_FETCH_TIMEOUT_MS = 120_000;
const DEFAULT_FETCH_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const MIN_FETCH_MAX_RESPONSE_BYTES = 1024;
const MAX_FETCH_MAX_RESPONSE_BYTES = 50 * 1024 * 1024;

export class FetchTimeoutError extends Error {
  constructor() {
    super("outbound_request_timeout");
    this.name = "FetchTimeoutError";
  }
}

export class FetchResponseTooLargeError extends Error {
  constructor() {
    super("outbound_response_too_large");
    this.name = "FetchResponseTooLargeError";
  }
}

export function resolveFetchTimeoutMs(
  env: Record<string, string | undefined>,
): number {
  const raw = env["GATE_FETCH_TIMEOUT_MS"];
  if (raw === undefined) return DEFAULT_FETCH_TIMEOUT_MS;
  if (!/^\d+$/.test(raw)) {
    throw new Error("GATE_FETCH_TIMEOUT_MS must be an integer");
  }
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_FETCH_TIMEOUT_MS ||
    value > MAX_FETCH_TIMEOUT_MS
  ) {
    throw new Error(
      `GATE_FETCH_TIMEOUT_MS must be between ${MIN_FETCH_TIMEOUT_MS} and ${MAX_FETCH_TIMEOUT_MS}`,
    );
  }
  return value;
}

export function resolveFetchMaxResponseBytes(
  env: Record<string, string | undefined>,
): number {
  const raw = env["GATE_FETCH_MAX_RESPONSE_BYTES"];
  if (raw === undefined) return DEFAULT_FETCH_MAX_RESPONSE_BYTES;
  if (!/^\d+$/.test(raw)) {
    throw new Error("GATE_FETCH_MAX_RESPONSE_BYTES must be an integer");
  }
  const value = Number(raw);
  if (
    !Number.isSafeInteger(value) ||
    value < MIN_FETCH_MAX_RESPONSE_BYTES ||
    value > MAX_FETCH_MAX_RESPONSE_BYTES
  ) {
    throw new Error(
      `GATE_FETCH_MAX_RESPONSE_BYTES must be between ${MIN_FETCH_MAX_RESPONSE_BYTES} and ${MAX_FETCH_MAX_RESPONSE_BYTES}`,
    );
  }
  return value;
}

async function bufferResponse(
  response: Response,
  abortPromise: Promise<never>,
  maxResponseBytes: number,
  abort: () => void,
): Promise<Response> {
  if (response.body === null) return response;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await Promise.race([reader.read(), abortPromise]);
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxResponseBytes) {
        abort();
        throw new FetchResponseTooLargeError();
      }
      chunks.push(next.value);
    }
  } catch (err) {
    void reader.cancel().catch(() => undefined);
    throw err;
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Response(total === 0 ? null : body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

/**
 * Wrap every control-plane, model, OAuth, and vendor request made by the gate
 * in one bounded deadline. Aborting the controller stops native fetch I/O;
 * racing an explicit rejection also bounds injected/test fetch functions that
 * do not implement AbortSignal themselves.
 */
export function withFetchTimeout(
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxResponseBytes = DEFAULT_FETCH_MAX_RESPONSE_BYTES,
): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const callerSignal = init?.signal;
    let timeoutTriggered = false;

    const relayCallerAbort = (): void => {
      controller.abort();
    };

    let rejectAbort!: (reason: Error) => void;
    const abortPromise = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const rejectOnAbort = (): void => {
      rejectAbort(
        timeoutTriggered
          ? new FetchTimeoutError()
          : new Error("outbound_request_aborted"),
      );
    };
    controller.signal.addEventListener("abort", rejectOnAbort, { once: true });

    if (callerSignal?.aborted) {
      controller.abort();
    } else {
      callerSignal?.addEventListener("abort", relayCallerAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timeoutTriggered = true;
      controller.abort();
    }, timeoutMs);
    timer.unref();

    try {
      const response = await Promise.race([
        fetchImpl(input, { ...init, signal: controller.signal }),
        abortPromise,
      ]);
      return await bufferResponse(
        response,
        abortPromise,
        maxResponseBytes,
        () => controller.abort(),
      );
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", relayCallerAbort);
      controller.signal.removeEventListener("abort", rejectOnAbort);
    }
  }) as typeof fetch;
}
