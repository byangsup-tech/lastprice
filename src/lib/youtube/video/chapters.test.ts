import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../config";
import { demoScript, templateScript } from "../script/template";
import { buildTimeline } from "../timeline";
import type { SceneAudio, Topic } from "../types";
import { applyChapters, chapterMarkers, composeDescription, formatChapterLines, stripGeneratedSections } from "./chapters";

const topic: Topic = { title: "금리 인하", keywords: ["interest"], sourceUrls: [], news: [] };

function audiosFor(scenes: { id: string; narration: string }[], msPerChar: number): SceneAudio[] {
  return scenes.map((s) => ({ sceneId: s.id, file: "", durationMs: s.narration.length * msPerChar, words: [] }));
}

test("chapterMarkers — 인트로 0:00 + 챕터 + 마무리, 10초 규칙", () => {
  const script = templateScript({ topic, profile: DEFAULT_PROFILE });
  const tl = buildTimeline(audiosFor(script.scenes, 180));
  const markers = chapterMarkers(script, tl);
  assert.ok(markers.length >= 4, String(markers.length));
  assert.equal(markers[0].startMs, 0);
  assert.equal(markers[0].title, "인트로");
  assert.equal(markers[1].title, script.chapters[0].title);
  assert.equal(markers[markers.length - 1].title, "마무리");
  for (let i = 1; i < markers.length; i++) assert.ok(markers[i].startMs - markers[i - 1].startMs >= 10_000);
  assert.match(formatChapterLines(markers), /^0:00 인트로\n\d+:\d\d /);
});

test("chapterMarkers — 너무 짧으면 빈 배열 (유튜브가 무시하므로)", () => {
  const script = demoScript(DEFAULT_PROFILE);
  const tl = buildTimeline(audiosFor(script.scenes, 20)); // 장면당 1~2초
  assert.deepEqual(chapterMarkers(script, tl), []);
});

test("composeDescription/applyChapters — 재실행 시 섹션 중복 없음, 꺾쇠 제거", () => {
  const markers = [
    { title: "인트로", startMs: 0 },
    { title: "본론", startMs: 65_000 },
    { title: "마무리", startMs: 130_000 },
  ];
  const meta = applyChapters(
    { title: "t", description: "본문 <b>설명</b>", tags: [], chapters: [], categoryId: "27", language: "ko" },
    markers,
    150_000,
    ["영상 소스: Pexels (photographer A)"],
  );
  assert.match(meta.description, /본문 b설명\/b\n\n타임라인\n0:00 인트로\n1:05 본론\n2:10 마무리\n\n영상 소스: Pexels/);
  const again = applyChapters(meta, markers, 150_000);
  assert.equal((again.description.match(/타임라인/g) ?? []).length, 1);
  assert.equal(stripGeneratedSections(again.description), "본문 b설명/b");
  assert.equal(composeDescription("x".repeat(6000), []).length, 5000);
});
