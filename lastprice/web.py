"""Web dashboard for the arbitrage scanner.

Pure-stdlib HTTP server (no web framework) so the package keeps zero runtime
deps and deploys anywhere Python runs.

    python -m lastprice --serve --port 8000           # live dashboard
    python -m lastprice --export-html public/index.html  # static snapshot

Routes: ``GET /`` (HTML), ``GET /api/opportunities`` (JSON), ``GET /healthz``.
"""
from __future__ import annotations

import html
import json
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, List

from .engine import ArbitrageEngine
from .models import Opportunity

_PAGE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>lastprice — card arbitrage</title>
<style>
  :root {{ color-scheme: dark; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#0b0e14; color:#e6e9ef;
    font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
  header {{ padding:28px 24px 8px; max-width:1080px; margin:0 auto; }}
  h1 {{ margin:0; font-size:24px; letter-spacing:-.4px; }}
  h1 .lp {{ color:#5eead4; }}
  .sub {{ color:#8b95a7; margin-top:4px; font-size:13.5px; }}
  .meta {{ display:flex; flex-wrap:wrap; gap:8px; margin:16px 0 4px;
    max-width:1080px; padding:0 24px; }}
  .pill {{ background:#161b26; border:1px solid #232a39; border-radius:999px;
    padding:4px 12px; font-size:12.5px; color:#aab3c5; }}
  .pill b {{ color:#e6e9ef; font-weight:600; }}
  main {{ max-width:1080px; margin:0 auto; padding:8px 24px 48px; }}
  table {{ width:100%; border-collapse:collapse; margin-top:12px; }}
  th,td {{ text-align:left; padding:11px 12px; border-bottom:1px solid #1b2130; }}
  th {{ font-size:11.5px; text-transform:uppercase; letter-spacing:.6px;
    color:#7b8499; font-weight:600; }}
  td.num {{ text-align:right; font-variant-numeric:tabular-nums; }}
  td.card {{ font-weight:600; }}
  .muted {{ color:#8b95a7; }}
  .edge {{ color:#34d399; font-weight:700; }}
  .pct {{ color:#5eead4; }}
  .up {{ color:#34d399; }} .down {{ color:#f87171; }} .flat {{ color:#7b8499; }}
  .market {{ background:#1a2230; border:1px solid #263247; border-radius:6px;
    padding:2px 8px; font-size:12px; color:#9fb0c9; }}
  tr:hover td {{ background:#10151f; }}
  a {{ color:#5eead4; text-decoration:none; font-weight:600; }}
  a:hover {{ text-decoration:underline; }}
  .empty {{ text-align:center; color:#8b95a7; padding:32px; }}
  footer {{ max-width:1080px; margin:0 auto; padding:0 24px 40px;
    color:#5b6475; font-size:12px; }}
</style>
</head>
<body>
<header>
  <h1><span class="lp">last</span>price</h1>
  <div class="sub">Cross-market trading-card arbitrage — underpriced listings vs live market value.</div>
</header>
<div class="meta">
  <span class="pill">mode <b>{mode}</b></span>
  <span class="pill">markets <b>{markets}</b></span>
  <span class="pill">opportunities <b>{count}</b></span>
  <span class="pill">min edge <b>{min_pct:.0f}% / ${min_usd:.0f}</b></span>
  <span class="pill">updated <b>{updated}</b></span>
</div>
<main>
  <table>
    <thead><tr>
      <th>Card</th><th>Market</th><th class="num">List</th><th class="num">Value</th>
      <th class="num">Edge</th><th class="num">%</th><th class="num">24h</th><th></th>
    </tr></thead>
    <tbody>
{rows}
    </tbody>
  </table>
</main>
<footer>
  Prices are estimates from configured sources; verify before buying. Not financial advice.
  Data via marketplace APIs &amp; licensed price feeds.
</footer>
</body>
</html>"""


def _row(o: Opportunity) -> str:
    if o.quote.trend_pct_24h is None:
        trend, cls = "", "flat"
    else:
        t = o.quote.trend_pct_24h
        trend = f"{t:+.0f}%"
        cls = "up" if t > 0 else "down" if t < 0 else "flat"
    link = html.escape(o.listing.url or "#")
    return (
        "      <tr>"
        f'<td class="card">{html.escape(str(o.listing.card_key))}</td>'
        f'<td><span class="market">{html.escape(o.listing.marketplace)}</span></td>'
        f'<td class="num">${o.listing.price_usd:,.0f}</td>'
        f'<td class="num muted">${o.quote.market_price_usd:,.0f}</td>'
        f'<td class="num edge">+${o.spread_usd:,.0f}</td>'
        f'<td class="num pct">{o.spread_pct:.0f}%</td>'
        f'<td class="num {cls}">{trend}</td>'
        f'<td><a href="{link}" target="_blank" rel="noopener">View →</a></td>'
        "</tr>"
    )


def _meta(engine: ArbitrageEngine, count: int) -> Dict[str, str]:
    markets = ", ".join(a.name for a in engine.adapters)
    return {
        "mode": getattr(engine, "mode", "live"),
        "markets": markets,
        "count": str(count),
        "min_pct": engine.min_spread_pct,
        "min_usd": engine.min_spread_usd,
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    }


def render_html(opps: List[Opportunity], engine: ArbitrageEngine) -> str:
    rows = "\n".join(_row(o) for o in opps) or (
        '      <tr><td class="empty" colspan="8">No opportunities above thresholds.</td></tr>'
    )
    m = _meta(engine, len(opps))
    return _PAGE.format(rows=rows, **m)


class _Handler(BaseHTTPRequestHandler):
    engine: ArbitrageEngine = None  # set per-server via subclass

    def _send(self, code: int, body: str, ctype: str) -> None:
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802 (stdlib naming)
        if self.path.startswith("/healthz"):
            return self._send(200, "ok", "text/plain; charset=utf-8")
        opps = self.engine.scan()
        if self.path.startswith("/api/opportunities"):
            payload = json.dumps([o.to_dict() for o in opps], indent=2)
            return self._send(200, payload, "application/json; charset=utf-8")
        return self._send(200, render_html(opps, self.engine), "text/html; charset=utf-8")

    def log_message(self, *args):  # keep stdout clean
        return


def serve(engine: ArbitrageEngine, host: str = "0.0.0.0", port: int = 8000) -> None:
    handler = type("BoundHandler", (_Handler,), {"engine": engine})
    httpd = ThreadingHTTPServer((host, port), handler)
    print(f"lastprice dashboard → http://{host}:{port}  (Ctrl-C to stop)")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.shutdown()


def export_html(engine: ArbitrageEngine, path: str) -> int:
    import os

    opps = engine.scan()
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(render_html(opps, engine))
    return len(opps)
