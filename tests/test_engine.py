import unittest

from lastprice.cli import build_demo_engine


class TestEngine(unittest.TestCase):
    def setUp(self):
        self.engine = build_demo_engine(min_spread_pct=10.0, min_spread_usd=5.0)
        self.opps = self.engine.scan()
        self.cards = {str(o.listing.card_key) for o in self.opps}

    def test_finds_underpriced_listings(self):
        # Charizard PSA10 ($4200 vs $5000) and Umbreon VMAX ($900 vs $1300).
        self.assertIn("Charizard [Base Set 4/102] PSA 10", self.cards)
        self.assertIn("Umbreon Vmax [Evolving Skies 215/203] PSA 10", self.cards)

    def test_excludes_overpriced_and_thin_spread(self):
        # Pikachu is listed ABOVE market -> never an opportunity.
        self.assertNotIn("Pikachu [Base Set 58/102] PSA 9", self.cards)
        # Charizard ex 151 spread is ~3.8% -> below 10% threshold.
        self.assertNotIn("Charizard Ex [151 199/165] PSA 10", self.cards)

    def test_sorted_by_score_desc(self):
        scores = [o.score for o in self.opps]
        self.assertEqual(scores, sorted(scores, reverse=True))

    def test_spread_math(self):
        char = next(o for o in self.opps if "Charizard [Base Set" in str(o.listing.card_key))
        self.assertAlmostEqual(char.spread_usd, 800.0, places=2)
        self.assertAlmostEqual(char.spread_pct, 16.0, places=1)


if __name__ == "__main__":
    unittest.main()
