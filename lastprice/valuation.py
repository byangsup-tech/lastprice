"""Per-grade value estimation from sold comps.

Honest, transparent method (no ML pretension), surfaced verbatim in the UI as
"Est. value · weighted median of N sales / 180d":

1. keep sales within ``window_days``; take the ``max_n`` most recent
2. weight each sale ``w = 0.5 ** (age_days / half_life_days)`` (recency decay)
3. estimate = weighted median (robust to single outlier sales)
4. low/high band = weighted 25th/75th percentiles

Confidence is purely a function of sample count: >=8 high, 3-7 medium, <3 low.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from .models import SoldComp


def _parse_dt(iso: str) -> Optional[datetime]:
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, AttributeError):
        return None


def _weighted_quantile(pairs: List[tuple], q: float) -> float:
    """``pairs`` = [(price, weight), ...]; returns the weighted q-quantile."""
    pairs = sorted(pairs)
    total = sum(w for _, w in pairs)
    acc = 0.0
    for price, w in pairs:
        acc += w
        if acc >= q * total:
            return price
    return pairs[-1][0]


def estimate_from_comps(
    comps: List[SoldComp],
    *,
    now: Optional[datetime] = None,
    window_days: int = 180,
    max_n: int = 25,
    half_life_days: float = 45.0,
) -> Optional[dict]:
    """Estimate current value from sold comps; ``None`` if no usable sales."""
    now = now or datetime.now(timezone.utc)

    dated = []
    for c in comps:
        dt = _parse_dt(c.sold_at)
        if dt is None:
            continue
        age = (now - dt).total_seconds() / 86400.0
        if 0 <= age <= window_days:
            dated.append((age, c))
    if not dated:
        return None

    dated.sort(key=lambda x: x[0])  # most recent first
    dated = dated[:max_n]

    pairs = [(c.price_usd, 0.5 ** (age / half_life_days)) for age, c in dated]
    n = len(pairs)
    last_age, last = dated[0]

    return {
        "estimate_usd": round(_weighted_quantile(pairs, 0.5), 2),
        "low_usd": round(_weighted_quantile(pairs, 0.25), 2),
        "high_usd": round(_weighted_quantile(pairs, 0.75), 2),
        "n_sales": n,
        "window_days": window_days,
        "last_sold_at": last.sold_at,
        "last_sold_price_usd": round(last.price_usd, 2),
        "last_sold_days_ago": round(last_age, 1),
        "confidence": "high" if n >= 8 else ("medium" if n >= 3 else "low"),
    }
