import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../config";
import type { ResearchReport, TopicCandidate } from "../types";
import { hashId, normalizeKey } from "../util";
import { applyChannelUsed, candidateToTopic, researchCacheKey, selectAutoTopic } from "./collect";

function cand(title: string, patch: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    id: hashId(normalizeKey(title)),
    title,
    keywords: ["보험"],
    sources: [{ source: "google-news", label: "헤드라인 3건", url: "https://news.google.com/rss/search?q=x" }],
    news: [{ title: "뉴스 1", url: "https://n/1" }],
    signals: { demand: 0.6, competition: 0.5, fit: 1, freshness: 1 },
    score: 70,
    reasons: [],
    ...patch,
  };
}

function report(candidates: TopicCandidate[], llmRerank: ResearchReport["llmRerank"] = "no-key"): ResearchReport {
  return { generatedAt: new Date().toISOString(), profileName: "t", candidates, sources: [], llmRerank };
}

test("selectAutoTopic: score ≥ 40 AND fit ≥ 0.3, 사용된 주제 제외, 없으면 null", () => {
  const a = cand("실손보험 개편", { score: 72 });
  const b = cand("연금 개혁", { score: 55 });
  const low = cand("금리 인하", { score: 39 });
  const unfit = cand("코스피", { score: 60, signals: { demand: 0.9, competition: 0.5, fit: 0.2, freshness: 1 } });
  assert.equal(selectAutoTopic(report([low, unfit, b, a]), [])?.title, "실손보험 개편");
  assert.equal(selectAutoTopic(report([a, b]), [normalizeKey("실손보험 개편")])?.title, "연금 개혁");
  assert.equal(selectAutoTopic(report([low, unfit]), []), null);
  assert.equal(selectAutoTopic(report([]), []), null);
  assert.equal(selectAutoTopic(report([low]), [], { minScore: 30 })?.title, "금리 인하");
  assert.equal(selectAutoTopic(report([unfit]), [], { minFit: 0.1 })?.title, "코스피");
});

test("selectAutoTopic: LLM 재정렬이 켜졌으면 llmFit ≥ 0.5 필요 (LLM 평가 없는 후보는 탈락)", () => {
  const noLlm = cand("실손보험 개편", { score: 80 });
  const lowLlm = cand("연금 개혁", { score: 70, sources: [{ source: "llm-rerank", label: "x", value: "0.40" }] });
  const good = cand("금리 인하", { score: 60, sources: [{ source: "llm-rerank", label: "x", value: "0.70" }] });
  assert.equal(selectAutoTopic(report([noLlm, lowLlm, good], "on"), [])?.title, "금리 인하");
  assert.equal(selectAutoTopic(report([noLlm, lowLlm], "on"), []), null);
  // rerank가 error/no-key면 키워드 fit 기준으로 되돌아감
  assert.equal(selectAutoTopic(report([noLlm, lowLlm], "error"), [])?.title, "실손보험 개편");
  // 제안 제목이 이미 사용됐어도 제외
  const suggested = cand("보험료", { score: 90, suggestedTitle: "보험료 아끼는 법" });
  assert.equal(selectAutoTopic(report([suggested]), [normalizeKey("보험료 아끼는 법")]), null);
});

test("candidateToTopic: 제안 제목 우선, 키워드에 원 제목 보존, URL 수집(자동완성 URL 제외)", () => {
  const c = cand("실손보험 개편", {
    angle: "보험료 영향 중심",
    suggestedTitle: "실손보험 개편, 내 보험료는?",
    keywords: ["개편", "보험료"],
    sources: [
      { source: "google-news", label: "x", url: "https://news.google.com/rss/search?q=x" },
      { source: "suggest-yt", label: "y", url: "https://suggestqueries.google.com/complete/search?q=x" },
    ],
    news: [{ title: "n1", url: "https://n/1" }, { title: "n2", url: "https://n/2" }],
  });
  const t = candidateToTopic(c);
  assert.equal(t.title, "실손보험 개편, 내 보험료는?");
  assert.equal(t.angle, "보험료 영향 중심");
  assert.deepEqual(t.keywords, ["실손보험 개편", "개편", "보험료"]);
  assert.deepEqual(t.sourceUrls, ["https://news.google.com/rss/search?q=x", "https://n/1", "https://n/2"]);
  assert.equal(t.candidateId, c.id);
  assert.equal(t.news?.length, 2);
  assert.equal(candidateToTopic(cand("연금")).title, "연금");
});

test("applyChannelUsed: 채널 업로드 제목과 일치/포함(6자 이상)이면 0점 + 이유, 재정렬", () => {
  const list = applyChannelUsed(
    [cand("실손보험 청구 간소화", { score: 80 }), cand("연금 개혁", { score: 60 }), cand("보험", { score: 50 })],
    ["실손보험 청구 간소화 총정리 (2026)", "보험 기초"],
  );
  assert.equal(list[0].title, "연금 개혁");
  const dup = list.find((c) => c.title === "실손보험 청구 간소화")!;
  assert.equal(dup.score, 0);
  assert.equal(dup.reasons[0], "채널 최근 업로드와 중복");
  // '보험'(2자)은 포함만으로는 중복 처리하지 않음
  assert.equal(list.find((c) => c.title === "보험")!.score, 50);
  assert.deepEqual(applyChannelUsed([cand("x")], []).map((c) => c.score), [70]);
});

test("researchCacheKey: 프로필 리서치 필드에만 의존", () => {
  const k1 = researchCacheKey(DEFAULT_PROFILE);
  assert.ok(k1.startsWith("youtube:research:"));
  assert.equal(researchCacheKey({ ...DEFAULT_PROFILE, targetMinutes: 15 }), k1);
  assert.notEqual(researchCacheKey({ ...DEFAULT_PROFILE, keywords: ["주식"] }), k1);
});
