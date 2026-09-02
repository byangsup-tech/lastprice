import test from "node:test";
import assert from "node:assert/strict";
import { estimateCompetition, fetchChannelRecentTitles, parseChannelTitles, parseSearchIds, parseViewCounts } from "./youtube-data";

test("parseSearchIds / parseViewCounts", () => {
  const search = { items: [{ id: { videoId: "a1" }, snippet: { title: "x" } }, { id: { channelId: "c" } }, { id: { videoId: "b2" } }] };
  assert.deepEqual(parseSearchIds(search), ["a1", "b2"]);
  assert.deepEqual(parseSearchIds({}), []);
  const videos = { items: [{ id: "a1", statistics: { viewCount: "12000" } }, { id: "b2", statistics: {} }, { id: "c3", statistics: { viewCount: "300" } }] };
  assert.deepEqual(parseViewCounts(videos), [12000, 300]);
});

test("estimateCompetition: 중앙값 조회수·결과 수 블렌드, 총 조회수 → 수요 보정", () => {
  const none = estimateCompetition([]);
  assert.equal(none.competition, 0.9);
  assert.equal(none.count, 0);
  const est = estimateCompetition([1_000_000, 100_000, 10_000, 1_000]);
  assert.equal(est.count, 4);
  assert.equal(est.medianViews, 55_000);
  assert.equal(est.sumViews, 1_111_000);
  // byViews = 1 − log10(55000)/6 ≈ 0.209, byCount = 0.6 → 0.7×0.209 + 0.3×0.6 ≈ 0.326
  assert.ok(Math.abs(est.competition - 0.326) < 0.01, String(est.competition));
  assert.ok(Math.abs(est.demandBoost - Math.log10(1_111_000) / 7) < 1e-9);
  const tiny = estimateCompetition([10, 20]);
  assert.ok(tiny.competition > 0.8);
});

test("parseChannelTitles: search.list(channelId) 응답에서 제목만", () => {
  const raw = { items: [{ snippet: { title: " 실손보험 5세대 총정리 " } }, { snippet: {} }, { snippet: { title: "연금 개혁 핵심 3가지" } }] };
  assert.deepEqual(parseChannelTitles(raw), ["실손보험 5세대 총정리", "연금 개혁 핵심 3가지"]);
  assert.deepEqual(parseChannelTitles(undefined), []);
});

test("fetchChannelRecentTitles: 키/채널 ID 없으면 네트워크 없이 빈 배열", async () => {
  const saved = { key: process.env.YOUTUBE_API_KEY, ch: process.env.YT_CHANNEL_ID };
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.YT_CHANNEL_ID;
  try {
    assert.deepEqual(await fetchChannelRecentTitles(), []);
    process.env.YOUTUBE_API_KEY = "k";
    assert.deepEqual(await fetchChannelRecentTitles(), []);
  } finally {
    if (saved.key === undefined) delete process.env.YOUTUBE_API_KEY;
    else process.env.YOUTUBE_API_KEY = saved.key;
    if (saved.ch === undefined) delete process.env.YT_CHANNEL_ID;
    else process.env.YT_CHANNEL_ID = saved.ch;
  }
});
