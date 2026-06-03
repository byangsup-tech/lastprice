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
