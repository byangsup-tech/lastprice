import unittest

from lastprice.cards import build_card_index_from_engine, card_detail, card_summaries
from lastprice.cli import build_demo_engine
from lastprice.models import grade_sort_key
from lastprice.normalize import parse_card_title


class TestBaseGrouping(unittest.TestCase):
    def test_grades_share_base_key_but_not_full_key(self):
        a = parse_card_title("Charizard - 4/102 - Base Set - PSA 10")
        b = parse_card_title("Charizard - 4/102 - Base Set - PSA 9")
        raw = parse_card_title("Charizard - 4/102 - Base Set")
        self.assertEqual(a.base_canonical(), b.base_canonical())
        self.assertEqual(a.base_canonical(), raw.base_canonical())
        self.assertNotEqual(a.canonical(), b.canonical())

    def test_grade_sort_order(self):
        rows = [("", ""), ("PSA", "9"), ("BGS", "9.5"), ("PSA", "10")]
        ordered = sorted(rows, key=lambda r: grade_sort_key(*r))
        self.assertEqual(ordered[0], ("PSA", "10"))
        self.assertEqual(ordered[1], ("BGS", "9.5"))
        self.assertEqual(ordered[-1], ("", ""))  # Raw last


class TestCardIndex(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.index = build_card_index_from_engine(build_demo_engine())
        cls.by_name = {e["name"]: e for e in cls.index.values()}

    def test_charizard_ladder(self):
        e = self.by_name["Charizard"]
        labels = [r["grade_label"] for r in e["grades"]]
        # PSA 10 first, Raw last; multiple grades present
        self.assertEqual(labels[0], "PSA 10")
        self.assertEqual(labels[-1], "Raw")
        self.assertGreaterEqual(len(labels), 3)

    def test_grade_rows_carry_estimates_and_listings(self):
        e = self.by_name["Charizard"]
        psa10 = e["grades"][0]
        self.assertIsNotNone(psa10["estimate"])
        self.assertGreater(psa10["estimate"]["n_sales"], 0)
        self.assertTrue(psa10["listings"])  # cross-market listing attached
        self.assertEqual(psa10["lowest_ask_usd"], psa10["listings"][0]["price_usd"])
        self.assertTrue(psa10["sales"])  # sold history newest-first
        self.assertGreaterEqual(psa10["sales"][0]["sold_at"], psa10["sales"][-1]["sold_at"])

    def test_listings_have_per_site_insured_value(self):
        e = self.by_name["Charizard"]
        psa10 = e["grades"][0]
        for l in psa10["listings"]:
            self.assertIn("insured_usd", l)
            self.assertGreater(l["insured_usd"], 0)
        # platform policy makes insured vary by marketplace
        mkts = {l["marketplace"]: l["insured_usd"] for l in psa10["listings"]}
        if "courtyard" in mkts and "collector_crypt" in mkts:
            self.assertLess(mkts["courtyard"], mkts["collector_crypt"])

    def test_summaries_and_detail_shapes(self):
        summaries = card_summaries(self.index)
        self.assertTrue(summaries)
        s = summaries[0]
        for field in ("base_key", "name", "game", "grades", "best_grade_estimate_usd"):
            self.assertIn(field, s)
        detail = card_detail(self.index, s["base_key"])
        self.assertIsNotNone(detail)
        self.assertIn("grades", detail)

    def test_sales_only_card_still_indexed(self):
        # LeBron PSA 10 exists only in sales fixture (no listing) -> still a grade row
        e = self.by_name["2003 Topps Chrome Lebron James"]
        labels = [r["grade_label"] for r in e["grades"]]
        self.assertIn("PSA 10", labels)


if __name__ == "__main__":
    unittest.main()
