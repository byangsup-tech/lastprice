"""PokemonPriceTracker sold-comps source (eBay sold listings).

Live counterpart of :class:`SampleSalesSource`, following the same pattern as
``pokemonpricetracker.py``: ``PPT_API_KEY`` auth, endpoint configurable via
``PPT_API_BASE``, and ALL response-shape assumptions isolated in
``_comps_from_response`` — verify/tweak that one method against the live
schema before relying on it.
"""
from __future__ import annotations

import os
import urllib.parse
from typing import Dict, Iterable, List, Optional

from ..models import CardKey, SoldComp
from ..sources.base import SalesSource
from ..sources.http_util import get_json

_DEFAULT_BASE = "https://www.pokemonpricetracker.com/api/v1"


class PokemonPriceTrackerSalesSource(SalesSource):
    name = "ppt_sales"

    def __init__(self, api_key: Optional[str] = None, api_base: Optional[str] = None):
        self.api_key = api_key or os.environ.get("PPT_API_KEY", "")
        self.api_base = (api_base or os.environ.get("PPT_API_BASE", _DEFAULT_BASE)).rstrip("/")

    def get_sales(self, card_keys: Iterable[CardKey]) -> Dict[str, List[SoldComp]]:
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        result: Dict[str, List[SoldComp]] = {}
        for key in card_keys:
            q = " ".join(x for x in (key.name, key.set_name, key.number) if x)
            grade = f"{key.grader}{key.grade}".strip()
            url = f"{self.api_base}/sales?search={urllib.parse.quote(q)}"
            if grade:
                url += f"&grade={urllib.parse.quote(grade)}"
            try:
                data = get_json(url, headers=headers)
            except Exception:
                continue
            comps = self._comps_from_response(key, data)
            if comps:
                result[key.canonical()] = comps
        return result

    def _comps_from_response(self, key: CardKey, data) -> List[SoldComp]:
        rows = data.get("data") if isinstance(data, dict) else data
        if not rows:
            return []
        comps: List[SoldComp] = []
        for row in rows if isinstance(rows, list) else [rows]:
            price = row.get("price") or row.get("soldPrice") or row.get("sold_price")
            sold_at = row.get("soldAt") or row.get("sold_at") or row.get("date") or ""
            if price is None:
                continue
            comps.append(
                SoldComp(
                    card_key=key,
                    price_usd=float(price),
                    sold_at=str(sold_at),
                    source=row.get("source", "ebay"),
                    url=row.get("url", ""),
                )
            )
        comps.sort(key=lambda c: c.sold_at, reverse=True)
        return comps
