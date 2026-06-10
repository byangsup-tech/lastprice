"""Command-line entry point.

    python -m lastprice --demo                 # offline, sample data
    python -m lastprice --live --limit 100     # real Magic Eden + price API
"""
from __future__ import annotations

import argparse
import json
import os
from typing import List

from .engine import ArbitrageEngine
from .models import Opportunity

_EXAMPLES = os.path.join(os.path.dirname(__file__), os.pardir, "examples")


def build_demo_engine(min_spread_pct: float = 10.0, min_spread_usd: float = 5.0) -> ArbitrageEngine:
    """Offline engine using bundled sample data (Collector Crypt + Phygitals)."""
    from .pricing.sample_prices import SamplePriceSource
    from .sources.sample import SampleMarketAdapter

    adapters = [
        SampleMarketAdapter(os.path.join(_EXAMPLES, "sample_cc_listings.json"), "collector_crypt"),
        SampleMarketAdapter(os.path.join(_EXAMPLES, "sample_phygitals_listings.json"), "phygitals"),
    ]
    price_source = SamplePriceSource(os.path.join(_EXAMPLES, "sample_prices.json"))
    engine = ArbitrageEngine(adapters, price_source, min_spread_pct, min_spread_usd)
    engine.mode = "demo"
    from .gacha import SampleGachaSource
    from .pricing.sample_sales import SampleSalesSource

    engine.gacha_source = SampleGachaSource(os.path.join(_EXAMPLES, "sample_gacha.json"))
    engine.sales_source = SampleSalesSource(os.path.join(_EXAMPLES, "sample_sales.json"))
    return engine


def build_live_engine(args) -> ArbitrageEngine:
    """Live engine: Collector Crypt + Phygitals (Magic Eden) + PokemonPriceTracker."""
    from .pricing.pokemonpricetracker import PokemonPriceTrackerSource
    from .sources.collector_crypt import CollectorCryptAdapter
    from .sources.phygitals import PhygitalsAdapter

    adapters = [
        CollectorCryptAdapter(collection_symbol=args.collection),
        PhygitalsAdapter(),
    ]
    price_source = PokemonPriceTrackerSource()
    engine = ArbitrageEngine(adapters, price_source, args.min_spread_pct, args.min_spread_usd)
    engine.mode = "live"
    engine.gacha_source = None  # wire a live gacha source when available
    return engine


def build_notifier(args):
    """Construct the alert notifier selected on the command line."""
    if args.alert == "discord":
        from .alerts import DiscordWebhookNotifier

        return DiscordWebhookNotifier(args.webhook)
    from .alerts import ConsoleNotifier

    return ConsoleNotifier()


def _print_table(opps: List[Opportunity]) -> None:
    if not opps:
        print("No arbitrage opportunities above thresholds.")
        return
    header = f"{'CARD':<42} {'MARKET':<11} {'LIST $':>9} {'MKT $':>9} {'EDGE':>8} {'%':>6} {'24h':>6}"
    print(header)
    print("-" * len(header))
    for o in opps:
        trend = f"{o.quote.trend_pct_24h:+.0f}%" if o.quote.trend_pct_24h is not None else "  -"
        print(
            f"{str(o.listing.card_key)[:42]:<42} "
            f"{o.listing.marketplace[:11]:<11} "
            f"{o.listing.price_usd:>9,.0f} "
            f"{o.quote.market_price_usd:>9,.0f} "
            f"{o.spread_usd:>+8,.0f} "
            f"{o.spread_pct:>5.0f}% "
            f"{trend:>6}"
        )


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="lastprice", description=__doc__)
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--demo", action="store_true", help="offline run with sample data (default)")
    mode.add_argument("--live", action="store_true", help="hit live Magic Eden + price APIs")
    p.add_argument("--check", action="store_true", help="run connectivity/config self-check and exit")
    p.add_argument("--collection", default=None, help="Magic Eden collection symbol (live)")
    p.add_argument("--query", default=None, help="filter listings by substring")
    p.add_argument("--limit", type=int, default=50, help="max listings per marketplace")
    p.add_argument("--min-spread-pct", type=float, default=10.0)
    p.add_argument("--min-spread-usd", type=float, default=5.0)
    p.add_argument("--json", action="store_true", help="emit JSON instead of a table")
    p.add_argument("--alert", choices=["console", "discord"], help="send new opportunities as alerts")
    p.add_argument("--webhook", default=None, help="Discord webhook URL (or DISCORD_WEBHOOK_URL)")
    p.add_argument("--state-file", default=None, help="alert de-dup state file (default .lastprice_alerts.json)")
    p.add_argument("--serve", action="store_true", help="run the web dashboard")
    p.add_argument("--export-html", default=None, metavar="PATH", help="write a static HTML snapshot and exit")
    p.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"), help="web server host")
    p.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")), help="web server port")
    args = p.parse_args(argv)

    if args.check:
        from .selfcheck import run_checks

        return 0 if run_checks() else 1

    if args.live:
        engine = build_live_engine(args)
    else:
        engine = build_demo_engine(args.min_spread_pct, args.min_spread_usd)

    if args.export_html:
        from .web import export_html

        n = export_html(engine, args.export_html)
        print(f"Wrote {args.export_html} ({n} opportunities).")
        return 0

    if args.serve:
        from .web import serve

        serve(engine, host=args.host, port=args.port)
        return 0

    opps = engine.scan(query=args.query, limit=args.limit)

    if args.json:
        print(json.dumps([o.to_dict() for o in opps], indent=2))
    else:
        _print_table(opps)

    if args.alert:
        from .alerts import AlertDispatcher

        dispatcher = AlertDispatcher(
            build_notifier(args),
            state_path=args.state_file or ".lastprice_alerts.json",
        )
        new = dispatcher.dispatch(opps)
        print(f"\n{len(new)} new alert(s) sent ({len(opps) - len(new)} already seen).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
