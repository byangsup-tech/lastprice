import test from "node:test";
import assert from "node:assert/strict";
import { googleNewsUrl, newsToSignals, parseNewsFeed } from "./google-news";

const FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><generator>NFE/5.0</generator><title>"실손보험" - Google 뉴스</title>
<item><title>병원비 먼저 내고 “1년 8개월 기다리세요?” 실손보험의 빈틈 - v.daum.net</title><link>https://news.google.com/rss/articles/AAA?oc=5</link><guid isPermaLink="false">AAA</guid><pubDate>Wed, 02 Sep 2026 01:00:00 GMT</pubDate><description>&lt;a href="x"&gt;desc&lt;/a&gt;</description><source url="https://v.daum.net">v.daum.net</source></item>
<item><title>실손보험 청구 간소화, 병원 참여율 30% 그쳐 - 연합뉴스</title><link>https://news.google.com/rss/articles/BBB?oc=5</link><pubDate>Tue, 01 Sep 2026 09:00:00 GMT</pubDate><source url="https://yna.co.kr">연합뉴스</source></item>
<item><title>실손보험 청구 간소화 2단계 시행…의원급 참여 확대 - 한국경제</title><link>https://news.google.com/rss/articles/CCC?oc=5</link><pubDate>Mon, 31 Aug 2026 09:00:00 GMT</pubDate><source url="https://hankyung.com">한국경제</source></item>
<item><title>5세대 실손보험 출시 임박…보험료 얼마나 싸지나 - 매일경제</title><link>https://news.google.com/rss/articles/DDD?oc=5</link><pubDate>Sun, 23 Aug 2026 09:00:00 GMT</pubDate><source url="https://mk.co.kr">매일경제</source></item>
<item><title>5세대 실손보험 보험료 30% 인하 전망 - 조선비즈</title><link>https://news.google.com/rss/articles/EEE?oc=5</link><pubDate>Sat, 22 Aug 2026 09:00:00 GMT</pubDate><source url="https://biz.chosun.com">조선비즈</source></item>
</channel></rss>`;

test("parseNewsFeed: parseFeed 위에 '제목 - 매체' 분리", () => {
  const items = parseNewsFeed(FIXTURE);
  assert.equal(items.length, 5);
  assert.equal(items[0].title, "병원비 먼저 내고 “1년 8개월 기다리세요?” 실손보험의 빈틈");
  assert.equal(items[0].source, "v.daum.net");
  assert.equal(items[0].url, "https://news.google.com/rss/articles/AAA?oc=5");
  assert.equal(items[0].publishedAt, "2026-09-02T01:00:00.000Z");
  assert.equal(items[1].source, "연합뉴스");
});

test("newsToSignals: 키워드별 클러스터 → 후보 신호 (크기·신선도·뉴스 첨부)", () => {
  const now = Date.parse("2026-09-02T06:00:00Z");
  const signals = newsToSignals("실손보험", parseNewsFeed(FIXTURE), now);
  assert.ok(signals.length >= 2 && signals.length <= 4, String(signals.length));
  const titles = signals.map((s) => s.keyword);
  assert.ok(titles.some((t) => t.includes("청구") && t.includes("간소화")), titles.join(" | "));
  assert.ok(titles.some((t) => t.includes("5세대")), titles.join(" | "));
  for (const s of signals) {
    assert.equal(s.source, "google-news");
    assert.ok(s.keyword.startsWith("실손보험") || s.keyword.length <= 40);
    assert.ok((s.news?.length ?? 0) >= 1);
    assert.ok(typeof s.demand === "number" && s.demand > 0);
    assert.ok(typeof s.freshness === "number");
    assert.equal(s.evidence.url, googleNewsUrl("실손보험"));
  }
  const simplification = signals.find((s) => s.keyword.includes("간소화"))!;
  assert.equal(simplification.freshness, 1); // 최신 항목 9/1 → 48h 이내
  assert.ok(simplification.demand! > 0.4);
});

test("googleNewsUrl: hl=ko&gl=KR&ceid=KR:ko", () => {
  assert.equal(googleNewsUrl("실손 보험"), "https://news.google.com/rss/search?q=%EC%8B%A4%EC%86%90%20%EB%B3%B4%ED%97%98&hl=ko&gl=KR&ceid=KR:ko");
});
