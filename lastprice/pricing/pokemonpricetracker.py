"""PokemonPriceTracker price source (real-time TCGplayer/eBay/CardMarket).

Commercial, licensed price API — the recommended live source instead of
scraping alt.xyz. Set ``PPT_API_KEY`` in the environment. Endpoint/field names
follow their public docs at https://www.pokemonpricetracker.com and may need a
small tweak if their schema changes; the mapping is isolated in
``_quote_from_response`` for that reason.
"""
from __future__ import annotations

import os
import urllib.parse
from typing import Dict, Iterable, Optional

from ..models import CardKey, PriceQuote
from ..sources.base import PriceSource
from ..sources.http_util import get_json

_DEFAULT_BASE = "https://www.pokemonpricetracker.com/api/v1"


class PokemonPriceTrackerSource(PriceSource):
    name = "pokemonpricetracker"

    def __init__(self, api_key: Optional[str] = None, api_base: Optional[str] = None):
        self.api_key = api_key or os.environ.get("PPT_API_KEY", "")
        self.api_base = (api_base or os.environ.get("PPT_API_BASE", _DEFAULT_BASE)).rstrip("/")

    def get_prices(self, card_keys: Iterable[CardKey]) -> Dict[str, PriceQuote]:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        result: Dict[str, PriceQuote] = {}
        for key in card_keys:
            q = " ".join(x for x in (key.name, key.set_name, key.number) if x)
            grade = f"{key.grader}{key.grade}".strip()
            url = f"{self.api_base}/prices?search={urllib.parse.quote(q)}"
            if grade:
                url += f"&grade={urllib.parse.quote(grade)}"
            try:
                data = get_json(url, headers=headers)
            except Exception:
                continue
            quote = self._quote_from_response(key, data)
            if quote:
                result[key.canonical()] = quote
        return result

    def _quote_from_response(self, key: CardKey, data) -> Optional[PriceQuote]:
        rows = data.get("data") if isinstance(data, dict) else data
        if not rows:
            return None
        row = rows[0] if isinstance(rows, list) else rows
        price = (
            row.get("marketPrice")
            or row.get("market_price")
            or row.get("price")
        )
        if price is None:
            return None
        return PriceQuote(
            card_key=key,
            market_price_usd=float(price),
            source=self.name,
            sample_size=int(row.get("sampleSize", 0) or 0),
            trend_pct_24h=row.get("trend24h") or row.get("trend_pct_24h"),
        )
