import test from "node:test";
import assert from "node:assert/strict";
import { parseSuggest, suggestUrl, suggestionsToSignals, ytDemandFromSuggestions } from "./suggest";

/** 스펙 §0 client=firefox 응답 형태 (2026-09-02 실측) */
const FIXTURE = JSON.parse(
  '["실손보험",["실손보험","실손보험 추천","실손보험 개혁","실손보험청구방법","실손보험 비교","실손보험 전환","실손보험 세대별 비교","실손보험 재매입","실손보험 가입","실손보험 청구 간소화"],[],{"google:suggestsubtypes":[[512,433],[512],[512],[512],[512],[512],[512],[512],[512],[512]]}]',
) as unknown;

test("parseSuggest: 검색어 자체 제외, 중복 제거, 형식 오류는 빈 배열", () => {
  const list = parseSuggest(FIXTURE, "실손보험");
  assert.equal(list.length, 9);
  assert.equal(list[0], "실손보험 추천");
  assert.equal(list.at(-1), "실손보험 청구 간소화");
  assert.deepEqual(parseSuggest({ nope: true }), []);
  assert.deepEqual(parseSuggest(["q", "not-array"]), []);
  assert.deepEqual(parseSuggest(["q", ["a", "A", " a "]]), ["a"]);
});

test("suggestionsToSignals: demand = 0.35 + 0.05 × 아래에서 센 순위", () => {
  const signals = suggestionsToSignals("실손보험", parseSuggest(FIXTURE, "실손보험"), "yt");
  assert.equal(signals.length, 9);
  assert.equal(signals[0].source, "suggest-yt");
  assert.ok(Math.abs((signals[0].demand ?? 0) - 0.75) < 1e-9); // 9개 중 1위 → 0.35 + 0.05×8
  assert.ok(Math.abs((signals[8].demand ?? 0) - 0.35) < 1e-9);
  assert.equal(signals[0].evidence.value, "1/9");
  assert.equal(suggestionsToSignals("x", ["y"], "web")[0].source, "suggest-web");
});

test("ytDemandFromSuggestions: 용어 포함 개수 / 10", () => {
  const suggestions = ["실손보험", "실손보험 추천", "실손 보험 비교", "건강보험"];
  assert.equal(ytDemandFromSuggestions("실손보험", suggestions), 0.3);
  assert.equal(ytDemandFromSuggestions("없는말", suggestions), 0);
  assert.equal(ytDemandFromSuggestions("", suggestions), 0);
});

test("suggestUrl: ds=yt 는 유튜브, 없으면 웹", () => {
  assert.equal(suggestUrl("보험", "yt"), "https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&hl=ko&gl=kr&q=%EB%B3%B4%ED%97%98");
  assert.equal(suggestUrl("보험", "web"), "https://suggestqueries.google.com/complete/search?client=firefox&hl=ko&gl=kr&q=%EB%B3%B4%ED%97%98");
});
