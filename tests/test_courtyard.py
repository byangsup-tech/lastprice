import unittest

from lastprice.sources.courtyard import CourtyardAdapter

# A trimmed OpenSea v2 listings payload shape (fixture, no network).
OPENSEA_ITEM = {
    "order_hash": "0xabc",
    "price": {"current": {"currency": "POL", "decimals": 18, "value": 9000 * 10**18}},
    "nft": {
        "contract": "0xcourtyardcontract",
        "identifier": "12345",
        "name": "Charizard - 4/102 - Base Set - PSA 10",
        "image_url": "https://img.example/char.png",
    },
}


class TestCourtyardMapping(unittest.TestCase):
    def test_to_listing_maps_fields(self):
        import os

        os.environ["POL_USD"] = "0.5"
        try:
            a = CourtyardAdapter(api_key="test")
            l = a._to_listing(OPENSEA_ITEM)
        finally:
            del os.environ["POL_USD"]
        self.assertIsNotNone(l)
        self.assertEqual(l.marketplace, "courtyard")
        self.assertEqual(l.price_usd, 4500.0)  # 9000 POL * $0.5
        self.assertEqual(l.card_key.grader, "PSA")
        self.assertEqual(l.card_key.grade, "10")
        self.assertIn("0xcourtyardcontract", l.url)
        self.assertIn("12345", l.url)
        self.assertEqual(l.extra["image"], "https://img.example/char.png")

    def test_missing_title_returns_none(self):
        a = CourtyardAdapter(api_key="test")
        self.assertIsNone(a._to_listing({"price": {}}))


class TestFx(unittest.TestCase):
    def test_eth_and_pol_env_rates(self):
        import os

        from lastprice.fx import to_usd

        os.environ["ETH_USD"] = "3000"
        os.environ["POL_USD"] = "0.5"
        try:
            self.assertEqual(to_usd(2, "ETH"), 6000.0)
            self.assertEqual(to_usd(2, "WETH"), 6000.0)  # alias
            self.assertEqual(to_usd(100, "POL"), 50.0)
            self.assertEqual(to_usd(100, "MATIC"), 50.0)  # alias
        finally:
            del os.environ["ETH_USD"], os.environ["POL_USD"]


if __name__ == "__main__":
    unittest.main()
