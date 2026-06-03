import unittest

from lastprice.activity import ActivityTracker
from lastprice.cli import build_demo_engine


class TestActivity(unittest.TestCase):
    def setUp(self):
        self.engine = build_demo_engine()
        self.opps = self.engine.scan()
        self.assertTrue(self.opps)

    def test_first_record_seeds_silently(self):
        t = ActivityTracker()
        t.record(self.opps)
        self.assertEqual(t.feed(), [])

    def test_removed_listing_emits_event(self):
        t = ActivityTracker()
        t.record(self.opps)
        t.record(self.opps[1:])  # drop one listing
        feed = t.feed()
        self.assertEqual(len(feed), 1)
        self.assertEqual(feed[0]["type"], "removed")

    def test_price_change_emits_directional_event(self):
        t = ActivityTracker()
        t.record(self.opps)
        second = self.engine.scan()  # fresh objects, as a real re-scan would be
        second[0].listing.price_usd *= 0.8  # a price drop
        t.record(second)
        feed = t.feed()
        self.assertEqual(len(feed), 1)
        self.assertEqual(feed[0]["type"], "price_down")
        self.assertIsNotNone(feed[0]["prev_price_usd"])

    def test_no_change_no_events(self):
        t = ActivityTracker()
        t.record(self.opps)
        t.record(self.opps)
        self.assertEqual(t.feed(), [])


if __name__ == "__main__":
    unittest.main()
