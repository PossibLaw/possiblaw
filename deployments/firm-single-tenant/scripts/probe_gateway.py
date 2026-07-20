#!/usr/bin/env python3
"""Fail-closed AI gateway placeholder used only for topology attestation."""

from __future__ import annotations

import hmac
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


def _response(handler: BaseHTTPRequestHandler, status: int, document: dict[str, object]) -> None:
    payload = json.dumps(document, sort_keys=True, separators=(",", ":")).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(payload)))
    handler.end_headers()
    handler.wfile.write(payload)


class Handler(BaseHTTPRequestHandler):
    server_version = "PossibLawBlockedGateway/1"

    def log_message(self, _format: str, *_args: object) -> None:
        return

    def _authorized(self) -> bool:
        if os.environ.get("AI_GATEWAY_ALLOW_UNAUTHENTICATED_HEALTH") == "true":
            return True
        key_path = os.environ.get("AI_GATEWAY_API_KEY_FILE", "")
        try:
            expected = Path(key_path).read_text(encoding="utf-8").strip()
        except OSError:
            return False
        supplied = self.headers.get("Authorization", "")
        return bool(expected) and hmac.compare_digest(supplied, f"Bearer {expected}")

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        if self.path != "/health":
            _response(self, 404, {"error": "not_found"})
            return
        if not self._authorized():
            _response(self, 401, {"error": "unauthorized"})
            return
        _response(self, 200, {"mode": "blocked", "ok": True})

    def do_POST(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler contract
        _response(self, 503, {"error": "production_ai_gateway_not_configured"})


def main() -> None:
    port = int(os.environ.get("AI_GATEWAY_PORT", "4000"))
    if port < 1024 or port > 65535:
        raise SystemExit("AI_GATEWAY_PORT must be an unprivileged TCP port")
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
