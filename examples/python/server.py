#!/usr/bin/env python3
"""Dependency-free SMSMobileAPI Webhook V2 receiver for local development."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = os.getenv("HOST", "127.0.0.1")
PORT = int(os.getenv("PORT", "8080"))
MAX_CLOCK_SKEW_SECONDS = 300
STORE = Path(__file__).resolve().parents[2] / "var"


class Handler(BaseHTTPRequestHandler):
    server_version = "SMSMobileAPIWebhookExample/1.0"

    def _json(self, status: int, body: dict) -> None:
        encoded = json.dumps(body, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self) -> None:  # noqa: N802
        secret = os.getenv("SMSMOBILEAPI_WEBHOOK_SECRET", "")
        if not secret:
            self._json(500, {"ok": False, "error": "webhook_secret_not_configured"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError("invalid request size")
            raw = self.rfile.read(length)
            timestamp = int(self.headers.get("X-SMSMobileAPI-Timestamp", ""))
        except (TypeError, ValueError):
            self._json(400, {"ok": False, "error": "invalid_request"})
            return

        if abs(int(time.time()) - timestamp) > MAX_CLOCK_SKEW_SECONDS:
            self._json(401, {"ok": False, "error": "invalid_or_stale_timestamp"})
            return

        supplied = self.headers.get("X-SMSMobileAPI-Signature", "")
        digest = hmac.new(secret.encode(), str(timestamp).encode() + b"." + raw, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(f"v1={digest}", supplied):
            self._json(401, {"ok": False, "error": "invalid_signature"})
            return

        try:
            event = json.loads(raw)
            event_id = str(event["id"])
            event_type = str(event["type"])
            if not isinstance(event.get("data"), dict):
                raise ValueError("data must be an object")
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            self._json(400, {"ok": False, "error": "invalid_event_envelope"})
            return

        STORE.mkdir(mode=0o700, parents=True, exist_ok=True)
        safe_id = "".join(character for character in event_id if character.isalnum() or character == "-")
        destination = STORE / f"{safe_id}.json"
        if destination.exists():
            self._json(200, {"ok": True, "duplicate": True})
            return
        destination.write_bytes(raw)

        print(f"accepted {event_type} {event_id}")
        self._json(202, {"ok": True, "accepted": True})

    def log_message(self, message: str, *args: object) -> None:
        print(f"{self.address_string()} - {message % args}")


if __name__ == "__main__":
    print(f"Listening on http://{HOST}:{PORT}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
