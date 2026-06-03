"""Gacha pools — randomized packs that can yield specific cards.

A :class:`GachaPool` is a pack (e.g. on Collector Crypt) with a flat pull cost
and per-card hit odds. Given a target card we can compute the economics of
pulling for it (expected pulls, expected cost to hit) and compare against
buying it outright. A :class:`GachaSource` supplies pools; expansion to another
platform's gacha = one new source.
"""
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional

from .models import CardKey
from .normalize import parse_card_title


@dataclass
class GachaPool:
    name: str
    marketplace: str
    pull_cost_usd: float
    url: str = ""
    odds: Dict[str, float] = field(default_factory=dict)        # canonical -> probability
    card_keys: Dict[str, CardKey] = field(default_factory=dict)  # canonical -> CardKey

    def probability(self, canonical: str) -> Optional[float]:
        return self.odds.get(canonical)


class GachaSource(ABC):
    @abstractmethod
    def pools(self) -> List[GachaPool]:
        ...


class SampleGachaSource(GachaSource):
    """Loads pools from a JSON file (see examples/sample_gacha.json)."""

    def __init__(self, path: str):
        self.path = path

    def pools(self) -> List[GachaPool]:
        with open(self.path, encoding="utf-8") as f:
            raw = json.load(f)
        out: List[GachaPool] = []
        for p in raw:
            odds, keys = {}, {}
            for c in p.get("cards", []):
                key = parse_card_title(c["title"])
                canon = key.canonical()
                odds[canon] = float(c["odds"])
                keys[canon] = key
            out.append(
                GachaPool(
                    name=p["name"],
                    marketplace=p.get("marketplace", "gacha"),
                    pull_cost_usd=float(p["pull_cost_usd"]),
                    url=p.get("url", ""),
                    odds=odds,
                    card_keys=keys,
                )
            )
        return out
