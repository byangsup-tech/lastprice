import test from "node:test";
import assert from "node:assert/strict";
import { parseMostViewed, wikiToSignals } from "./wikipedia";

const FIXTURE = {
  batchcomplete: "",
  query: {
    mostviewed: [
      { ns: 4, title: "위키백과:대문", count: 78878 },
      { ns: -1, title: "특수:검색", count: 17397 },
      { ns: 0, title: "문화방송", count: 14851 },
      { ns: 0, title: "김용범 (공무원)", count: 3544 },
      { ns: 0, title: "위키백과:사랑방", count: 999 },
      { ns: 0, title: "국민연금", count: 1000 },
      { ns: 0, title: "", count: 5 },
    ],
  },
};

test("parseMostViewed: ns 0만, 위키백과:/특수: 제외, 괄호 표기 제거", () => {
  const items = parseMostViewed(FIXTURE);
  assert.deepEqual(
    items.map((i) => [i.title, i.cleanTitle, i.count]),
    [
      ["문화방송", "문화방송", 14851],
      ["김용범 (공무원)", "김용범", 3544],
      ["국민연금", "국민연금", 1000],
    ],
  );
  assert.deepEqual(parseMostViewed({}), []);
  assert.deepEqual(parseMostViewed(null), []);
});

test("wikiToSignals: 조회수 → demand, 위키 URL evidence", () => {
  const signals = wikiToSignals(parseMostViewed(FIXTURE));
  assert.equal(signals[2].keyword, "국민연금");
  assert.ok(Math.abs((signals[2].demand ?? 0) - 0.3) < 1e-9);
  assert.equal(signals[1].keyword, "김용범");
  assert.ok(signals[1].evidence.url?.includes(encodeURIComponent("김용범_(공무원)")));
  assert.equal(signals[0].freshness, 0.6);
});
