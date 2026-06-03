"""Core data types shared across adapters, price sources and the engine."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Optional


def _norm_token(s: str) -> str:
    """Lowercase + strip everything but alphanumerics, for stable matching."""
    return "".join(ch for ch in s.lower() if ch.isalnum())


@dataclass(frozen=True)
class CardKey:
    """Canonical identity of a single card.

    Two listings of the same physical card on *different* marketplaces must
    produce the same CardKey so they can be matched against one price quote.
    """

    name: str
    set_name: str = ""
    number: str = ""
    grader: str = ""  # PSA / CGC / BGS / SGC / "" for raw (ungraded)
    grade: str = ""   # "10", "9.5", "" for raw
    game: str = ""    # pokemon / riftbound / one piece / sports / magic / ...

    def canonical(self) -> str:
        """Stable join used as the dictionary key for matching."""
        return "|".join(
            _norm_token(p)
            for p in (self.game, self.name, self.set_name, self.number, self.grader, self.grade)
        )

    def __str__(self) -> str:
        grade = (
            f" {self.grader} {self.grade}".rstrip()
            if (self.grader or self.grade)
            else " (raw)"
        )
        loc = (
            f" [{' '.join(x for x in (self.set_name, self.number) if x)}]"
            if (self.set_name or self.number)
            else ""
        )
        return f"{self.name}{loc}{grade}".strip()


@dataclass
class Listing:
    """A single for-sale listing pulled from a marketplace adapter."""

    card_key: CardKey
    raw_title: str
    price_usd: float
    marketplace: str
    url: str = ""
    listing_id: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PriceQuote:
    """Current market price for a card from a price source."""

    card_key: CardKey
    market_price_usd: float
    source: str
    sample_size: int = 0
    trend_pct_24h: Optional[float] = None
    as_of: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class Opportunity:
    """A listing priced below its market value — an arbitrage candidate."""

    listing: Listing
    quote: PriceQuote
    spread_usd: float
    spread_pct: float

    @property
    def score(self) -> float:
        """Rank by relative edge, nudged up by positive short-term momentum."""
        base = self.spread_pct
        if self.quote.trend_pct_24h:
            base += max(0.0, self.quote.trend_pct_24h) * 0.5
        return base

    def to_dict(self) -> Dict[str, Any]:
        k = self.listing.card_key
        grade_label = f"{k.grader} {k.grade}".strip() if (k.grader or k.grade) else "Raw"
        return {
            "card": str(k),
            "key": k.canonical(),
            "name": k.name,
            "game": k.game or "other",
            "set": k.set_name,
            "number": k.number,
            "grader": k.grader or "Raw",
            "grade_label": grade_label,
            "marketplace": self.listing.marketplace,
            "image": self.listing.extra.get("image", ""),
            "listing_price_usd": round(self.listing.price_usd, 2),
            "market_price_usd": round(self.quote.market_price_usd, 2),
            "spread_usd": round(self.spread_usd, 2),
            "spread_pct": round(self.spread_pct, 1),
            "trend_pct_24h": self.quote.trend_pct_24h,
            "price_source": self.quote.source,
            "url": self.listing.url,
            "score": round(self.score, 1),
        }
