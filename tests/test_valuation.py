import unittest
from datetime import datetime, timedelta, timezone

from lastprice.models import CardKey, SoldComp
from lastprice.valuation import estimate_from_comps

NOW = datetime(2026, 6, 1, tzinfo=timezone.utc)
KEY = CardKey(name="Testmon", set_name="Base Set", number="1/102", grader="PSA", grade="10")


def comp(price, days_ago):
    return SoldComp(
        card_key=KEY,
        price_usd=price,
        sold_at=(NOW - timedelta(days=days_ago)).isoformat(),
        source="test",
    )


class TestValuation(unittest.TestCase):
    def test_empty_returns_none(self):
        self.assertIsNone(estimate_from_comps([], now=NOW))

    def test_single_sale(self):
        est = estimate_from_comps([comp(100, 5)], now=NOW)
        self.assertEqual(est["estimate_usd"], 100)
        self.assertEqual(est["n_sales"], 1)
        self.assertEqual(est["confidence"], "low")

    def test_recency_weighting_moves_estimate_toward_newer_sales(self):
        # old sales at 100, fresh sales at 200 -> estimate should be 200-side
        comps = [comp(100, d) for d in (150, 160, 170)] + [comp(200, d) for d in (1, 2)]
        est = estimate_from_comps(comps, now=NOW)
        self.assertGreaterEqual(est["estimate_usd"], 200)

    def test_outlier_resistant_median(self):
        comps = [comp(100, d) for d in range(1, 9)] + [comp(10000, 4)]
        est = estimate_from_comps(comps, now=NOW)
        self.assertLess(est["estimate_usd"], 200)  # one wild sale doesn't drag it

    def test_window_excludes_stale_sales(self):
        self.assertIsNone(estimate_from_comps([comp(100, 999)], now=NOW))

    def test_confidence_tiers(self):
        self.assertEqual(estimate_from_comps([comp(1, 1)] * 2, now=NOW)["confidence"], "low")
        self.assertEqual(estimate_from_comps([comp(1, 1)] * 5, now=NOW)["confidence"], "medium")
        self.assertEqual(estimate_from_comps([comp(1, 1)] * 9, now=NOW)["confidence"], "high")

    def test_band_and_last_sold(self):
        comps = [comp(p, i + 1) for i, p in enumerate([90, 95, 100, 105, 110])]
        est = estimate_from_comps(comps, now=NOW)
        self.assertLessEqual(est["low_usd"], est["estimate_usd"])
        self.assertLessEqual(est["estimate_usd"], est["high_usd"])
        self.assertEqual(est["last_sold_price_usd"], 90)  # most recent (1 day ago)


if __name__ == "__main__":
    unittest.main()
