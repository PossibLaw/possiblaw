// ---------------------------------------------------------------------------
// token-provider.ts — Task 4.4: proxy-side OAuth token refresh.
//
// Static env tokens (GDRIVE_ACCESS_TOKEN / GMAIL_TOKEN / MS_GRAPH_TOKEN) are
// delegated user tokens that typically die in ~1 hour. This module puts a
// token-provider layer in front of the performers:
//
//   - Google (Drive + Gmail): refresh-token grant against
//     https://oauth2.googleapis.com/token. Configure *_CLIENT_ID,
//     *_CLIENT_SECRET and *_REFRESH_TOKEN (GDRIVE_* / GMAIL_* prefixes share
//     this exchange code but keep separate env vars and separate caches).
//   - Microsoft (OneDrive via Graph): client-credentials grant against
//     https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token with scope
//     https://graph.microsoft.com/.default. NOTE: client-credentials means
//     APPLICATION permissions — the operator must grant admin consent to the
//     app registration (Files.ReadWrite.All at the application level), and
//     the target drive is addressed by an explicit driveId in the payload.
//     Device-code flow (interactive, delegated) is deliberately NOT attempted
//     in the proxy — it requires a human at the console and is out of scope.
//
// SECURITY INVARIANTS:
//   - Access tokens, refresh tokens, and client secrets are NEVER logged,
//     never receipted, and never included in error messages (errors carry
//     vendor + HTTP status only).
//   - The cache is in-memory only; nothing is persisted to disk.
//   - Failures are never cached; the next call retries the exchange.
//   - A response without a usable expires_in yields a token that is used but
//     NOT cached (fail-closed TTL: re-exchange every call rather than serve a
//     token of unknown freshness).
// ---------------------------------------------------------------------------

/** Refresh this many ms BEFORE the vendor-reported expiry. */
const REFRESH_SKEW_MS = 60_000;

/**
 * Structured refresh failure. Surfaced by the egress pipeline as a 502 + error
 * receipt (performAndReceipt catches any Error and receipts err.message).
 * The message carries vendor + status only — never token or secret values.
 */
export class TokenRefreshError extends Error {
  constructor(vendor: string, detail: string) {
    super(`credential_refresh_failed: ${vendor} ${detail}`);
    this.name = "TokenRefreshError";
  }
}

export interface TokenProvider {
  /** Return a currently-valid bearer token, refreshing if needed. */
  getToken(): Promise<string>;
}

/** Injection points for tests: fake fetch + fake clock. */
export interface TokenProviderOptions {
  fetchImpl?: typeof fetch;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Static provider (fallback when refresh vars are absent)
// ---------------------------------------------------------------------------

export function makeStaticTokenProvider(token: string): TokenProvider {
  return { getToken: async () => token };
}

// ---------------------------------------------------------------------------
// Shared exchange + cache core
// ---------------------------------------------------------------------------

interface CachedToken {
  token: string;
  /** Epoch ms after which the cached token must not be served. */
  refreshAfterMs: number;
}

/**
 * Build a caching provider around a single form-encoded OAuth token endpoint.
 * Concurrency-safe: parallel getToken calls share one in-flight exchange.
 */
function makeOAuthTokenProvider(
  vendor: string,
  url: string,
  form: Record<string, string>,
  opts: TokenProviderOptions,
): TokenProvider {
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
  const now = opts.now ?? Date.now;

  let cached: CachedToken | null = null;
  let inflight: Promise<string> | null = null;

  async function exchange(): Promise<string> {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(form).toString(),
      });
    } catch {
      // Network-level failure: no status to report; never include err details
      // that could carry request context.
      throw new TokenRefreshError(vendor, "network_error");
    }
    if (!res.ok) {
      throw new TokenRefreshError(vendor, String(res.status));
    }
    let data: Record<string, unknown>;
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      throw new TokenRefreshError(vendor, "malformed_response");
    }
    const token = data["access_token"];
    if (typeof token !== "string" || token.length === 0) {
      throw new TokenRefreshError(vendor, "malformed_response");
    }
    // Fail-closed TTL: cache only when the vendor reports a positive numeric
    // expires_in; otherwise serve the token once and re-exchange next call.
    const expiresIn = data["expires_in"];
    if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
      cached = { token, refreshAfterMs: now() + expiresIn * 1000 - REFRESH_SKEW_MS };
    } else {
      cached = null;
    }
    return token;
  }

  return {
    async getToken(): Promise<string> {
      if (cached !== null && now() < cached.refreshAfterMs) {
        return cached.token;
      }
      if (inflight === null) {
        inflight = exchange().finally(() => {
          inflight = null;
        });
      }
      return inflight;
    },
  };
}

// ---------------------------------------------------------------------------
// Google (Drive + Gmail): refresh-token grant
// ---------------------------------------------------------------------------

export interface GoogleTokenConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function makeGoogleTokenProvider(
  cfg: GoogleTokenConfig,
  opts: TokenProviderOptions = {},
): TokenProvider {
  return makeOAuthTokenProvider(
    "google",
    "https://oauth2.googleapis.com/token",
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: "refresh_token",
    },
    opts,
  );
}

// ---------------------------------------------------------------------------
// Microsoft (Graph): client-credentials grant
// ---------------------------------------------------------------------------

export interface MicrosoftTokenConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

export function makeMicrosoftTokenProvider(
  cfg: MicrosoftTokenConfig,
  opts: TokenProviderOptions = {},
): TokenProvider {
  // encodeURIComponent: tenantId is operator-supplied env, but it lands in a
  // URL path segment — encode rather than trust.
  return makeOAuthTokenProvider(
    "microsoft",
    `https://login.microsoftonline.com/${encodeURIComponent(cfg.tenantId)}/oauth2/v2.0/token`,
    {
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    },
    opts,
  );
}

// ---------------------------------------------------------------------------
// Env-driven selection (used by buildPerformers)
// ---------------------------------------------------------------------------

/**
 * Selection order (per the Task 4.4 contract):
 *   1. all refresh vars present → refreshing provider;
 *   2. static token present → static provider (legacy behavior, unchanged);
 *   3. neither → null (performer throws credential_missing at call time).
 */
export function makeGoogleTokenProviderFromEnv(
  env: { clientId?: string; clientSecret?: string; refreshToken?: string; staticToken?: string },
  opts: TokenProviderOptions = {},
): TokenProvider | null {
  if (env.clientId && env.clientSecret && env.refreshToken) {
    return makeGoogleTokenProvider(
      { clientId: env.clientId, clientSecret: env.clientSecret, refreshToken: env.refreshToken },
      opts,
    );
  }
  if (env.staticToken) {
    return makeStaticTokenProvider(env.staticToken);
  }
  return null;
}

export function makeMicrosoftTokenProviderFromEnv(
  env: { tenantId?: string; clientId?: string; clientSecret?: string; staticToken?: string },
  opts: TokenProviderOptions = {},
): TokenProvider | null {
  if (env.tenantId && env.clientId && env.clientSecret) {
    return makeMicrosoftTokenProvider(
      { tenantId: env.tenantId, clientId: env.clientId, clientSecret: env.clientSecret },
      opts,
    );
  }
  if (env.staticToken) {
    return makeStaticTokenProvider(env.staticToken);
  }
  return null;
}
