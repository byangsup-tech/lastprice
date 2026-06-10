"""Pure-stdlib HTTP server with a short-lived snapshot cache.

Each request used to re-scan every adapter; with the new Cards/Portfolio
endpoints that would hammer live APIs. A per-server :class:`Snapshot` caches
the opportunities + card index for ``LASTPRICE_CACHE_TTL`` seconds (default 60);
demo mode (local file reads) is unaffected.
"""
from __future__ import annotations

import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Optional
from urllib.parse import unquote

from ..activity import ActivityTracker
from ..cards import build_card_index_from_engine, card_detail, card_summaries
from ..catalog import build_catalog_from_engine
from .render import payload, render_html


class Snapshot:
    """Caches the expensive per-request builds for a short TTL."""

    def __init__(self, engine, tracker: ActivityTracker, ttl: float):
        self.engine = engine
        self.tracker = tracker
        self.ttl = ttl
        self._built_at = 0.0
        self._opps = []
        self._index = {}
        self._catalog = []

    def _rebuild(self) -> None:
        self._opps = self.engine.scan()
        if self.tracker:
            self.tracker.record(self._opps)
        try:
            self._index = build_card_index_from_engine(self.engine)
        except Exception:
            self._index = {}
        try:
            self._catalog = build_catalog_from_engine(self.engine)
        except Exception:
            self._catalog = []
        self._built_at = time.time()

    def get(self):
        if time.time() - self._built_at > self.ttl:
            self._rebuild()
        return self._opps, self._index, self._catalog


class _Handler(BaseHTTPRequestHandler):
    engine = None          # set per-server via subclass
    tracker = None
    snapshot: Snapshot = None
    portfolio = None       # Portfolio instance or None

    # ---- helpers -------------------------------------------------------
    def _send(self, code: int, body: str, ctype: str) -> None:
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def _json(self, obj, code: int = 200) -> None:
        self._send(code, json.dumps(obj, indent=2), "application/json; charset=utf-8")

    def _portfolio_value(self, index) -> Optional[dict]:
        return self.portfolio.valued(index) if self.portfolio else None

    # ---- routes --------------------------------------------------------
    def do_GET(self):  # noqa: N802 (stdlib naming)
        path = self.path.split("?")[0]
        if path == "/healthz":
            return self._send(200, "ok", "text/plain; charset=utf-8")
        if path == "/api/activity":
            return self._json(self.tracker.feed() if self.tracker else [])

        opps, index, catalog = self.snapshot.get()

        if path == "/api/opportunities":
            return self._json(payload(opps))
        if path == "/api/catalog":
            return self._json(catalog)
        if path == "/api/cards":
            return self._json(card_summaries(index))
        if path.startswith("/api/card/"):
            key = unquote(path[len("/api/card/"):])
            detail = card_detail(index, key)
            return self._json(detail) if detail else self._json({"error": "not found"}, 404)
        if path == "/api/portfolio":
            return self._json(self._portfolio_value(index) or {"holdings": [], "total_value_usd": 0})

        return self._send(200, render_html(opps, self.engine, self._portfolio_value(index)),
                          "text/html; charset=utf-8")

    def do_POST(self):  # noqa: N802
        path = self.path.split("?")[0]
        if path != "/api/portfolio" or not self.portfolio:
            return self._json({"error": "unsupported"}, 404)
        length = int(self.headers.get("Content-Length", 0) or 0)
        try:
            body = json.loads(self.rfile.read(length).decode("utf-8")) if length else {}
        except Exception:
            return self._json({"error": "bad json"}, 400)
        action = body.get("action")
        if action == "add":
            self.portfolio.add(
                title=body.get("title", ""),
                grader=body.get("grader", ""),
                grade=body.get("grade", ""),
                qty=body.get("qty", 1),
                cost_basis_usd=body.get("cost_basis"),
            )
        elif action == "remove":
            self.portfolio.remove(body.get("id", ""))
        else:
            return self._json({"error": "unknown action"}, 400)
        _, index, _ = self.snapshot.get()
        return self._json(self.portfolio.valued(index))

    def log_message(self, *args):  # keep stdout clean
        return


def serve(engine, host: str = "0.0.0.0", port: int = 8000, portfolio=None) -> None:
    ttl = float(os.environ.get("LASTPRICE_CACHE_TTL", "60") or 60)
    tracker = ActivityTracker()
    snapshot = Snapshot(engine, tracker, ttl)
    handler = type("BoundHandler", (_Handler,), {
        "engine": engine, "tracker": tracker, "snapshot": snapshot, "portfolio": portfolio,
    })
    httpd = ThreadingHTTPServer((host, port), handler)
    print(f"lastprice dashboard → http://{host}:{port}  (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


def export_html(engine, path: str) -> int:
    opps = engine.scan()
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(render_html(opps, engine))
    return len(opps)
