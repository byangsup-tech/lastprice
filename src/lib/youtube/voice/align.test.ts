import test from "node:test";
import assert from "node:assert/strict";
import type { WordTiming } from "../types";
import {
  alignTokensToText,
  measuredCharsPerMinute,
  restorePunctuation,
  sanitizeWords,
  ticksToMs,
  trimmedDurationMs,
} from "./align";

test("ticksToMs — 100ns 틱 → ms 반올림", () => {
  assert.equal(ticksToMs(10_000), 1);
  assert.equal(ticksToMs(8_750_000), 875);
  assert.equal(ticksToMs(12_345_678), 1235);
});

test("alignTokensToText — 애드엔덤 픽스처: 구두점 복원", () => {
  const text = "첫 번째 문장입니다. 두 번째 문장이죠! 그리고 세 번째, 마지막 문장입니다.";
  const tokens = ["첫", "번째", "문장입니다", "두", "번째", "문장이죠", "그리고", "세", "번째", "마지막", "문장입니다"];
  const out = alignTokensToText(tokens, text);
  assert.deepEqual(out, [
    "첫",
    "번째",
    "문장입니다.",
    "두",
    "번째",
    "문장이죠!",
    "그리고",
    "세",
    "번째,",
    "마지막",
    "문장입니다.",
  ]);
  assert.equal(out.join(" "), text);
});

test("alignTokensToText — 못 찾는 토큰은 그대로, 커서는 유지", () => {
  const text = "안녕하세요. 반갑습니다.";
  const out = alignTokensToText(["안녕하세요", "없는토큰", "반갑습니다"], text);
  assert.deepEqual(out, ["안녕하세요.", "없는토큰", "반갑습니다."]);
});

test("alignTokensToText — 한 어절이 두 토큰으로 쪼개진 경우 중복 없이 복원", () => {
  const text = "3.5퍼센트 올랐습니다.";
  const out = alignTokensToText(["3.5", "퍼센트", "올랐습니다"], text);
  assert.deepEqual(out, ["3.5", "퍼센트", "올랐습니다."]);
});

test("alignTokensToText — 멀리서 우연히 일치하는 토큰은 무시, 가까우면(토큰 누락) 건너뛰고 정렬", () => {
  // 40자 넘게 떨어진 '다.'는 우연한 일치로 보고 토큰 그대로
  const far = "가 " + "나".repeat(60) + " 다.";
  assert.deepEqual(alignTokensToText(["가", "다"], far), ["가", "다"]);
  // Edge가 중간 토큰(2026년)을 빠뜨려도 가까운 다음 토큰은 정렬된다
  const near = "가 2026년 다.";
  assert.deepEqual(alignTokensToText(["가", "다"], near), ["가", "다."]);
});

test("restorePunctuation — 타이밍은 보존하고 텍스트만 바꾼다", () => {
  const words: WordTiming[] = [
    { text: "첫", startMs: 100, endMs: 300 },
    { text: "문장입니다", startMs: 350, endMs: 900 },
  ];
  const out = restorePunctuation(words, "첫 문장입니다.");
  assert.deepEqual(out, [
    { text: "첫", startMs: 100, endMs: 300 },
    { text: "문장입니다.", startMs: 350, endMs: 900 },
  ]);
});

test("trimmedDurationMs — 단어 있음: min(파일, 마지막 단어 끝 + 250)", () => {
  const words: WordTiming[] = [{ text: "a", startMs: 0, endMs: 4000 }];
  assert.equal(trimmedDurationMs(5100, words), 4250);
  assert.equal(trimmedDurationMs(4100, words), 4100);
});

test("trimmedDurationMs — 단어 없음: 파일 − 600, 하한 500", () => {
  assert.equal(trimmedDurationMs(5000, []), 4400);
  assert.equal(trimmedDurationMs(900, []), 500);
  assert.equal(trimmedDurationMs(300, []), 300);
});

test("sanitizeWords — 단조 증가·상한 적용·빈 텍스트 제거", () => {
  const out = sanitizeWords(
    [
      { text: "a", startMs: 0, endMs: 500 },
      { text: " ", startMs: 500, endMs: 600 },
      { text: "b", startMs: 400, endMs: 900 },
      { text: "c", startMs: 950, endMs: 2000 },
    ],
    1500,
  );
  assert.deepEqual(out, [
    { text: "a", startMs: 0, endMs: 500 },
    { text: "b", startMs: 500, endMs: 900 },
    { text: "c", startMs: 950, endMs: 1500 },
  ]);
});

test("measuredCharsPerMinute — 총 글자 / (Σ ms / 60000)", () => {
  assert.equal(measuredCharsPerMinute([{ chars: 200, durationMs: 30_000 }]), 400);
  assert.equal(
    measuredCharsPerMinute([
      { chars: 100, durationMs: 10_000 },
      { chars: 100, durationMs: 20_000 },
    ]),
    400,
  );
  assert.equal(measuredCharsPerMinute([]), 0);
  assert.equal(measuredCharsPerMinute([{ chars: 10, durationMs: 0 }]), 0);
});
