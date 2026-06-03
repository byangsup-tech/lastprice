"""Collector Crypt marketplace adapter (via the Magic Eden API).

Collector Crypt NFTs are Solana/Metaplex tokens traded through Magic Eden's
marketplace infrastructure, so listings are read from the Magic Eden public
API. Magic Eden prices are denominated in SOL; set ``SOL_USD`` (or pass
``sol_usd``) to convert to USD for apples-to-apples comparison with the price
source. If no rate is given, prices pass through unconverted.

Note: requires outbound network access to api-mainnet.magiceden.dev. In a
locked-down/allowlisted environment use the sample adapter + ``--demo``.
"""
from __future__ import annotations

import os
from typing import List, Optional

from ..models import Listing
from ..normalize import parse_card_title
from .base import MarketAdapter
from .http_util import get_json

_DEFAULT_BASE = "https://api-mainnet.magiceden.dev/v2"


class CollectorCryptAdapter(MarketAdapter):
    name = "collector_crypt"

    def __init__(
        self,
        collection_symbol: Optional[str] = None,
        api_base: Optional[str] = None,
        sol_usd: Optional[float] = None,
    ):
        self.collection = collection_symbol or os.environ.get(
            "CC_COLLECTION_SYMBOL", "collector_crypt"
        )
        self.api_base = (api_base or os.environ.get("MAGICEDEN_API_BASE", _DEFAULT_BASE)).rstrip("/")
        self.sol_usd = sol_usd if sol_usd is not None else float(os.environ.get("SOL_USD", "0") or 0)

    def fetch_listings(self, query: Optional[str] = None, limit: int = 50) -> List[Listing]:
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
        price_usd = price_sol * self.sol_usd if self.sol_usd else price_sol
        mint = item.get("tokenMint") or token.get("mintAddress") or ""
        return Listing(
            card_key=parse_card_title(title),
            raw_title=title,
            price_usd=price_usd,
            marketplace=self.name,
            url=f"https://magiceden.io/item-details/{mint}" if mint else "",
            listing_id=mint,
            extra={"price_sol": price_sol, "sol_usd": self.sol_usd},
        )
