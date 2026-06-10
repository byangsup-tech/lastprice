"""Currency conversion to USD for marketplace prices.

Magic Eden lists in SOL; Courtyard/OpenSea in ETH/WETH/POL; USDC/USDT ≈ 1 USD.
Each crypto rate is resolved in order:

1. explicit argument
2. ``<SYM>_USD`` environment variable (``SOL_USD``, ``ETH_USD``, ``POL_USD``)
3. a live oracle (``FX_ORACLE_URL_<SYM>`` or default CoinGecko) — cached per run
4. ``<SYM>_USD_FALLBACK`` (defaults below), with a one-time stderr warning

The fallback keeps the tool usable offline, but a wrong rate skews every
comparison, so live mode should pin rates via env or have network access.
"""
from __future__ import annotations

import os
import sys
from typing import Optional

from .sources.http_util import get_json

# symbol -> (coingecko id, fallback USD)
_COINS = {
    "SOL": ("solana", 150.0),
    "ETH": ("ethereum", 3000.0),
    "POL": ("polygon-ecosystem-token", 0.5),
}
_ALIASES = {"WETH": "ETH", "MATIC": "POL", "WPOL": "POL", "WSOL": "SOL"}
_STABLE = {"USD", "USDC", "USDT", "DAI", ""}

_cache: dict = {}
_warned: set = set()


def _fallback(sym: str) -> float:
    default = _COINS[sym][1]
    return float(os.environ.get(f"{sym}_USD_FALLBACK", default) or default)


def _fetch_live(sym: str) -> Optional[float]:
    coin_id = _COINS[sym][0]
    url = os.environ.get(
        f"FX_ORACLE_URL_{sym}",
        os.environ.get(  # legacy name for SOL kept working
            "SOL_USD_ORACLE_URL" if sym == "SOL" else "",
            f"https://api.coingecko.com/api/v3/simple/price?ids={coin_id}&vs_currencies=usd",
        ),
    )
    try:
        data = get_json(url, timeout=8)
        return float(data[coin_id]["usd"])  # CoinGecko shape
    except Exception:
        return None


def get_rate(sym: str, explicit: Optional[float] = None) -> float:
    """Resolve a crypto→USD rate (see module docstring for precedence)."""
    sym = _ALIASES.get(sym, sym)
    if explicit:
        return float(explicit)
    env = os.environ.get(f"{sym}_USD")
    if env:
        return float(env)
    if sym in _cache:
        return _cache[sym]
    live = _fetch_live(sym)
    if live is not None:
        _cache[sym] = live
        return live
    if sym not in _warned:
        print(
            f"[warn] {sym}/USD oracle unreachable; using fallback {_fallback(sym)}. "
            f"Set {sym}_USD for accurate USD comparison.",
            file=sys.stderr,
        )
        _warned.add(sym)
    _cache[sym] = _fallback(sym)
    return _cache[sym]


def get_sol_usd(explicit: Optional[float] = None) -> float:
    return get_rate("SOL", explicit)


def to_usd(amount: float, currency: str, sol_usd: Optional[float] = None) -> float:
    """Convert ``amount`` of ``currency`` to USD."""
    c = _ALIASES.get((currency or "").upper(), (currency or "").upper())
    if c in _STABLE:
        return float(amount)
    if c in _COINS:
        return float(amount) * get_rate(c, sol_usd if c == "SOL" else None)
    return float(amount)  # unknown currency -> pass through unconverted
