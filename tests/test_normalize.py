import unittest

from lastprice.normalize import parse_card_title


class TestNormalize(unittest.TestCase):
    def test_base_set_charizard_psa(self):
        k = parse_card_title("Charizard - 4/102 - Base Set - PSA 10")
        self.assertEqual(k.name, "Charizard")
        self.assertEqual(k.set_name, "Base Set")
        self.assertEqual(k.number, "4/102")
        self.assertEqual(k.grader, "PSA")
        self.assertEqual(k.grade, "10")

    def test_half_grade_and_cgc(self):
        k = parse_card_title("Umbreon VMAX 215/203 Evolving Skies CGC 9.5")
        self.assertEqual(k.grader, "CGC")
        self.assertEqual(k.grade, "9.5")
        self.assertEqual(k.number, "215/203")
        self.assertEqual(k.set_name, "Evolving Skies")

    def test_cross_market_titles_match(self):
        # Same physical card, two different marketplace title formats.
        a = parse_card_title("Charizard - 4/102 - Base Set - PSA 10")
        b = parse_card_title("PSA 10 Base Set Charizard #4/102 Holo")
        self.assertEqual(a.canonical(), b.canonical())

    def test_raw_card_has_no_grade(self):
        k = parse_card_title("Pikachu 58/102 Base Set")
        self.assertEqual(k.grader, "")
        self.assertEqual(k.grade, "")


if __name__ == "__main__":
    unittest.main()
