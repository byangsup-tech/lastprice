"""Offline price source backed by a JSON file (for ``--demo``).

JSON is a list of: ``{"title", "market_price_usd", "trend_pct_24h"?,
"sample_size"?}``. Titles are normalized with the same parser as listings so
keys line up.
"""
from __future__ import annotations

import json
from typing import Dict, Iterable

from ..models import CardKey, PriceQuote
from ..normalize import parse_card_title
from ..sources.base import PriceSource


class SamplePriceSource(PriceSource):
    name = "sample_prices"

    def __init__(self, path: str):
        self.path = path
        self._by_key: Dict[str, PriceQuote] = {}
        with open(path, encoding="utf-8") as f:
            for item in json.load(f):
                key = parse_card_title(item["title"])
                self._by_key[key.canonical()] = PriceQuote(
                    card_key=key,
                    market_price_usd=float(item["market_price_usd"]),
                    source=self.name,
                    sample_size=int(item.get("sample_size", 0)),
                    trend_pct_24h=item.get("trend_pct_24h"),
                )

    def get_prices(self, card_keys: Iterable[CardKey]) -> Dict[str, PriceQuote]:
        wanted = {k.canonical() for k in card_keys}
        return {k: v for k, v in self._by_key.items() if k in wanted}
