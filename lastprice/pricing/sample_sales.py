"""Offline sales-history source backed by a JSON file (for ``--demo``).

JSON is a list of: ``{"title", "price_usd", "days_ago", "source"?, "url"?}``.
``days_ago`` is converted to an absolute ISO timestamp at load time so demo
data and static exports never look stale. Titles are normalized with the same
parser as listings so the per-grade canonical keys line up.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List

from ..models import CardKey, SoldComp
from ..normalize import parse_card_title
from ..sources.base import SalesSource


class SampleSalesSource(SalesSource):
    name = "sample_sales"

    def __init__(self, path: str):
        self.path = path
        self._by_key: Dict[str, List[SoldComp]] = {}
        now = datetime.now(timezone.utc)
        with open(path, encoding="utf-8") as f:
            for item in json.load(f):
                key = parse_card_title(item["title"])
                sold_at = (now - timedelta(days=float(item.get("days_ago", 0)))).isoformat()
                self._by_key.setdefault(key.canonical(), []).append(
                    SoldComp(
                        card_key=key,
                        price_usd=float(item["price_usd"]),
                        sold_at=sold_at,
                        source=item.get("source", self.name),
                        url=item.get("url", ""),
                    )
                )
        for comps in self._by_key.values():
            comps.sort(key=lambda c: c.sold_at, reverse=True)  # newest first

    def get_sales(self, card_keys: Iterable[CardKey]) -> Dict[str, List[SoldComp]]:
        wanted = {k.canonical() for k in card_keys}
        return {k: v for k, v in self._by_key.items() if k in wanted}

    def all_sales(self) -> Dict[str, List[SoldComp]]:
        """Everything in the fixture — used when building the full card index."""
        return dict(self._by_key)
