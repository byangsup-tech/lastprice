"""Pluggable interfaces. Adding a marketplace or price feed = one new class.

    class MyMarket(MarketAdapter):
        name = "mymarket"
        def fetch_listings(self, query=None, limit=50): ...

The engine consumes any object satisfying these ABCs, so expansion to other
markets never touches the matching/arbitrage logic.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, Iterable, List, Optional

from ..models import CardKey, Listing, PriceQuote, SoldComp


class MarketAdapter(ABC):
    """A marketplace we can read for-sale listings from."""

    name: str = "market"

    @abstractmethod
    def fetch_listings(self, query: Optional[str] = None, limit: int = 50) -> List[Listing]:
        ...


class PriceSource(ABC):
    """A source of current market prices for cards."""

    name: str = "price"

    @abstractmethod
    def get_prices(self, card_keys: Iterable[CardKey]) -> Dict[str, PriceQuote]:
        """Return ``{CardKey.canonical(): PriceQuote}`` for keys it can price."""
        ...


class SalesSource(ABC):
    """A source of historical sold transactions (comps)."""

    name: str = "sales"

    @abstractmethod
    def get_sales(self, card_keys: Iterable[CardKey]) -> Dict[str, List[SoldComp]]:
        """Return ``{CardKey.canonical(): [SoldComp, ...]}`` — per-grade keys."""
        ...
