import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeDescription, sanitizeMetadata, sanitizeTags, sanitizeTitle } from "./metadata";

test("sanitizeTitle — 꺾쇠 제거, 100자 컷", () => {
  assert.deepEqual(sanitizeTitle("실손보험 <5세대> 정리"), { value: "실손보험 5세대 정리", changed: true });
  const long = Array.from({ length: 30 }, (_, i) => `단어${i}`).join(" ");
  const t = sanitizeTitle(long);
  assert.ok(t.value.length <= 100);
  assert.ok(t.value.endsWith("…"));
});

test("sanitizeDescription — 5000바이트, 타임라인 보존", () => {
  const body = Array.from({ length: 400 }, (_, i) => `본문 줄 ${i} 한글 텍스트입니다.`).join("\n");
  const timeline = "\n\n타임라인\n0:00 인트로\n1:20 본론\n5:00 마무리";
  const r = sanitizeDescription(body + timeline);
  assert.ok(Buffer.byteLength(r.value, "utf8") <= 5000);
  assert.ok(r.value.endsWith("5:00 마무리"));
  assert.ok(r.value.includes("타임라인"));
  assert.equal(sanitizeDescription("짧은 <b>설명</b>").value, "짧은 b설명/b");
});

test("sanitizeTags — 15개, 480자(공백 태그 +2), 중복 제거", () => {
  const tags = Array.from({ length: 40 }, (_, i) => (i % 2 ? `태그 ${i}` : `태그${i}`));
  const r = sanitizeTags([...tags, "태그0", "<x>"]);
  assert.ok(r.value.length <= 15);
  const total = r.value.reduce((n, t) => n + t.length + (t.includes(" ") ? 2 : 0), 0);
  assert.ok(total <= 480);
  assert.ok(!r.value.includes("<x>"));
  assert.equal(new Set(r.value).size, r.value.length);
});

test("sanitizeMetadata — notes", () => {
  const { meta, notes } = sanitizeMetadata({
    title: "제목",
    description: "설명",
    tags: ["a", "a"],
    chapters: [],
    categoryId: "27",
    language: "ko",
  });
  assert.equal(meta.tags.length, 1);
  assert.ok(notes.some((n) => n.startsWith("태그 정제")));
});
