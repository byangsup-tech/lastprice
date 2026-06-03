"""Offline marketplace adapter backed by a JSON file.

Used by ``--demo`` so the engine runs end-to-end with zero network access.
The JSON is a list of objects: ``{"title", "price_usd", "marketplace"?,
"url"?, "id"?}``.
"""
from __future__ import annotations

import json
from typing import List, Optional

from ..models import Listing
from ..normalize import parse_card_title
from .base import MarketAdapter


class SampleMarketAdapter(MarketAdapter):
    def __init__(self, path: str, name: str = "sample_market"):
        self.path = path
        self.name = name

    def fetch_listings(self, query: Optional[str] = None, limit: int = 50) -> List[Listing]:
        with open(self.path, encoding="utf-8") as f:
            raw = json.load(f)
        out: List[Listing] = []
        for item in raw:
            title = item["title"]
            if query and query.lower() not in title.lower():
                continue
            out.append(
                Listing(
                    card_key=parse_card_title(title),
                    raw_title=title,
                    price_usd=float(item["price_usd"]),
                    marketplace=item.get("marketplace", self.name),
                    url=item.get("url", ""),
                    listing_id=str(item.get("id", "")),
                )
            )
        return out[:limit]
