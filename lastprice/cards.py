"""Card index: one entry per card identity (grade-agnostic), with a grade
ladder inside — the data behind the alt.xyz-style Cards browse and Card detail
pages.

Each base card groups every grade of that card. Each grade row carries its
comp-based value estimate, the licensed quote (cross-check), live listings
across ALL marketplaces (the cross-market comparison), recent sold history,
and gacha pull options. Generalizes the grouping in :mod:`catalog` from full
canonical keys to :meth:`CardKey.base_canonical`.
"""
from __future__ import annotations

from typing import Dict, Iterable, List, Optional

from .gacha import GachaPool
from .models import CardKey, Listing, PriceQuote, SoldComp, grade_sort_key
from .valuation import estimate_from_comps


def _base_entry(key: CardKey) -> dict:
    return {
        "base_key": key.base_canonical(),
        "name": key.name,
        "game": key.game or "other",
        "set": key.set_name,
        "number": key.number,
        "image": "",
        "grades": {},  # full canonical -> grade row (dict until finalized)
    }


def _grade_row(key: CardKey) -> dict:
    return {
        "key": key.canonical(),
        "grade_label": key.grade_label(),
        "grader": key.grader,
        "grade": key.grade,
        "estimate": None,
        "quote_usd": None,
        "listings": [],
        "sales": [],
        "gacha": [],
    }


def build_card_index(
    listings: Iterable[Listing],
    sales: Dict[str, List[SoldComp]],
    quotes: Dict[str, PriceQuote],
    pools: Iterable[GachaPool] = (),
) -> Dict[str, dict]:
    """Return ``{base_key: card entry}`` (see module docstring for shape)."""
    index: Dict[str, dict] = {}

    def grade_for(key: CardKey) -> dict:
        e = index.setdefault(key.base_canonical(), _base_entry(key))
        return e["grades"].setdefault(key.canonical(), _grade_row(key))

    for l in listings:
        row = grade_for(l.card_key)
        row["listings"].append({
            "marketplace": l.marketplace,
            "price_usd": round(l.price_usd, 2),
            "url": l.url,
        })
        e = index[l.card_key.base_canonical()]
        if l.extra.get("image") and not e["image"]:
            e["image"] = l.extra["image"]

    for comps in sales.values():
        if not comps:
            continue
        row = grade_for(comps[0].card_key)
        row["sales"] = [{
            "price_usd": round(c.price_usd, 2),
            "sold_at": c.sold_at,
            "source": c.source,
            "url": c.url,
        } for c in comps]
        row["estimate"] = estimate_from_comps(comps)

    pools = list(pools)
    for pool in pools:
        pack_ev = -pool.pull_cost_usd
        for cc, p in pool.odds.items():
            q = quotes.get(cc)
            if q:
                pack_ev += p * q.market_price_usd
        for canon, p in pool.odds.items():
            if p <= 0:
                continue
            row = grade_for(pool.card_keys[canon])
            row["gacha"].append({
                "name": pool.name,
                "marketplace": pool.marketplace,
                "pull_cost_usd": round(pool.pull_cost_usd, 2),
                "odds": p,
                "expected_pulls": round(1 / p, 1),
                "expected_cost_usd": round(pool.pull_cost_usd / p, 2),
                "pack_ev_usd": round(pack_ev, 2),
                "url": pool.url,
            })

    for e in index.values():
        rows = list(e["grades"].values())
        for row in rows:
            q = quotes.get(row["key"])
            if q:
                row["quote_usd"] = round(q.market_price_usd, 2)
            row["listings"].sort(key=lambda x: x["price_usd"])
            row["sales"].sort(key=lambda s: s["sold_at"], reverse=True)
            row["gacha"].sort(key=lambda g: g["expected_cost_usd"])
            row["lowest_ask_usd"] = row["listings"][0]["price_usd"] if row["listings"] else None
        rows.sort(key=lambda r: grade_sort_key(r["grader"], r["grade"]))
        e["grades"] = rows
        ests = [r["estimate"]["estimate_usd"] for r in rows if r["estimate"]]
        e["best_grade_estimate_usd"] = max(ests) if ests else None
        e["total_listings"] = sum(len(r["listings"]) for r in rows)
        e["total_sales"] = sum(len(r["sales"]) for r in rows)

    return index


def card_summaries(index: Dict[str, dict]) -> List[dict]:
    """Light per-card payload for the Cards browse page (no sold history)."""
    out = []
    for e in index.values():
        out.append({
            "base_key": e["base_key"],
            "name": e["name"],
            "game": e["game"],
            "set": e["set"],
            "number": e["number"],
            "image": e["image"],
            "best_grade_estimate_usd": e["best_grade_estimate_usd"],
            "total_listings": e["total_listings"],
            "total_sales": e["total_sales"],
            "grades": [{
                "grade_label": r["grade_label"],
                "estimate_usd": r["estimate"]["estimate_usd"] if r["estimate"] else None,
                "lowest_ask_usd": r["lowest_ask_usd"],
                "n_listings": len(r["listings"]),
            } for r in e["grades"]],
        })
    out.sort(key=lambda c: (c["best_grade_estimate_usd"] or 0), reverse=True)
    return out


def card_detail(index: Dict[str, dict], base_key: str) -> Optional[dict]:
    return index.get(base_key)


def build_card_index_from_engine(engine) -> Dict[str, dict]:
    """Fetch listings/sales/quotes/pools from an engine's sources and build."""
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

    sales: Dict[str, List[SoldComp]] = {}
    sales_source = getattr(engine, "sales_source", None)
    if sales_source is not None:
        try:
            # Sample sources can enumerate everything (cards with sales but no
            # live listing still deserve a page); API sources answer per-key.
            if hasattr(sales_source, "all_sales"):
                sales = sales_source.all_sales()
            else:
                sales = sales_source.get_sales(keys.values())
        except Exception:
            sales = {}
    for comps in sales.values():
        if comps:
            keys.setdefault(comps[0].card_key.canonical(), comps[0].card_key)

    quotes: Dict[str, PriceQuote] = {}
    try:
        quotes = engine.price_source.get_prices(keys.values())
    except Exception:
        quotes = {}

    return build_card_index(listings, sales, quotes, pools)
