// Authenticates gate callers with their own Paperclip agent key. The gate never
// stores or logs the key; it exchanges the key only against /api/agents/me.

export interface AuthenticatedAgent {
  agentId: string;
  companyId: string;
}

export type InboundAuthenticator = (apiKey: string) => Promise<AuthenticatedAgent>;

export type InboundAuthEnvironment =
  | { requireAuth: false }
  | { requireAuth: true; baseUrl: string; companyId: string };

const SAFE_CONTROL_PLANE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SAFE_BEARER_TOKEN = /^[A-Za-z0-9\-._~+/]+=*$/;

function requireOriginUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("GATE_REQUIRE_AUTH=true requires a valid PAPERCLIP_BASE_URL");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== "" ||
    (parsed.pathname !== "" && parsed.pathname !== "/")
  ) {
    throw new Error("GATE_REQUIRE_AUTH=true requires PAPERCLIP_BASE_URL to be an HTTP(S) origin");
  }
  return parsed.origin;
}

export function resolveInboundAuthEnvironment(
  env: Record<string, string | undefined>,
): InboundAuthEnvironment {
  const raw = env["GATE_REQUIRE_AUTH"];
  if (raw === undefined || raw === "false") return { requireAuth: false };
  if (raw !== "true") {
    throw new Error("GATE_REQUIRE_AUTH must be exactly 'true' or 'false' when set");
  }

  const baseUrlRaw = env["PAPERCLIP_BASE_URL"];
  if (baseUrlRaw === undefined || baseUrlRaw === "") {
    throw new Error("GATE_REQUIRE_AUTH=true requires PAPERCLIP_BASE_URL");
  }
  const companyId = env["PAPERCLIP_COMPANY_ID"];
  if (companyId === undefined || !SAFE_CONTROL_PLANE_ID.test(companyId)) {
    throw new Error("GATE_REQUIRE_AUTH=true requires a valid PAPERCLIP_COMPANY_ID");
  }
  return { requireAuth: true, baseUrl: requireOriginUrl(baseUrlRaw), companyId };
}

export function createPaperclipInboundAuthenticator(opts: {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): InboundAuthenticator {
  const baseUrl = requireOriginUrl(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch;

  return async (apiKey: string): Promise<AuthenticatedAgent> => {
    if (
      apiKey.length < 1 ||
      apiKey.length > 4096 ||
      !SAFE_BEARER_TOKEN.test(apiKey)
    ) {
      throw new Error("Paperclip agent authentication rejected");
    }

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/api/agents/me`, {
        method: "GET",
        headers: { authorization: `Bearer ${apiKey}` },
        redirect: "error",
      });
    } catch {
      throw new Error("Paperclip agent authentication unavailable");
    }
    if (!response.ok) {
      throw new Error("Paperclip agent authentication rejected");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("Paperclip agent authentication rejected");
    }
    const agent = body as Record<string, unknown>;
    if (
      typeof agent["id"] !== "string" ||
      !SAFE_CONTROL_PLANE_ID.test(agent["id"] as string) ||
      typeof agent["companyId"] !== "string" ||
      !SAFE_CONTROL_PLANE_ID.test(agent["companyId"] as string)
    ) {
      throw new Error("Paperclip agent authentication rejected");
    }
    return {
      agentId: agent["id"] as string,
      companyId: agent["companyId"] as string,
    };
  };
}
