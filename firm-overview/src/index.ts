// ---------------------------------------------------------------------------
// index.ts — Firm Overview entrypoint.
//
// Reads env, wires the paperclip client factory, and starts the dashboard
// server. SECURITY: binds to 127.0.0.1 ONLY — this is a loopback-only
// operator dashboard, never intended to be reachable over the network.
// ---------------------------------------------------------------------------

import { PaperclipClient } from "./paperclip.ts";
import { createOverviewServer } from "./server.ts";

const PORT = parseInt(process.env["FIRM_OVERVIEW_PORT"] ?? "3860", 10);

const PAPERCLIP_BASE_URL = process.env["PAPERCLIP_BASE_URL"];
if (!PAPERCLIP_BASE_URL) {
  console.error(
    "firm-overview: PAPERCLIP_BASE_URL is required (e.g. PAPERCLIP_BASE_URL=http://127.0.0.1:3199)",
  );
  process.exit(1);
}

const PAPERCLIP_PUBLIC_URL = process.env["PAPERCLIP_PUBLIC_URL"] ?? PAPERCLIP_BASE_URL;

const server = createOverviewServer({
  client: (token) => new PaperclipClient({ baseUrl: PAPERCLIP_BASE_URL, token }),
  publicUrl: PAPERCLIP_PUBLIC_URL,
});

server.listen(PORT, "127.0.0.1", () => {
  // Safety: never log tokens/secrets — only the port and configured URLs.
  console.log(`[firm-overview] listening on http://127.0.0.1:${PORT} (paperclip=${PAPERCLIP_BASE_URL})`);
});

function shutdown(): void {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
