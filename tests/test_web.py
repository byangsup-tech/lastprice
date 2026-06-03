import json
import os
import tempfile
import unittest

from lastprice.cli import build_demo_engine
from lastprice.web import export_html, render_html


class TestWeb(unittest.TestCase):
    def setUp(self):
        self.engine = build_demo_engine()
        self.opps = self.engine.scan()

    def test_payload_has_facet_fields(self):
        d = self.opps[0].to_dict()
        for field in ("game", "marketplace", "grader", "grade_label", "spread_pct", "url"):
            self.assertIn(field, d)

    def test_render_inlines_data_and_mode(self):
        html = render_html(self.opps, self.engine)
        self.assertIn('const MODE = "demo"', html)
        self.assertIn("const RAW = [", html)  # data inlined, placeholder replaced
        self.assertNotIn("/*__DATA__*/[]", html)
        # the inlined array should be valid JSON with the right length
        start = html.index("const RAW = ") + len("const RAW = ")
        end = html.index("];", start) + 1
        data = json.loads(html[start:end].replace("\\u003c", "<"))
        self.assertEqual(len(data), len(self.opps))

    def test_export_writes_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "sub", "index.html")
            n = export_html(self.engine, path)
            self.assertEqual(n, len(self.opps))
            self.assertTrue(os.path.exists(path))
            self.assertGreater(os.path.getsize(path), 5000)

    def test_multiple_games_present(self):
        games = {o.to_dict()["game"] for o in self.opps}
        self.assertGreaterEqual(len(games), 4)  # pokemon, riftbound, one piece, sports, magic


if __name__ == "__main__":
    unittest.main()
