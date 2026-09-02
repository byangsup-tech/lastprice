import test from "node:test";
import assert from "node:assert/strict";
import { fetchNaverNewsSignals, naverItemsToSignal } from "./naver";

test("naverItemsToSignal: 기사 수 → demand, 최신 기사 → freshness, 상위 5건 첨부", () => {
  const now = Date.parse("2026-09-02T06:00:00Z");
  const items = Array.from({ length: 7 }, (_, i) => ({
    title: `기사 ${i}`,
    link: `https://n.news.naver.com/${i}`,
    publishedAt: new Date(now - (i + 1) * 3_600_000 * 24).toISOString(),
  }));
  const sig = naverItemsToSignal("연금 개혁", items, now);
  assert.equal(sig.source, "naver-news");
  assert.equal(sig.keyword, "연금 개혁");
  assert.ok(Math.abs((sig.demand ?? 0) - (0.2 + 7 / 25)) < 1e-9);
  assert.equal(sig.freshness, 1);
  assert.equal(sig.news?.length, 5);
  assert.equal(sig.news?.[0].source, "네이버 뉴스");
  assert.equal(sig.evidence.value, "7");
  const empty = naverItemsToSignal("x", [], now);
  assert.equal(empty.freshness, 0.5);
  assert.ok(Math.abs((empty.demand ?? 0) - 0.2) < 1e-9);
});

test("fetchNaverNewsSignals: 키 없으면 네트워크 없이 빈 배열", async () => {
  const saved = { id: process.env.NAVER_CLIENT_ID, secret: process.env.NAVER_CLIENT_SECRET };
  delete process.env.NAVER_CLIENT_ID;
  delete process.env.NAVER_CLIENT_SECRET;
  try {
    assert.deepEqual(await fetchNaverNewsSignals(["연금"]), []);
  } finally {
    if (saved.id !== undefined) process.env.NAVER_CLIENT_ID = saved.id;
    if (saved.secret !== undefined) process.env.NAVER_CLIENT_SECRET = saved.secret;
  }
});
