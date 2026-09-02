import test from "node:test";
import assert from "node:assert/strict";
import { parseTrendsRss, trendsToSignals } from "./google-trends";

/** 스펙 §0에서 검증된 실제 응답 형태를 그대로 옮긴 픽스처 (2026-09-02 geo=KR) */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss xmlns:atom="http://www.w3.org/2005/Atom" xmlns:ht="https://trends.google.com/trending/rss" version="2.0">
\t<channel>
\t\t<title>Daily Search Trends</title>
\t\t<item>
\t\t\t<title>서희 제</title>
\t\t\t<ht:approx_traffic>1000+</ht:approx_traffic>
\t\t\t<description/>
\t\t\t<link>https://trends.google.com/trending/rss?geo=KR</link>
\t\t\t<pubDate>Tue, 1 Sep 2026 19:00:00 -0700</pubDate>
\t\t\t<ht:picture>https://encrypted-tbn2.gstatic.com/images?q=tbn:abc</ht:picture>
\t\t\t<ht:picture_source>Daum</ht:picture_source>
\t\t\t<ht:news_item>
\t\t\t\t<ht:news_item_title>&apos;구준엽 처제&apos; 서희제 &quot;언니 서희원, 매일 꿈에 나와&quot;…이름 타투까지 새겨</ht:news_item_title>
\t\t\t\t<ht:news_item_snippet/>
\t\t\t\t<ht:news_item_url>https://v.daum.net/v/20260902120646879</ht:news_item_url>
\t\t\t\t<ht:news_item_picture>https://encrypted-tbn2.gstatic.com/images?q=tbn:def</ht:news_item_picture>
\t\t\t\t<ht:news_item_source>Daum</ht:news_item_source>
\t\t\t</ht:news_item>
\t\t\t<ht:news_item>
\t\t\t\t<ht:news_item_title>서희제, 故 서희원 사진 업로드 &quot;언니 이야기, 일부러 안 피해…모두가 기억하길&quot;</ht:news_item_title>
\t\t\t\t<ht:news_item_snippet/>
\t\t\t\t<ht:news_item_url>https://news.nate.com/view/20260901n32532</ht:news_item_url>
\t\t\t\t<ht:news_item_source>네이트</ht:news_item_source>
\t\t\t</ht:news_item>
\t\t</item>
\t\t<item>
\t\t\t<title>투팍</title>
\t\t\t<ht:approx_traffic>100+</ht:approx_traffic>
\t\t\t<pubDate>Tue, 1 Sep 2026 18:00:00 -0700</pubDate>
\t\t</item>
\t\t<item>
\t\t\t<title></title>
\t\t\t<ht:approx_traffic>50+</ht:approx_traffic>
\t\t</item>
\t</channel>
</rss>`;

test("parseTrendsRss: 제목·traffic·pubDate·ht:news_item 파싱, 엔티티 디코딩, 빈 제목 제외", () => {
  const items = parseTrendsRss(FIXTURE);
  assert.equal(items.length, 2);
  const [first, second] = items;
  assert.equal(first.title, "서희 제");
  assert.equal(first.traffic, "1000+");
  assert.equal(first.publishedAt, "2026-09-02T02:00:00.000Z");
  assert.equal(first.picture, "https://encrypted-tbn2.gstatic.com/images?q=tbn:abc");
  assert.equal(first.news.length, 2);
  assert.equal(first.news[0].title, `'구준엽 처제' 서희제 "언니 서희원, 매일 꿈에 나와"…이름 타투까지 새겨`);
  assert.equal(first.news[0].url, "https://v.daum.net/v/20260902120646879");
  assert.equal(first.news[0].source, "Daum");
  assert.equal(first.news[0].publishedAt, first.publishedAt);
  assert.equal(first.news[1].source, "네이트");
  assert.equal(second.title, "투팍");
  assert.equal(second.traffic, "100+");
  assert.deepEqual(second.news, []);
});

test("trendsToSignals: traffic → demand, pubDate → freshness, 뉴스 첨부", () => {
  const now = Date.parse("2026-09-02T06:00:00Z");
  const signals = trendsToSignals(parseTrendsRss(FIXTURE), now);
  assert.equal(signals[0].source, "google-trends");
  assert.equal(signals[0].keyword, "서희 제");
  assert.ok(Math.abs((signals[0].demand ?? 0) - 0.5) < 1e-9);
  assert.equal(signals[0].freshness, 1);
  assert.equal(signals[0].news?.length, 2);
  assert.equal(signals[0].evidence.value, "1000+");
  assert.equal(signals[1].demand, 0.3);
});

test("parseTrendsRss: 빈 문서는 빈 배열", () => {
  assert.deepEqual(parseTrendsRss("<rss></rss>"), []);
  assert.deepEqual(parseTrendsRss(""), []);
});
