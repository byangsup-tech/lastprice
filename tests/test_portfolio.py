import os
import tempfile
import unittest

from lastprice.cards import build_card_index_from_engine
from lastprice.cli import build_demo_engine
from lastprice.portfolio import Portfolio


class TestPortfolio(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = build_card_index_from_engine(build_demo_engine())

    def _portfolio(self, d):
        return Portfolio(os.path.join(d, "pf.json"))

    def test_add_remove_persist_roundtrip(self):
        with tempfile.TemporaryDirectory() as d:
            p = self._portfolio(d)
            h = p.add("Charizard - 4/102 - Base Set - PSA 10", qty=2, cost_basis_usd=3000)
            self.assertEqual(h.grade_label, "PSA 10")
            # reload from disk
            p2 = self._portfolio(d)
            self.assertEqual(len(p2.holdings()), 1)
            self.assertTrue(p2.remove(h.id))
            self.assertEqual(len(self._portfolio(d).holdings()), 0)

    def test_grade_override(self):
        with tempfile.TemporaryDirectory() as d:
            p = self._portfolio(d)
            h = p.add("Charizard - 4/102 - Base Set", grader="PSA", grade="9")
            self.assertEqual(h.grade_label, "PSA 9")

    def test_valuation_uses_comps_basis(self):
        with tempfile.TemporaryDirectory() as d:
            p = self._portfolio(d)
            p.add("Charizard - 4/102 - Base Set - PSA 10", qty=1, cost_basis_usd=3000)
            v = p.valued(self.index)
            row = v["holdings"][0]
            self.assertEqual(row["value_basis"], "comps")
            self.assertIsNotNone(row["value_usd"])
            self.assertGreater(v["total_value_usd"], 0)
            self.assertIsNotNone(v["unrealized_usd"])
            self.assertIn("pokemon", v["allocation_by_game"])

    def test_unknown_card_valued_none(self):
        with tempfile.TemporaryDirectory() as d:
            p = self._portfolio(d)
            p.add("Nonexistent Card 999/999 - PSA 10")
            v = p.valued(self.index)
            self.assertEqual(v["holdings"][0]["value_basis"], "none")
            self.assertIsNone(v["holdings"][0]["value_usd"])


if __name__ == "__main__":
    unittest.main()
