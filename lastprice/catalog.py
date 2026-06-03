"""Per-card acquisition catalog: where to BUY and where to PULL each card.

Groups every listing by canonical card, attaches the market price, and for each
card lists:
  * direct-buy listings across marketplaces (sorted cheapest first), and
  * gacha pools that can yield it, with pull economics:
      - expected pulls to hit   = 1 / odds
      - expected cost to hit     = pull_cost / odds
      - pack EV (whole pack)     = Σ odds_i · value_i − pull_cost
A recommendation compares the cheapest direct price to the best expected gacha
cost so the UI can say "cheapest path: …".
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from .gacha import GachaPool
from .models import CardKey, Listing, PriceQuote


def _entry(key: CardKey) -> dict:
    grade = f"{key.grader} {key.grade}".strip() if (key.grader or key.grade) else "Raw"
    return {
        "key": key.canonical(),
        "card": str(key),
        "name": key.name,
        "game": key.game or "other",
        "set": key.set_name,
        "number": key.number,
        "grade_label": grade,
        "image": "",
        "market_price": None,
        "listings": [],
        "gacha": [],
    }


def build_catalog(
    listings: Iterable[Listing],
    quotes: Dict[str, PriceQuote],
    pools: Iterable[GachaPool],
) -> List[dict]:
    cards: Dict[str, dict] = {}

    for l in listings:
        canon = l.card_key.canonical()
        e = cards.setdefault(canon, _entry(l.card_key))
        if l.extra.get("image") and not e["image"]:
            e["image"] = l.extra["image"]
        e["listings"].append({
            "marketplace": l.marketplace,
            "price_usd": round(l.price_usd, 2),
            "url": l.url,
        })

    # Cards that only exist in a gacha pool (no direct listing) are still browsable.
    for pool in pools:
        for canon, key in pool.card_keys.items():
            cards.setdefault(canon, _entry(key))

    for canon, e in cards.items():
        q = quotes.get(canon)
        if q:
            e["market_price"] = round(q.market_price_usd, 2)
        e["listings"].sort(key=lambda x: x["price_usd"])

    for pool in pools:
        pack_ev = -pool.pull_cost_usd
        for cc, p in pool.odds.items():
            q = quotes.get(cc)
            if q:
                pack_ev += p * q.market_price_usd
        for canon, p in pool.odds.items():
            if canon not in cards or p <= 0:
                continue
            cards[canon]["gacha"].append({
                "name": pool.name,
                "marketplace": pool.marketplace,
                "pull_cost_usd": round(pool.pull_cost_usd, 2),
                "odds": p,
                "expected_pulls": round(1 / p, 1),
                "expected_cost_usd": round(pool.pull_cost_usd / p, 2),
                "pack_ev_usd": round(pack_ev, 2),
                "url": pool.url,
            })

    for e in cards.values():
        e["gacha"].sort(key=lambda g: g["expected_cost_usd"])
        e["cheapest_direct_usd"] = e["listings"][0]["price_usd"] if e["listings"] else None
        e["best_gacha_cost_usd"] = e["gacha"][0]["expected_cost_usd"] if e["gacha"] else None

    return sorted(cards.values(), key=lambda e: e["name"].lower())


def build_catalog_from_engine(engine) -> List[dict]:
    """Fetch listings/quotes/pools from an engine's sources and build the catalog."""
    listings: List[Listing] = []
    for adapter in engine.adapters:
        try:
            listings.extend(adapter.fetch_listings(limit=200))
        except Exception:
            pass

    keys = {l.card_key.canonical(): l.card_key for l in listings}

    gacha_source = getattr(engine, "gacha_source", None)
    pools = gacha_source.pools() if gacha_source else []
    for pool in pools:
        keys.update(pool.card_keys)

    quotes: Dict[str, PriceQuote] = {}
    try:
        quotes = engine.price_source.get_prices(keys.values())
    except Exception:
        quotes = {}

    return build_catalog(listings, quotes, pools)
