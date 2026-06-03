import unittest

from lastprice.sources.phygitals import PhygitalsAdapter


class TestPhygitalsMapping(unittest.TestCase):
    def test_card_url_uses_slug(self):
        url = PhygitalsAdapter.card_url("2025-riftbound-league-of-legend-wg6tij")
        self.assertEqual(
            url, "https://www.phygitals.com/card/2025-riftbound-league-of-legend-wg6tij"
        )

    def test_to_listing_maps_fields_usd(self):
        a = PhygitalsAdapter()
        item = {
            "name": "Charizard - 4/102 - Base Set - PSA 10",
            "slug": "charizard-base-set-psa10-abc123",
            "price": 4200,
            "currency": "USD",
        }
        listing = a._to_listing(item)
        self.assertEqual(listing.marketplace, "phygitals")
        self.assertEqual(listing.price_usd, 4200.0)
        self.assertEqual(listing.listing_id, "charizard-base-set-psa10-abc123")
        self.assertTrue(listing.url.endswith("charizard-base-set-psa10-abc123"))
        self.assertEqual(listing.card_key.grader, "PSA")
        self.assertEqual(listing.card_key.grade, "10")

    def test_to_listing_converts_sol(self):
        a = PhygitalsAdapter(sol_usd=150)
        listing = a._to_listing({"name": "X", "slug": "x", "price": 2, "currency": "SOL"})
        self.assertEqual(listing.price_usd, 300.0)


if __name__ == "__main__":
    unittest.main()
