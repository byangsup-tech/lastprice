import os
import tempfile
import unittest

from lastprice.alerts import AlertDispatcher, Notifier, signature
from lastprice.cli import build_demo_engine


class RecordingNotifier(Notifier):
    def __init__(self):
        self.sent = []

    def send(self, opps):
        self.sent.extend(opps)


class TestAlerts(unittest.TestCase):
    def setUp(self):
        self.opps = build_demo_engine().scan()
        self.assertTrue(self.opps, "demo should yield opportunities")

    def test_dedup_across_runs(self):
        with tempfile.TemporaryDirectory() as d:
            state = os.path.join(d, "state.json")

            n1 = RecordingNotifier()
            new1 = AlertDispatcher(n1, state).dispatch(self.opps)
            self.assertEqual(len(new1), len(self.opps))
            self.assertEqual(len(n1.sent), len(self.opps))

            # Second run with the same opportunities: nothing new.
            n2 = RecordingNotifier()
            new2 = AlertDispatcher(n2, state).dispatch(self.opps)
            self.assertEqual(new2, [])
            self.assertEqual(n2.sent, [])

    def test_signature_changes_with_price(self):
        o = self.opps[0]
        sig_a = signature(o)
        o.listing.price_usd += 100
        self.assertNotEqual(sig_a, signature(o))


if __name__ == "__main__":
    unittest.main()
