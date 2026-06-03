"""Phygitals marketplace adapter (native Phygitals marketplace).

Phygitals runs its own marketplace at phygitals.com — cards live at
``/card/{slug}`` and span multiple TCGs (Pokémon, Riftbound/LoL, One Piece,
sports). Cards are Solana-vaulted but traded through Phygitals' own zero-gas
marketplace, so this targets a configurable Phygitals API rather than Magic
Eden.

The public API schema isn't documented, so the endpoint is configurable
(``PHYGITALS_API_BASE`` / ``PHYGITALS_LISTINGS_PATH``) and all field mapping is
isolated in :meth:`_to_listing` — adjust that one method once the live response
shape is confirmed. Item URLs are built as ``phygitals.com/card/{slug}``.
"""
from __future__ import annotations

import os
import urllib.parse
from typing import List, Optional

from ..fx import to_usd
from ..models import Listing
from ..normalize import parse_card_title
from .base import MarketAdapter
from .http_util import get_json

_DEFAULT_BASE = "https://www.phygitals.com"
_DEFAULT_LISTINGS_PATH = "/api/marketplace/listings"  # placeholder; verify live


class PhygitalsAdapter(MarketAdapter):
    name = "phygitals"

    def __init__(
        self,
        api_base: Optional[str] = None,
        listings_path: Optional[str] = None,
        sol_usd: Optional[float] = None,
    ):
        self.api_base = (api_base or os.environ.get("PHYGITALS_API_BASE", _DEFAULT_BASE)).rstrip("/")
        self.listings_path = listings_path or os.environ.get(
            "PHYGITALS_LISTINGS_PATH", _DEFAULT_LISTINGS_PATH
        )
        self.sol_usd = sol_usd

    @staticmethod
    def card_url(slug: str) -> str:
        return f"https://www.phygitals.com/card/{slug}" if slug else ""

    def fetch_listings(self, query: Optional[str] = None, limit: int = 50) -> List[Listing]:
        url = f"{self.api_base}{self.listings_path}?limit={limit}"
        if query:
            url += f"&search={urllib.parse.quote(query)}"
        data = get_json(url)
        rows = data
        if isinstance(data, dict):
            rows = data.get("listings") or data.get("data") or data.get("items") or []
        out: List[Listing] = []
        for item in rows or []:
            listing = self._to_listing(item)
            if query and query.lower() not in listing.raw_title.lower():
                continue
            out.append(listing)
        return out[:limit]

    def _to_listing(self, item: dict) -> Listing:
        """Map one Phygitals API row to a Listing. Tweak field names to match
        the live schema; everything market-specific is contained here."""
        title = item.get("name") or item.get("title") or item.get("cardName") or ""
        slug = item.get("slug") or item.get("id") or ""
        raw_price = (
            item.get("priceUsd")
            or item.get("price")
            or item.get("listPrice")
            or 0
        )
        currency = item.get("currency", "USD")
        price_usd = to_usd(float(raw_price or 0), currency, sol_usd=self.sol_usd)
        return Listing(
            card_key=parse_card_title(title),
            raw_title=title,
            price_usd=price_usd,
            marketplace=self.name,
            url=self.card_url(str(slug)),
            listing_id=str(slug),
            extra={"raw_price": raw_price, "currency": currency},
        )
