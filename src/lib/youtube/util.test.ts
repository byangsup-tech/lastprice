import test from "node:test";
import assert from "node:assert/strict";
import {
  clampText,
  cleanNarration,
  escapeHtml,
  formatChapterTime,
  formatSrtTime,
  hashId,
  normalizeKey,
  parseDotenv,
  sceneNo,
  slugify,
  splitSentences,
} from "./util";

test("hashId는 결정적이고 base36", () => {
  assert.equal(hashId("abc"), hashId("abc"));
  assert.match(hashId("유튜브"), /^[0-9a-z]+$/);
});

test("slugify — 한글 유지, 특수문자 제거", () => {
  assert.equal(slugify("  실손보험, 이렇게 바뀐다!  "), "실손보험-이렇게-바뀐다");
  assert.equal(slugify("!!!"), "untitled");
});

test("normalizeKey — 공백·구두점 제거 후 비교", () => {
  assert.equal(normalizeKey("실손 보험 개편!"), normalizeKey("실손보험개편"));
});

test("clampText — 말줄임", () => {
  assert.equal(clampText("가나다라마", 10), "가나다라마");
  assert.equal(clampText("가나다라마바사", 4), "가나다…");
});

test("formatSrtTime / formatChapterTime", () => {
  assert.equal(formatSrtTime(0), "00:00:00,000");
  assert.equal(formatSrtTime(61_234), "00:01:01,234");
  assert.equal(formatSrtTime(3_600_000 + 5), "01:00:00,005");
  assert.equal(formatChapterTime(0), "0:00");
  assert.equal(formatChapterTime(83_900), "1:23");
  assert.equal(formatChapterTime(3_725_000), "1:02:05");
});

test("splitSentences — 종결 부호 기준, 소수점 보존", () => {
  const s = splitSentences("금리가 3.5%로 올랐습니다. 왜 그럴까요? 지금부터 살펴봅니다!");
  assert.deepEqual(s, [
    "금리가 3.5%로 올랐습니다.",
    "왜 그럴까요?",
    "지금부터 살펴봅니다!",
  ]);
  assert.deepEqual(splitSentences("종결 부호 없음"), ["종결 부호 없음"]);
  assert.deepEqual(splitSentences('그는 "끝났다." 라고 말했다.'), [
    '그는 "끝났다."',
    "라고 말했다.",
  ]);
});

test("cleanNarration — 마크다운·이모지 제거, 종결 부호 보장", () => {
  assert.equal(cleanNarration("**중요**  내용입니다 🚀"), "중요 내용입니다.");
  assert.equal(cleanNarration("이미 끝남."), "이미 끝남.");
});

test("escapeHtml", () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

test("sceneNo — 2자리, 100장면 이상이면 3자리", () => {
  assert.equal(sceneNo(0), "01");
  assert.equal(sceneNo(9, 40), "10");
  assert.equal(sceneNo(0, 120), "001");
});

test("parseDotenv — 주석·따옴표·export 처리", () => {
  const env = parseDotenv(`# comment\nA=1\nexport B="two words"\nC='x' \nD=val # trailing\n=bad\n`);
  assert.deepEqual(env, { A: "1", B: "two words", C: "x", D: "val" });
});
