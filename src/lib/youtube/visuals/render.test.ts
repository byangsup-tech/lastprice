import test from "node:test";
import assert from "node:assert/strict";
import { dedupeCredits, kenBurnsForIndex, toFileUrl, type CreditEntry } from "./render";
import { shrinkFontSize } from "./thumbnail";

test("kenBurnsForIndex — in→right→out→left 순환", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 7].map(kenBurnsForIndex), ["in", "right", "out", "left", "in", "right", "left"]);
});

test("toFileUrl — 공백·한글 인코딩", () => {
  assert.equal(toFileUrl("/a b/한글.png"), "file:///a%20b/%ED%95%9C%EA%B8%80.png");
  assert.equal(toFileUrl("C:\\x\\y.png"), "file:///C%3A/x/y.png");
});

test("dedupeCredits — 같은 URL·종류는 한 번만, 순서 유지", () => {
  const e = (sceneId: string, url: string, kind: CreditEntry["kind"] = "photo"): CreditEntry => ({
    provider: "pexels",
    by: "x",
    url,
    kind,
    sceneId,
    file: "/f",
  });
  const out = dedupeCredits([e("s1", "u1"), e("s2", "u2"), e("s3", "u1"), e("s4", "u1", "video")]);
  assert.deepEqual(out.map((c) => c.sceneId), ["s1", "s2", "s4"]);
});

test("shrinkFontSize — 10% 축소, 정수, 하한", () => {
  assert.equal(shrinkFontSize(150), 135);
  assert.equal(shrinkFontSize(135), 121);
  assert.equal(shrinkFontSize(121), 108);
  assert.equal(shrinkFontSize(10), 24);
});
