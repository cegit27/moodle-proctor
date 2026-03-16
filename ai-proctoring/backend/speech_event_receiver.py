"""Minimal backend receiver for proctoring speech events.

This server accepts POST requests from the speech monitor and can be replaced
later by a full backend framework.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


LOG_FILE = Path(__file__).resolve().parents[1] / "speech_detection.log"


def configure_logging() -> logging.Logger:
    """Create a logger that writes speech events to speech_detection.log."""
    logger = logging.getLogger("SpeechEventReceiver")
    if logger.handlers:
        return logger

    logger.setLevel(logging.INFO)
    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    return logger


LOGGER = configure_logging()


class SpeechEventHandler(BaseHTTPRequestHandler):
    """Receives speech detection events from the monitoring module."""

    def do_POST(self) -> None:
        if self.path != "/speech-event":
            self.send_error(404, "Endpoint not found")
            return

        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)

        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON payload")
            return

        timestamp = payload.get("timestamp") or datetime.now().isoformat(timespec="seconds")
        transcript = payload.get("transcript", "")
        source = payload.get("source", "unknown")
        event_type = payload.get("event_type", "speech_detected")
        log_message = f"[{timestamp}] source={source} event={event_type} message={transcript}"
        print(log_message)
        LOGGER.warning(log_message)

        response = json.dumps({"status": "received"}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format: str, *args: object) -> None:
        """Suppress default HTTP request logging."""
        return


def run_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    """Run the local backend receiver."""
    server = ThreadingHTTPServer((host, port), SpeechEventHandler)
    print(f"Speech event receiver listening on http://{host}:{port}/speech-event")
    print(f"Logging speech events to {LOG_FILE}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Speech event receiver stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run_server()