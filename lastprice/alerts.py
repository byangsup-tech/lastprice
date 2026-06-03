"""Alerting for arbitrage opportunities.

A :class:`Notifier` delivers opportunities somewhere (console, Discord webhook,
…). :class:`AlertDispatcher` wraps a notifier with persistent de-duplication so
the same listing at the same price isn't alerted twice across runs — important
when this is run on a schedule.

Add a channel = implement one ``Notifier.send``. Slack/Telegram/email all fit.
"""
from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Iterable, List, Optional, Set

from .models import Opportunity
from .sources.http_util import post_json


def signature(opp: Opportunity) -> str:
    """Stable identity for de-dup: market + listing + rounded price."""
    return f"{opp.listing.marketplace}:{opp.listing.listing_id}:{round(opp.listing.price_usd)}"


def format_line(opp: Opportunity) -> str:
    trend = f" ({opp.quote.trend_pct_24h:+.0f}% 24h)" if opp.quote.trend_pct_24h is not None else ""
    return (
        f"{opp.listing.card_key} on {opp.listing.marketplace}: "
        f"${opp.listing.price_usd:,.0f} vs market ${opp.quote.market_price_usd:,.0f} "
        f"(+${opp.spread_usd:,.0f}, {opp.spread_pct:.0f}%){trend} {opp.listing.url}".rstrip()
    )


class Notifier(ABC):
    @abstractmethod
    def send(self, opps: List[Opportunity]) -> None:
        ...


class ConsoleNotifier(Notifier):
    def send(self, opps: List[Opportunity]) -> None:
        for o in opps:
            print(f"[ALERT] {format_line(o)}")


class DiscordWebhookNotifier(Notifier):
    """Posts to a Discord (or compatible) webhook expecting ``{"content": ...}``."""

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.environ.get("DISCORD_WEBHOOK_URL", "")
        if not self.webhook_url:
            raise ValueError("DiscordWebhookNotifier needs a webhook URL (DISCORD_WEBHOOK_URL)")

    def send(self, opps: List[Opportunity]) -> None:
        if not opps:
            return
        header = f"🔔 {len(opps)} arbitrage opportunit{'y' if len(opps) == 1 else 'ies'}"
        body = "\n".join(format_line(o) for o in opps)
        post_json(self.webhook_url, {"content": f"**{header}**\n{body}"[:1900]})


class AlertDispatcher:
    """De-duplicating wrapper around a notifier, backed by a JSON state file."""

    def __init__(self, notifier: Notifier, state_path: Optional[str] = None):
        self.notifier = notifier
        self.state_path = state_path

    def _load(self) -> Set[str]:
        if not self.state_path or not os.path.exists(self.state_path):
            return set()
        try:
            with open(self.state_path, encoding="utf-8") as f:
                return set(json.load(f))
        except Exception:
            return set()

    def _save(self, seen: Set[str]) -> None:
        if not self.state_path:
            return
        os.makedirs(os.path.dirname(os.path.abspath(self.state_path)) or ".", exist_ok=True)
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump(sorted(seen), f)

    def dispatch(self, opps: Iterable[Opportunity]) -> List[Opportunity]:
        """Send only opportunities not seen before. Returns the new ones."""
        seen = self._load()
        new = [o for o in opps if signature(o) not in seen]
        if new:
            self.notifier.send(new)
            seen.update(signature(o) for o in new)
            self._save(seen)
        return new
