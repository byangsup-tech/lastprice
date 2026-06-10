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

    def base_canonical(self) -> str:
        """Identity without grader/grade — groups all grades of one card.

        The card detail page is keyed by this; each grade row inside it is
        keyed by the full :meth:`canonical`.
        """
        return "|".join(
            _norm_token(p) for p in (self.game, self.name, self.set_name, self.number)
        )

    def grade_label(self) -> str:
        return f"{self.grader} {self.grade}".strip() if (self.grader or self.grade) else "Raw"

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


def grade_sort_key(grader: str, grade: str):
    """Sort key for grade-ladder rows: numeric grade desc, then grader; Raw last."""
    if not (grader or grade):
        return (1, 0.0, "")  # Raw sorts after every graded row
    try:
        num = float(grade)
    except (TypeError, ValueError):
        num = 0.0
    return (0, -num, grader)


@dataclass
class SoldComp:
    """A historical sold transaction (comp) for a specific grade of a card."""

    card_key: CardKey
    price_usd: float
    sold_at: str  # ISO-8601 UTC
    source: str   # "ebay", "collector_crypt", "sample_sales", ...
    url: str = ""
    extra: Dict[str, Any] = field(default_factory=dict)


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
        grade_label = k.grade_label()
        return {
            "card": str(k),
            "key": k.canonical(),
            "base_key": k.base_canonical(),
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
