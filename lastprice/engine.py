"""Arbitrage matching engine — marketplace-agnostic.

Pulls listings from every configured adapter, batches a price lookup per
unique card, and emits listings priced below market beyond the thresholds.
Adding markets means adding adapters; this code is untouched.
"""
from __future__ import annotations

import sys
from typing import Iterable, List, Optional

from .models import Opportunity
from .sources.base import MarketAdapter, PriceSource


class ArbitrageEngine:
    def __init__(
        self,
        adapters: Iterable[MarketAdapter],
        price_source: PriceSource,
        min_spread_pct: float = 10.0,
        min_spread_usd: float = 5.0,
    ):
        self.adapters = list(adapters)
        self.price_source = price_source
        self.min_spread_pct = min_spread_pct
        self.min_spread_usd = min_spread_usd

    def scan(self, query: Optional[str] = None, limit: int = 50) -> List[Opportunity]:
        listings = []
        for adapter in self.adapters:
            try:
                listings.extend(adapter.fetch_listings(query=query, limit=limit))
            except Exception as exc:  # one bad market shouldn't kill the scan
                print(f"[warn] {adapter.name} fetch failed: {exc}", file=sys.stderr)

        unique_keys = {l.card_key.canonical(): l.card_key for l in listings}
        quotes = self.price_source.get_prices(unique_keys.values())

        opportunities: List[Opportunity] = []
        for listing in listings:
            quote = quotes.get(listing.card_key.canonical())
            if not quote or listing.price_usd <= 0 or quote.market_price_usd <= 0:
                continue
            spread = quote.market_price_usd - listing.price_usd
            spread_pct = spread / quote.market_price_usd * 100
            if spread >= self.min_spread_usd and spread_pct >= self.min_spread_pct:
                opportunities.append(Opportunity(listing, quote, spread, spread_pct))

        opportunities.sort(key=lambda o: o.score, reverse=True)
        return opportunities
