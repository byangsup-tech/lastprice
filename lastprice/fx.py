"""Currency conversion to USD for marketplace prices.

Magic Eden lists in SOL; USDC/USDT ≈ 1 USD. SOL/USD is resolved in order:

1. explicit argument
2. ``SOL_USD`` environment variable
3. a live oracle (``SOL_USD_ORACLE_URL``, default CoinGecko) — cached per run
4. ``SOL_USD_FALLBACK`` (default 150), with a one-time stderr warning

The fallback keeps the tool usable offline, but a wrong SOL/USD rate skews
every comparison, so live mode should set ``SOL_USD`` or have network access.
"""
from __future__ import annotations

import os
import sys
from typing import Optional

from .sources.http_util import get_json

_DEFAULT_ORACLE = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
_cache: dict = {}
_warned = False


def _fallback() -> float:
    return float(os.environ.get("SOL_USD_FALLBACK", "150") or 150)


def _fetch_live() -> Optional[float]:
    url = os.environ.get("SOL_USD_ORACLE_URL", _DEFAULT_ORACLE)
    try:
        data = get_json(url, timeout=8)
        return float(data["solana"]["usd"])  # CoinGecko shape
    except Exception:
        return None


def get_sol_usd(explicit: Optional[float] = None) -> float:
    """Resolve the SOL→USD rate (see module docstring for precedence)."""
    global _warned
    if explicit:
        return float(explicit)
    env = os.environ.get("SOL_USD")
    if env:
        return float(env)
    if "sol_usd" in _cache:
        return _cache["sol_usd"]
    live = _fetch_live()
    if live is not None:
        _cache["sol_usd"] = live
        return live
    if not _warned:
        print(
            f"[warn] SOL/USD oracle unreachable; using fallback {_fallback()}. "
            "Set SOL_USD for accurate USD comparison.",
            file=sys.stderr,
        )
        _warned = True
    _cache["sol_usd"] = _fallback()
    return _cache["sol_usd"]


def to_usd(amount: float, currency: str, sol_usd: Optional[float] = None) -> float:
    """Convert ``amount`` of ``currency`` to USD."""
    c = (currency or "").upper()
    if c in ("USD", "USDC", "USDT", ""):
        return float(amount)
    if c == "SOL":
        return float(amount) * get_sol_usd(sol_usd)
    return float(amount)  # unknown currency -> pass through unconverted
