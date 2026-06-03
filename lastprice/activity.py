"""Activity feed — diffs successive scans into a stream of events.

When the dashboard is *served*, the server records each scan and emits real
events as listings appear, change price, or disappear. (In a single-snapshot
context like the static export there's nothing to diff, so the UI synthesizes
an illustrative feed client-side instead.)
"""
from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
from typing import Deque, Dict, List

from .models import Opportunity


def _key(o: Opportunity) -> str:
    return o.listing.listing_id or o.listing.card_key.canonical()


class ActivityTracker:
    """Holds the previous scan and the recent event log."""

    def __init__(self, max_events: int = 200):
        self._prev: Dict[str, Opportunity] = {}
        self._seeded = False
        self.events: Deque[dict] = deque(maxlen=max_events)

    def _event(self, etype: str, o: Opportunity, prev_price: float | None = None) -> dict:
        return {
            "type": etype,
            "card": str(o.listing.card_key),
            "key": o.listing.card_key.canonical(),
            "game": o.listing.card_key.game or "other",
            "marketplace": o.listing.marketplace,
            "price_usd": round(o.listing.price_usd, 2),
            "prev_price_usd": round(prev_price, 2) if prev_price is not None else None,
            "spread_pct": round(o.spread_pct, 1),
            "url": o.listing.url,
            "at": datetime.now(timezone.utc).isoformat(),
        }

    def record(self, opps: List[Opportunity]) -> None:
        cur = {_key(o): o for o in opps}
        # First scan establishes a baseline without flooding the feed.
        if not self._seeded:
            self._prev = cur
            self._seeded = True
            return
        for k, o in cur.items():
            if k not in self._prev:
                self.events.appendleft(self._event("new", o))
            else:
                old = self._prev[k].listing.price_usd
                if round(old) != round(o.listing.price_usd):
                    etype = "price_down" if o.listing.price_usd < old else "price_up"
                    self.events.appendleft(self._event(etype, o, prev_price=old))
        for k, o in self._prev.items():
            if k not in cur:
                self.events.appendleft(self._event("removed", o))
        self._prev = cur

    def feed(self) -> List[dict]:
        return list(self.events)
