"""Courtyard marketplace adapter (Polygon NFTs, via the OpenSea API).

Courtyard tokenizes Brink's-vaulted graded cards as Polygon NFTs; its
collection trades on OpenSea (slug ``courtyard-nft``), so listings are read
from OpenSea API v2 with an ``OPENSEA_API_KEY`` (free tier available).

Like the Phygitals adapter, every response-shape assumption is isolated in
one method (`_to_listing` / `_title_for`) — OpenSea listing payloads may not
carry the human card title inline (metadata join may be needed), so verify
against the live schema before relying on it. Demo mode uses the sample file.

Env: ``OPENSEA_API_KEY``, ``OPENSEA_API_BASE``, ``COURTYARD_COLLECTION_SLUG``.
"""
from __future__ import annotations

import os
from typing import List, Optional

from ..fx import to_usd
from ..models import Listing
from ..normalize import parse_card_title
from .base import MarketAdapter
from .http_util import get_json

_DEFAULT_BASE = "https://api.opensea.io/api/v2"
_DEFAULT_SLUG = "courtyard-nft"
_WEI = 10 ** 18


class CourtyardAdapter(MarketAdapter):
    name = "courtyard"

    def __init__(
        self,
        api_key: Optional[str] = None,
        api_base: Optional[str] = None,
        collection_slug: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("OPENSEA_API_KEY", "")
        self.api_base = (api_base or os.environ.get("OPENSEA_API_BASE", _DEFAULT_BASE)).rstrip("/")
        self.slug = collection_slug or os.environ.get("COURTYARD_COLLECTION_SLUG", _DEFAULT_SLUG)

    def fetch_listings(self, query: Optional[str] = None, limit: int = 50) -> List[Listing]:
        headers = {"X-API-KEY": self.api_key} if self.api_key else {}
        out: List[Listing] = []
        cursor = ""
        while len(out) < limit:
            url = f"{self.api_base}/listings/collection/{self.slug}/all?limit={min(limit, 100)}"
            if cursor:
                url += f"&next={cursor}"
            data = get_json(url, headers=headers)
            batch = data.get("listings", []) if isinstance(data, dict) else []
            if not batch:
                break
            for item in batch:
                listing = self._to_listing(item)
                if listing is None:
                    continue
                if query and query.lower() not in listing.raw_title.lower():
                    continue
                out.append(listing)
            cursor = data.get("next") or ""
            if not cursor:
                break
        return out[:limit]

    def _title_for(self, item: dict) -> str:
        """Best-effort card title from an OpenSea listing payload. OpenSea's
        listing objects may omit NFT metadata; if so a per-token metadata
        fetch would be needed here — verify against the live schema."""
        for path in (
            ("nft", "name"),
            ("asset", "name"),
            ("protocol_data", "parameters", "offer", 0, "name"),
        ):
            cur = item
            try:
                for p in path:
                    cur = cur[p]
                if cur:
                    return str(cur)
            except (KeyError, IndexError, TypeError):
                continue
        return item.get("title") or item.get("name") or ""

    def _to_listing(self, item: dict) -> Optional[Listing]:
        title = self._title_for(item)
        if not title:
            return None

        price_usd, raw_amount, currency = 0.0, 0, ""
        cur = (item.get("price") or {}).get("current") or {}
        if cur:
            currency = cur.get("currency", "ETH")
            decimals = int(cur.get("decimals", 18) or 18)
            raw_amount = float(cur.get("value", 0) or 0)
            price_usd = to_usd(raw_amount / (10 ** decimals), currency)

        contract = token_id = ""
        nft = item.get("nft") or item.get("asset") or {}
        contract = nft.get("contract") or item.get("contract_address", "")
        token_id = str(nft.get("identifier") or item.get("token_id", ""))
        url = (
            f"https://opensea.io/assets/matic/{contract}/{token_id}"
            if contract and token_id
            else item.get("permalink", "")
        )
        return Listing(
            card_key=parse_card_title(title),
            raw_title=title,
            price_usd=price_usd,
            marketplace=self.name,
            url=url,
            listing_id=f"{contract}:{token_id}" if contract else (item.get("order_hash") or ""),
            extra={"raw_amount": raw_amount, "currency": currency,
                   "image": (nft.get("image_url") or "")},
        )
