import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../config";
import type { RawSignal, TopicCandidate } from "../types";
import { hashId, normalizeKey } from "../util";
import {
  bigramOverlap,
  bigrams,
  clusterHeadlines,
  clusterSizeToDemand,
  clusterTitle,
  countToDemand,
  findMarkerHit,
  freshnessFromDate,
  jaccard,
  keywordFit,
  llmFitOf,
  mergeCandidates,
  scoreAll,
  scoreCandidate,
  splitPublisher,
  stripParticle,
  tokenize,
  trafficToDemand,
} from "./score";

const profile = { ...DEFAULT_PROFILE, keywords: ["보험", "실손보험", "연금", "재테크", "금리", "건강보험", "자동차보험", "경제"] };

function cand(patch: Partial<TopicCandidate> & { title: string }): TopicCandidate {
  return {
    id: hashId(normalizeKey(patch.title)),
    keywords: [],
    sources: [{ source: "google-news", label: "테스트" }],
    news: [],
    signals: { demand: 0.6, competition: 0.5, fit: 0, freshness: 1 },
    score: 0,
    reasons: [],
    ...patch,
  };
}

// ── 토큰화 ───────────────────────────────────────────────────

test("stripParticle: 3자 이상 토큰의 뒤 조사만 제거, 2자 토큰은 유지", () => {
  assert.equal(stripParticle("실손보험이"), "실손보험");
  assert.equal(stripParticle("국민연금과"), "국민연금");
  assert.equal(stripParticle("보험에서는"), "보험");
  assert.equal(stripParticle("서울에서"), "서울");
  assert.equal(stripParticle("도로"), "도로");
  assert.equal(stripParticle("금리"), "금리");
  assert.equal(stripParticle("가이"), "가이");
});

test("tokenize: 구두점 분리·불용어 제거·조사 제거·중복 제거", () => {
  assert.deepEqual(tokenize("실손보험이 바뀐다"), ["실손보험", "바뀐다"]);
  assert.deepEqual(tokenize("‘실손보험’ 개편… 이번 보험료는 오른다"), ["실손보험", "개편", "보험료", "오른다"]);
  assert.deepEqual(tokenize("금리 금리 금리"), ["금리"]);
  assert.deepEqual(tokenize("a b c"), []);
});

test("bigrams / jaccard", () => {
  assert.deepEqual([...bigrams("실손보험")].sort(), ["보험", "손보", "실손"]);
  assert.deepEqual([...bigrams(["개편"])], ["개편"]);
  const a = bigrams("실손보험이 바뀐다");
  const b = bigrams("실손보험 개편");
  assert.equal(jaccard(a, b), 3 / 6);
  assert.equal(jaccard(new Set(), b), 0);
});

test("bigramOverlap: 키워드 바이그램이 텍스트에 얼마나 포함되는지", () => {
  assert.equal(bigramOverlap("실손보험", bigrams("실손 보험 청구")), 2 / 3);
  assert.equal(bigramOverlap("실손보험", bigrams("서희제 구준엽")), 0);
  assert.equal(bigramOverlap("금", bigrams("금리 인하"), normalizeKey("금리 인하")), 1);
});

// ── 클러스터링 ───────────────────────────────────────────────

test("clusterHeadlines: '실손보험이 바뀐다' vs '실손보험 개편' 은 같은 클러스터 (토큰 공유)", () => {
  const clusters = clusterHeadlines([
    { title: "실손보험이 바뀐다", url: "https://a/1", publishedAt: "2026-09-01T00:00:00.000Z" },
    { title: "실손보험 개편", url: "https://a/2", publishedAt: "2026-09-02T00:00:00.000Z" },
    { title: "코스피 사상 최고치 경신", url: "https://a/3" },
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].items.length, 2);
  assert.equal(clusters[0].items[0].url, "https://a/2"); // 최신순
  assert.equal(clusters[0].latestAt, "2026-09-02T00:00:00.000Z");
});

test("clusterHeadlines: 검색어가 주어지면 검색어 토큰·바이그램은 비교에서 제외된다", () => {
  const clusters = clusterHeadlines(
    [
      { title: "실손보험이 바뀐다", url: "https://a/1" },
      { title: "실손보험 개편 확정", url: "https://a/2" },
      { title: "실손보험 청구 간소화 시행", url: "https://a/3" },
      { title: "실손보험 청구 간소화 병원 참여 저조", url: "https://a/4" },
      { title: "실손보험 개편안 발표…보험료 인하", url: "https://a/5" },
    ],
    { query: "실손보험" },
  );
  // 청구 간소화 2건('간소화' 공유) + 개편 2건(Jaccard: {개편,확정} vs {개편,개편안,보험료,험료,인하} → 1/6 미만이지만 '개편' 토큰 + …)
  const sizes = clusters.map((c) => c.items.length);
  const bySize = [...clusters].sort((a, b) => b.items.length - a.items.length);
  assert.equal(bySize[0].items.length, 2, sizes.join(","));
  const titles = clusters.map((c) => clusterTitle(c, "실손보험"));
  assert.ok(titles.includes("실손보험 간소화 청구") || titles.includes("실손보험 청구 간소화"), titles.join(" | "));
  // '실손보험이 바뀐다'는 검색어 외 공유 토큰이 없어 단독 클러스터
  const solo = clusters.find((c) => c.items.some((i) => i.url === "https://a/1"))!;
  assert.equal(solo.items.length, 1);
  assert.ok(clusterTitle(solo, "실손보험").length <= 40);
});

test("clusterHeadlines: 범용 토큰('출시','시행')만 공유하면 묶이지 않고, 3자 토큰 공유면 묶인다", () => {
  const clusters = clusterHeadlines(
    [
      { title: "NH농협생명 혈관튼튼 건강보험 출시", url: "https://a/1" },
      { title: "카카오페이손보 펫보험 출시", url: "https://a/2" },
      { title: "건강보험공단 급여정지 신고 온라인 시행", url: "https://a/3" },
      { title: "급여정지 신고 온라인으로 확대", url: "https://a/4" },
    ],
    { query: "보험" },
  );
  assert.equal(clusters.length, 3);
  const big = clusters[0];
  assert.equal(big.items.length, 2);
  const title = clusterTitle(big, "건강보험");
  assert.ok(title.includes("급여정지"), title);
  // 원문 대소문자 유지
  const nh = clusters.find((c) => c.items[0].url === "https://a/1")!;
  assert.equal(nh.tokenForm.get("nh농협생명"), "NH농협생명");
});

test("clusterTitle: 빈출 토큰이 없으면 대표 헤드라인을 40자로", () => {
  const [cl] = clusterHeadlines([{ title: "병원비 먼저 내고 “1년 8개월 기다리세요?” 실손보험의 빈틈 - 매체", url: "https://a/1" }]);
  const t = clusterTitle(cl, "실손보험");
  assert.ok(t.length <= 40);
  assert.ok(!t.includes(" - 매체"));
});

test("splitPublisher: '제목 - 매체' 분리", () => {
  assert.deepEqual(splitPublisher("실손보험의 빈틈 - v.daum.net"), { title: "실손보험의 빈틈", source: "v.daum.net" });
  assert.deepEqual(splitPublisher("제목만"), { title: "제목만" });
});

// ── 변환 ─────────────────────────────────────────────────────

test("trafficToDemand / countToDemand / clusterSizeToDemand / freshnessFromDate", () => {
  assert.equal(trafficToDemand("100+"), 0.3);
  assert.ok(Math.abs(trafficToDemand("1000+") - 0.5) < 1e-9);
  assert.ok(Math.abs(trafficToDemand("10K+") - 0.7) < 1e-9);
  assert.ok(Math.abs(trafficToDemand("100,000+") - 0.9) < 1e-9);
  assert.equal(trafficToDemand(undefined), 0.3);
  assert.ok(Math.abs(countToDemand(1000) - 0.3) < 1e-9);
  assert.ok(Math.abs(countToDemand(10_000) - 0.6) < 1e-9);
  assert.ok(Math.abs(countToDemand(100_000) - 0.9) < 1e-9);
  assert.equal(clusterSizeToDemand(1), 0.25);
  assert.ok(Math.abs(clusterSizeToDemand(4) - 0.6) < 1e-9);
  const now = Date.parse("2026-09-02T00:00:00Z");
  assert.equal(freshnessFromDate("2026-09-01T00:00:00Z", now), 1);
  assert.ok(Math.abs(freshnessFromDate("2026-08-26T00:00:00Z", now) - 0.4) < 1e-9);
  assert.equal(freshnessFromDate("2026-08-01T00:00:00Z", now), 0.1);
  assert.equal(freshnessFromDate(undefined, now), 0.5);
  assert.equal(freshnessFromDate("not a date", now), 0.5);
});

// ── 적합도 · 마커 ────────────────────────────────────────────

test("keywordFit: 제목 포함 → 1.0 (가장 긴 키워드), 띄어쓰기 변형도 포함, 부분은 바이그램 겹침", () => {
  assert.deepEqual(keywordFit("실손보험 개편", [], profile.keywords), { fit: 1, keyword: "실손보험", via: "title" });
  assert.equal(keywordFit("실손 보험", [], ["실손보험"]).fit, 1);
  assert.equal(keywordFit("실손 의료비", [], ["실손보험"]).fit, 1 / 3);
  assert.equal(keywordFit("서희제", ["'구준엽 처제' 서희제 언니 서희원"], profile.keywords).fit, 0);
});

test("keywordFit: 뉴스만 걸리면 0.8 × 포함 헤드라인 비율 — 연예 검색어의 헤드라인 하나에 '경제'가 스쳐도 게이트 미만", () => {
  const viaNews = keywordFit("5세대 상품", ["5세대 실손보험 출시"], ["실손보험"]);
  assert.equal(viaNews.via, "news");
  assert.ok(Math.abs(viaNews.fit - 0.8) < 1e-9);
  const grazed = keywordFit("톱스타뉴스", ["배우 A, 경제 방송 출연", "배우 A 열애설 부인", "배우 A 드라마 컴백"], profile.keywords);
  assert.equal(grazed.via, "news");
  assert.ok(grazed.fit < 0.3, String(grazed.fit));
  const solid = keywordFit("코스피", ["코스피 급락…금리 부담", "금리 인상 우려에 코스피 3%↓", "외국인 매도"], profile.keywords);
  assert.ok(Math.abs(solid.fit - 0.8 * (2 / 3)) < 1e-9);
});

test("findMarkerHit: 제목 히트 즉시, 뉴스는 2건 이상, 경제 용어 '경기침체'는 예외", () => {
  assert.deepEqual(findMarkerHit("정치 뉴스", [], profile.avoid), { term: "정치", kind: "avoid", where: "title" });
  assert.deepEqual(findMarkerHit("손흥민", ["손흥민 선수 복귀"], []), { term: "선수", kind: "off-niche", where: "news" });
  assert.equal(findMarkerHit("금리 인하", ["회장 구속 여파", "금리 인하 기대", "환율 안정"], []), null);
  assert.deepEqual(findMarkerHit("금리 인하", ["회장 구속 여파", "구속 기소", "환율 안정"], []), { term: "구속", kind: "off-niche", where: "news" });
  assert.equal(findMarkerHit("경기 침체 우려", ["경기도 부동산"], []), null);
  assert.deepEqual(findMarkerHit("한국 일본 경기 결과", [], []), { term: "경기", kind: "off-niche", where: "title" });
  assert.equal(findMarkerHit("사고 영상 모음", [], profile.avoid)?.term, "사고 영상");
  assert.equal(findMarkerHit("배우자 상속", [], []), null);
});

// ── 병합 ─────────────────────────────────────────────────────

test("mergeCandidates: 정규화 제목 일치 병합 + 변형 포함 병합, 짧은 키워드는 긴 주제를 흡수하지 않음", () => {
  const raw: RawSignal[] = [
    { source: "suggest-yt", keyword: "실손보험 개편", evidence: { source: "suggest-yt", label: "1위" }, demand: 0.8 },
    { source: "google-news", keyword: "실손보험 개편안", evidence: { source: "google-news", label: "헤드라인 5건" }, demand: 0.6, freshness: 1, news: [{ title: "n1", url: "https://n/1" }] },
    { source: "google-trends", keyword: "실손 보험 개편", evidence: { source: "google-trends", label: "급상승" }, demand: 0.5, news: [{ title: "n1", url: "https://n/1" }, { title: "n2", url: "https://n/2" }] },
    { source: "suggest-web", keyword: "실손보험", evidence: { source: "suggest-web", label: "1위" }, demand: 0.7 },
    { source: "google-news", keyword: "실손보험 청구 간소화", evidence: { source: "google-news", label: "헤드라인 3건" }, demand: 0.55 },
  ];
  const merged = mergeCandidates(raw);
  const titles = merged.map((c) => c.title).sort();
  assert.deepEqual(titles, ["실손보험", "실손보험 개편안", "실손보험 청구 간소화"]);
  const main = merged.find((c) => c.title === "실손보험 개편안")!;
  assert.equal(main.sources.length, 3);
  assert.equal(main.news.length, 2); // url 기준 중복 제거
  // demand = max(0.8) + 0.05 × (3개 소스 − 1)
  assert.ok(Math.abs(main.signals.demand - 0.9) < 1e-9);
  assert.equal(main.signals.freshness, 1);
  assert.equal(main.signals.competition, 0.5);
  assert.equal(main.id, hashId(normalizeKey("실손보험개편")));
  assert.equal(main.score, 0);
});

test("mergeCandidates: llm-rerank 신호의 fit은 evidence value로 보존된다", () => {
  const merged = mergeCandidates([
    { source: "google-news", keyword: "연금 개혁", evidence: { source: "google-news", label: "x" } },
    { source: "llm-rerank", keyword: "연금 개혁", evidence: { source: "llm-rerank", label: "적합", value: "0.90" }, fit: 0.9 },
  ]);
  assert.equal(llmFitOf(merged[0]), 0.9);
});

// ── 점수 ─────────────────────────────────────────────────────

test("scoreCandidate: 가중치 0.40/0.25/0.25/0.10 → 적합도 승수", () => {
  const c = scoreCandidate(cand({ title: "실손보험 개편", signals: { demand: 0.6, competition: 0.5, fit: 0, freshness: 1 } }), profile);
  // base = 100 × (0.24 + 0.125 + 0.25 + 0.1) = 71.5 ; × (0.3 + 0.7 × 1) = 71.5
  assert.equal(c.score, 72);
  assert.equal(c.signals.fit, 1);
  assert.ok(c.reasons.some((r) => r.includes("채널 키워드 '실손보험' 일치")), c.reasons.join(" / "));
  assert.ok(c.reasons.some((r) => r.startsWith("구글 뉴스:")));
  assert.ok(c.reasons.some((r) => r.includes("48시간")));
});

test("scoreCandidate: 부분 적합은 승수로 깎이고, fit < 0.3 이면 0점 + '채널 키워드와 무관'", () => {
  const partial = scoreCandidate(
    cand({ title: "실손 의료비", signals: { demand: 0.6, competition: 0.5, fit: 0, freshness: 1 } }),
    { ...profile, keywords: ["실손보험"] },
  );
  // fit 1/3: base = 100 × (0.24 + 0.125 + 0.0833 + 0.1) = 54.83 ; × (0.3 + 0.2333) = 29.2
  assert.equal(partial.score, 29);
  assert.ok(partial.reasons.some((r) => r.includes("부분 일치 0.33")), partial.reasons.join(" / "));
  const off = scoreCandidate(cand({ title: "서희제", news: [{ title: "'구준엽 처제' 서희제 언니 서희원 꿈에", url: "https://n/1" }] }), profile);
  assert.equal(off.score, 0);
  assert.equal(off.reasons[0], "채널 키워드와 무관");
});

test("scoreCandidate: 제외 키워드 / 오프니치 마커 → 0점", () => {
  const avoid = scoreCandidate(cand({ title: "보험 정치 논란" }), profile);
  assert.equal(avoid.score, 0);
  assert.ok(avoid.reasons[0].includes("제외 키워드 '정치'"));
  const idol = scoreCandidate(cand({ title: "보험 아이돌" }), profile);
  assert.equal(idol.score, 0);
  assert.ok(idol.reasons[0].includes("오프니치 마커 '아이돌'"));
  // 뉴스 제목에서만 2건 이상 걸려도 0점
  const news = scoreCandidate(
    cand({ title: "경제 이슈", news: [{ title: "배우 A 열애설", url: "https://n/1" }, { title: "배우 B 결혼설", url: "https://n/2" }] }),
    profile,
  );
  assert.equal(news.score, 0);
  assert.ok(news.reasons[0].includes("(뉴스 제목)"));
});

test("scoreCandidate: LLM 적합도가 있으면 게이트를 건너뛰고 0.5/0.5 블렌드", () => {
  const c = scoreCandidate(cand({ title: "퇴직 후 생활비", signals: { demand: 0.6, competition: 0.5, fit: 0, freshness: 1 } }), profile, { llmFit: 0.9 });
  assert.equal(c.signals.fit, 0.45);
  // base = 100 × (0.24 + 0.125 + 0.1125 + 0.1) = 57.75 ; × (0.3 + 0.315) = 35.5
  assert.equal(c.score, 36);
  assert.ok(c.reasons.some((r) => r.includes("LLM 적합도 0.90")));
  const viaEvidence = scoreCandidate(
    cand({ title: "퇴직 후 생활비", sources: [{ source: "llm-rerank", label: "좋음", value: "0.9" }] }),
    profile,
  );
  assert.equal(viaEvidence.signals.fit, 0.45);
});

test("scoreCandidate는 멱등 — 두 번 채점해도 이유가 누적되지 않는다", () => {
  const once = scoreCandidate(cand({ title: "연금 개혁" }), profile);
  const twice = scoreCandidate(once, profile);
  assert.deepEqual(twice.reasons, once.reasons);
  assert.equal(twice.score, once.score);
});

test("scoreAll: 점수 내림차순 정렬, 오프니치는 뒤로", () => {
  const list = scoreAll(
    [cand({ title: "손흥민 경기" }), cand({ title: "금리 인하", signals: { demand: 0.9, competition: 0.5, fit: 0, freshness: 1 } }), cand({ title: "연금 개혁" })],
    profile,
  );
  assert.equal(list[0].title, "금리 인하");
  assert.equal(list.at(-1)!.title, "손흥민 경기");
  assert.equal(list.at(-1)!.score, 0);
});
