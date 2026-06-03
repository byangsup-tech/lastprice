"""Shared Magic Eden marketplace adapter base.

Collector Crypt and Phygitals are both Solana/Metaplex collections traded via
Magic Eden infrastructure, so they share all listing-fetch logic and differ
only in collection symbol and item-URL format. A new ME-based market is then
just a tiny subclass — the "expand = add one class" goal in practice.

Magic Eden v2 lists prices in SOL; they're converted to USD via :mod:`fx`.
"""
from __future__ import annotations

import os
from typing import List, Optional

from ..fx import to_usd
from ..models import Listing
from ..normalize import parse_card_title
from .base import MarketAdapter
from .http_util import get_json

_DEFAULT_BASE = "https://api-mainnet.magiceden.dev/v2"


class MagicEdenAdapter(MarketAdapter):
    """Base adapter for any Magic Eden Solana collection."""

    name = "magiceden"
    default_symbol = ""
    env_symbol_key = ""  # optional env var overriding the collection symbol

    def __init__(
        self,
        collection_symbol: Optional[str] = None,
        api_base: Optional[str] = None,
        sol_usd: Optional[float] = None,
    ):
        env_symbol = os.environ.get(self.env_symbol_key) if self.env_symbol_key else None
        self.collection = collection_symbol or env_symbol or self.default_symbol
        self.api_base = (api_base or os.environ.get("MAGICEDEN_API_BASE", _DEFAULT_BASE)).rstrip("/")
        self.sol_usd = sol_usd  # None -> resolved lazily by fx

    def item_url(self, mint: str) -> str:
        return f"https://magiceden.io/item-details/{mint}" if mint else ""

    def fetch_listings(self, query: Optional[str] = None, limit: int = 50) -> List[Listing]:
        if not self.collection:
            raise ValueError(f"{self.name}: no collection symbol configured")
        out: List[Listing] = []
        offset = 0
        while len(out) < limit:
            page = min(limit - len(out), 100)
            url = (
                f"{self.api_base}/collections/{self.collection}/listings"
                f"?offset={offset}&limit={page}"
            )
            batch = get_json(url)
            if not batch:
                break
            for item in batch:
                listing = self._to_listing(item)
                if query and query.lower() not in listing.raw_title.lower():
                    continue
                out.append(listing)
            offset += page
            if len(batch) < page:
                break
        return out[:limit]

    def _to_listing(self, item: dict) -> Listing:
        token = item.get("token") or {}
        title = token.get("name") or item.get("name") or ""
        price_sol = float(item.get("price", 0) or 0)
        price_usd = to_usd(price_sol, "SOL", sol_usd=self.sol_usd)
        mint = item.get("tokenMint") or token.get("mintAddress") or ""
        return Listing(
            card_key=parse_card_title(title),
            raw_title=title,
            price_usd=price_usd,
            marketplace=self.name,
            url=self.item_url(mint),
            listing_id=mint,
            extra={"price_sol": price_sol},
        )
