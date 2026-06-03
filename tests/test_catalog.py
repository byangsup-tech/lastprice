import os
import unittest

from lastprice.catalog import build_catalog_from_engine
from lastprice.cli import build_demo_engine
from lastprice.gacha import SampleGachaSource

_EX = os.path.join(os.path.dirname(__file__), os.pardir, "examples")


class TestGacha(unittest.TestCase):
    def test_pools_parse_to_canonical_keys(self):
        pools = SampleGachaSource(os.path.join(_EX, "sample_gacha.json")).pools()
        self.assertTrue(pools)
        pool = pools[0]
        # odds keyed by canonical CardKey, with matching display keys
        self.assertEqual(set(pool.odds), set(pool.card_keys))
        self.assertTrue(all(0 < p <= 1 for p in pool.odds.values()))


class TestCatalog(unittest.TestCase):
    def setUp(self):
        self.cat = build_catalog_from_engine(build_demo_engine())
        self.by_name = {c["name"]: c for c in self.cat}

    def test_card_has_buy_and_gacha_paths(self):
        char = next(c for c in self.cat if c["name"] == "Charizard")
        self.assertTrue(char["listings"])                 # buyable
        self.assertEqual(char["listings"][0]["marketplace"], "collector_crypt")
        self.assertTrue(char["gacha"])                    # pullable
        g = char["gacha"][0]
        self.assertAlmostEqual(g["expected_cost_usd"], g["pull_cost_usd"] / g["odds"], places=1)
        self.assertAlmostEqual(g["expected_pulls"], 1 / g["odds"], places=1)

    def test_listings_sorted_cheapest_first(self):
        for c in self.cat:
            prices = [l["price_usd"] for l in c["listings"]]
            self.assertEqual(prices, sorted(prices))

    def test_recommendation_fields_present(self):
        char = next(c for c in self.cat if c["name"] == "Charizard")
        self.assertIsNotNone(char["cheapest_direct_usd"])
        self.assertIsNotNone(char["best_gacha_cost_usd"])
        self.assertIsNotNone(char["market_price"])


if __name__ == "__main__":
    unittest.main()
