"""Connectivity / configuration self-check for live mode.

``python -m lastprice --check`` verifies whether the live data sources are
reachable from the current host and whether required credentials are set —
useful because some sandboxes block outbound network on an allowlist, so a
failing live run is environmental, not a code bug.
"""
from __future__ import annotations

import os
import sys
from typing import List, Tuple

from .sources.http_util import get_json

# (label, url) endpoints to ping.
_ENDPOINTS = [
    ("Magic Eden API", "https://api-mainnet.magiceden.dev/v2/collections?offset=0&limit=1"),
    ("SOL/USD oracle", os.environ.get(
        "SOL_USD_ORACLE_URL",
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    )),
    ("PokemonPriceTracker", os.environ.get(
        "PPT_API_BASE", "https://www.pokemonpricetracker.com/api/v1") + "/prices?search=charizard"),
    ("Phygitals API", os.environ.get("PHYGITALS_API_BASE", "https://www.phygitals.com")
        + os.environ.get("PHYGITALS_LISTINGS_PATH", "/api/marketplace/listings") + "?limit=1"),
    ("OpenSea API (Courtyard)", os.environ.get("OPENSEA_API_BASE", "https://api.opensea.io/api/v2")
        + "/listings/collection/"
        + os.environ.get("COURTYARD_COLLECTION_SLUG", "courtyard-nft") + "/all?limit=1"),
]

# (label, env var, required?)
_ENV = [
    ("PPT_API_KEY", "PPT_API_KEY", True),
    ("OPENSEA_API_KEY", "OPENSEA_API_KEY", False),
    ("SOL_USD", "SOL_USD", False),
    ("CC_COLLECTION_SYMBOL", "CC_COLLECTION_SYMBOL", False),
    ("PHYGITALS_API_BASE", "PHYGITALS_API_BASE", False),
]


def run_checks() -> bool:
    """Print a report; return True if all endpoints reachable & required env set."""
    ok_all = True

    print("Network reachability:")
    for label, url in _ENDPOINTS:
        try:
            get_json(url, timeout=8)
            print(f"  [ ok ] {label}")
        except Exception as exc:
            ok_all = False
            detail = str(exc).split("\n")[0][:80]
            print(f"  [FAIL] {label}: {detail}")

    print("\nConfiguration:")
    for label, var, required in _ENV:
        present = bool(os.environ.get(var))
        if present:
            print(f"  [ ok ] {label} set")
        elif required:
            ok_all = False
            print(f"  [FAIL] {label} missing (required for live mode)")
        else:
            print(f"  [ -- ] {label} not set (optional)")

    print("\n" + ("All systems go for live mode." if ok_all
                  else "Live mode will be degraded/blocked here — see failures above."))
    return ok_all


if __name__ == "__main__":
    sys.exit(0 if run_checks() else 1)
