// gate-proxy/src/token-provider.test.ts
// Task 4.4 — proxy-side OAuth token refresh in front of the performers.
// All tests use injected fake fetch + fake clock; no real OAuth endpoints.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TokenRefreshError,
  makeStaticTokenProvider,
  makeGoogleTokenProvider,
  makeMicrosoftTokenProvider,
  makeGoogleTokenProviderFromEnv,
  makeMicrosoftTokenProviderFromEnv,
} from "./token-provider.ts";

// ---------------------------------------------------------------------------
// Fake fetch factory (token endpoints)
// ---------------------------------------------------------------------------

interface CapturedTokenRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

function makeTokenFetch(
  responses: Array<{ status: number; body: unknown }>,
): { fetchImpl: typeof fetch; captured: CapturedTokenRequest[] } {
  const captured: CapturedTokenRequest[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (init?.headers) {
      for (const [k, v] of Object.entries(init.headers as Record<string, string>)) {
        headers[k.toLowerCase()] = v;
      }
    }
    captured.push({
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method ?? "GET",
      headers,
      body: typeof init?.body === "string" ? init.body : String(init?.body ?? ""),
    });
    const r = responses[Math.min(captured.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json" },
    });
  };
  return { fetchImpl: fetchImpl as unknown as typeof fetch, captured };
}

const GOOGLE_CFG = { clientId: "gcid", clientSecret: "gsecret-VALUE", refreshToken: "grefresh-VALUE" };
const MS_CFG = { tenantId: "tenant-1", clientId: "mcid", clientSecret: "msecret-VALUE" };

// ---------------------------------------------------------------------------
// Google refresh-token provider
// ---------------------------------------------------------------------------

describe("makeGoogleTokenProvider", () => {
  it("exchanges refresh→access at oauth2.googleapis.com with a form-encoded POST; caches the token", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "at-1", expires_in: 3600 } },
    ]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl });

    const t1 = await provider.getToken();
    assert.equal(t1, "at-1");
    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.url, "https://oauth2.googleapis.com/token");
    assert.equal(req.method, "POST");
    assert.equal(req.headers["content-type"], "application/x-www-form-urlencoded");
    const params = new URLSearchParams(req.body);
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("client_id"), "gcid");
    assert.equal(params.get("client_secret"), "gsecret-VALUE");
    assert.equal(params.get("refresh_token"), "grefresh-VALUE");

    // Second call within the TTL → cached, no new fetch
    const t2 = await provider.getToken();
    assert.equal(t2, "at-1");
    assert.equal(captured.length, 1, "second getToken must be served from cache");
  });

  it("re-exchanges when within 60s of expiry", async () => {
    let nowMs = 1_000_000;
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "at-1", expires_in: 3600 } },
      { status: 200, body: { access_token: "at-2", expires_in: 3600 } },
    ]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl, now: () => nowMs });

    assert.equal(await provider.getToken(), "at-1");
    // 1s before the refresh threshold (expiry - 60s) → still cached
    nowMs += (3600 - 61) * 1000;
    assert.equal(await provider.getToken(), "at-1");
    assert.equal(captured.length, 1);
    // At the threshold → re-exchange
    nowMs += 1000;
    assert.equal(await provider.getToken(), "at-2");
    assert.equal(captured.length, 2);
  });

  it("refresh HTTP failure → TokenRefreshError credential_refresh_failed; no secret values in the message", async () => {
    const { fetchImpl } = makeTokenFetch([{ status: 400, body: { error: "invalid_grant" } }]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl });
    await assert.rejects(
      () => provider.getToken(),
      (err: unknown) => {
        assert.ok(err instanceof TokenRefreshError);
        assert.match(err.message, /credential_refresh_failed/);
        assert.match(err.message, /google/);
        assert.match(err.message, /400/);
        assert.ok(!err.message.includes("gsecret-VALUE"), "must not leak client secret");
        assert.ok(!err.message.includes("grefresh-VALUE"), "must not leak refresh token");
        return true;
      },
    );
  });

  it("failure is not cached — the next call retries the exchange", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 500, body: {} },
      { status: 200, body: { access_token: "at-2", expires_in: 3600 } },
    ]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl });
    await assert.rejects(() => provider.getToken(), TokenRefreshError);
    assert.equal(await provider.getToken(), "at-2");
    assert.equal(captured.length, 2);
  });

  it("malformed response (missing access_token) → credential_refresh_failed", async () => {
    const { fetchImpl } = makeTokenFetch([{ status: 200, body: { expires_in: 3600 } }]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl });
    await assert.rejects(
      () => provider.getToken(),
      (err: unknown) => {
        assert.ok(err instanceof TokenRefreshError);
        assert.match(err.message, /credential_refresh_failed/);
        return true;
      },
    );
  });

  it("missing/invalid expires_in → token used but NOT cached (fail-closed TTL)", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "at-1" } },
      { status: 200, body: { access_token: "at-2" } },
    ]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl });
    assert.equal(await provider.getToken(), "at-1");
    assert.equal(await provider.getToken(), "at-2");
    assert.equal(captured.length, 2, "no expires_in → every call re-exchanges");
  });

  it("concurrent getToken calls share one in-flight exchange", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "at-1", expires_in: 3600 } },
    ]);
    const provider = makeGoogleTokenProvider(GOOGLE_CFG, { fetchImpl });
    const [a, b, c] = await Promise.all([provider.getToken(), provider.getToken(), provider.getToken()]);
    assert.equal(a, "at-1");
    assert.equal(b, "at-1");
    assert.equal(c, "at-1");
    assert.equal(captured.length, 1, "parallel calls must share a single exchange");
  });
});

// ---------------------------------------------------------------------------
// Microsoft client-credentials provider
// ---------------------------------------------------------------------------

describe("makeMicrosoftTokenProvider", () => {
  it("client-credentials grant at login.microsoftonline.com/{tenant} with Graph .default scope; caches", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "ms-at-1", expires_in: 3599 } },
    ]);
    const provider = makeMicrosoftTokenProvider(MS_CFG, { fetchImpl });

    assert.equal(await provider.getToken(), "ms-at-1");
    assert.equal(captured.length, 1);
    const req = captured[0];
    assert.equal(req.url, "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    assert.equal(req.method, "POST");
    const params = new URLSearchParams(req.body);
    assert.equal(params.get("grant_type"), "client_credentials");
    assert.equal(params.get("scope"), "https://graph.microsoft.com/.default");
    assert.equal(params.get("client_id"), "mcid");
    assert.equal(params.get("client_secret"), "msecret-VALUE");

    assert.equal(await provider.getToken(), "ms-at-1");
    assert.equal(captured.length, 1, "second getToken must be served from cache");
  });

  it("refresh failure → TokenRefreshError mentions microsoft + status, never the client secret", async () => {
    const { fetchImpl } = makeTokenFetch([{ status: 401, body: { error: "invalid_client" } }]);
    const provider = makeMicrosoftTokenProvider(MS_CFG, { fetchImpl });
    await assert.rejects(
      () => provider.getToken(),
      (err: unknown) => {
        assert.ok(err instanceof TokenRefreshError);
        assert.match(err.message, /credential_refresh_failed/);
        assert.match(err.message, /microsoft/);
        assert.match(err.message, /401/);
        assert.ok(!err.message.includes("msecret-VALUE"));
        return true;
      },
    );
  });
});

// ---------------------------------------------------------------------------
// Static provider + FromEnv selection
// ---------------------------------------------------------------------------

describe("static provider and FromEnv selection", () => {
  it("makeStaticTokenProvider returns the static token without any fetch", async () => {
    const provider = makeStaticTokenProvider("static-tok");
    assert.equal(await provider.getToken(), "static-tok");
  });

  it("google FromEnv: all three refresh vars present → refresh provider (exchange happens)", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "at-env", expires_in: 3600 } },
    ]);
    const provider = makeGoogleTokenProviderFromEnv(
      { clientId: "id", clientSecret: "sec", refreshToken: "ref", staticToken: "static-tok" },
      { fetchImpl },
    );
    assert.ok(provider !== null);
    assert.equal(await provider.getToken(), "at-env", "refresh vars take precedence over the static token");
    assert.equal(captured.length, 1);
  });

  it("google FromEnv: refresh vars incomplete → static fallback (no fetch)", async () => {
    const { fetchImpl, captured } = makeTokenFetch([{ status: 500, body: {} }]);
    const provider = makeGoogleTokenProviderFromEnv(
      { clientId: "id", refreshToken: "ref", staticToken: "static-tok" }, // no clientSecret
      { fetchImpl },
    );
    assert.ok(provider !== null);
    assert.equal(await provider.getToken(), "static-tok");
    assert.equal(captured.length, 0);
  });

  it("google FromEnv: nothing configured → null", () => {
    assert.equal(makeGoogleTokenProviderFromEnv({}, {}), null);
  });

  it("microsoft FromEnv: tenant+client+secret → client-credentials provider; else static; else null", async () => {
    const { fetchImpl, captured } = makeTokenFetch([
      { status: 200, body: { access_token: "ms-env", expires_in: 3600 } },
    ]);
    const refresh = makeMicrosoftTokenProviderFromEnv(
      { tenantId: "t", clientId: "c", clientSecret: "s", staticToken: "ms-static" },
      { fetchImpl },
    );
    assert.ok(refresh !== null);
    assert.equal(await refresh.getToken(), "ms-env");
    assert.equal(captured.length, 1);

    const stat = makeMicrosoftTokenProviderFromEnv({ tenantId: "t", staticToken: "ms-static" }, {});
    assert.ok(stat !== null);
    assert.equal(await stat.getToken(), "ms-static");

    assert.equal(makeMicrosoftTokenProviderFromEnv({}, {}), null);
  });
});
