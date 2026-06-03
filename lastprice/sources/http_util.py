"""Tiny stdlib HTTP helper so the package has zero hard dependencies."""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

_UA = "Mozilla/5.0 (lastprice arbitrage scanner)"


def get_json(url: str, headers: Optional[Dict[str, str]] = None, timeout: int = 15) -> Any:
    """GET ``url`` and parse JSON. Raises urllib errors on failure."""
    h = {"User-Agent": _UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post_json(
    url: str,
    payload: Any,
    headers: Optional[Dict[str, str]] = None,
    timeout: int = 15,
) -> tuple[int, str]:
    """POST ``payload`` as JSON. Returns ``(status_code, body)``."""
    data = json.dumps(payload).encode("utf-8")
    h = {"User-Agent": _UA, "Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, data=data, headers=h, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode("utf-8") if resp.length != 0 else ""
        return getattr(resp, "status", resp.getcode()), body
