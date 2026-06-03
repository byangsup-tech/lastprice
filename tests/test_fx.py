import os
import unittest

from lastprice.fx import to_usd


class TestFx(unittest.TestCase):
    def test_stablecoins_passthrough(self):
        self.assertEqual(to_usd(100, "USDC"), 100.0)
        self.assertEqual(to_usd(100, "USD"), 100.0)
        self.assertEqual(to_usd(100, ""), 100.0)

    def test_sol_uses_explicit_rate(self):
        self.assertEqual(to_usd(2, "SOL", sol_usd=150), 300.0)

    def test_sol_uses_env_rate(self):
        os.environ["SOL_USD"] = "200"
        try:
            self.assertEqual(to_usd(1.5, "SOL"), 300.0)
        finally:
            del os.environ["SOL_USD"]

    def test_unknown_currency_passthrough(self):
        self.assertEqual(to_usd(42, "DOGE"), 42.0)


if __name__ == "__main__":
    unittest.main()
