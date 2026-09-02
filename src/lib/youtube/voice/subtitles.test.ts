import test from "node:test";
import assert from "node:assert/strict";
import { buildTimeline, sceneFrames, framesToMs } from "../timeline";
import type { SceneAudio, WordTiming } from "../types";
import { buildCaptions, parseSrt, proportionalWords, toSrt } from "./subtitles";

function words(text: string, msPerChar = 180): WordTiming[] {
  let t = 0;
  return text.split(" ").map((w) => {
    const start = t;
    t += w.length * msPerChar;
    const out = { text: w, startMs: start, endMs: t };
    t += 60;
    return out;
  });
}

test("sceneFrames/buildTimeline — 40ms 프레임 양자화, 최소 1초", () => {
  assert.equal(sceneFrames(0), 25);
  assert.equal(sceneFrames(5850), Math.round((5850 + 350) / 40));
  const tl = buildTimeline([
    { sceneId: "s01", file: "", durationMs: 5850, words: [] },
    { sceneId: "s02", file: "", durationMs: 3010, words: [] },
  ]);
  assert.equal(tl.scenes[0].startMs, 0);
  assert.equal(tl.scenes[0].endMs % 40, 0);
  assert.equal(tl.scenes[1].startMs, tl.scenes[0].endMs);
  assert.equal(tl.totalMs, tl.scenes[1].endMs);
  assert.equal(framesToMs(sceneFrames(5850)), tl.scenes[0].endMs);
});

test("buildCaptions — 문장 단위 분리, 겹침 없음, 단조 증가", () => {
  const narration = "첫 번째 문장입니다. 두 번째 문장은 조금 더 길어서 한 줄을 넘길 수도 있습니다. 셋째!";
  const w = words(narration);
  const dur = w[w.length - 1].endMs + 100;
  const audios: SceneAudio[] = [
    { sceneId: "s01", file: "", durationMs: dur, words: w },
    { sceneId: "s02", file: "", durationMs: dur, words: w },
  ];
  const tl = buildTimeline(audios);
  const caps = buildCaptions(audios, tl);
  assert.ok(caps.length >= 4, `captions=${caps.length}`);
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    assert.equal(c.index, i + 1);
    assert.ok(c.endMs > c.startMs);
    assert.ok(c.text.split("\n").length <= 2);
    for (const line of c.text.split("\n")) assert.ok(line.length <= 20 + 8, line);
    if (i > 0) assert.ok(c.startMs >= caps[i - 1].endMs, `overlap at ${i}`);
  }
  // 두 번째 장면 캡션은 장면 시작 오프셋 이후
  const second = caps.filter((c) => c.startMs >= tl.scenes[1].startMs);
  assert.ok(second.length >= 2);
  assert.ok(caps.every((c) => c.endMs <= tl.totalMs));
});

test("buildCaptions — 단어 타이밍 없으면 비례 배분", () => {
  const audios: SceneAudio[] = [{ sceneId: "s01", file: "", durationMs: 3000, words: [] }];
  const tl = buildTimeline(audios);
  const caps = buildCaptions(audios, tl);
  assert.equal(caps.length, 0, "텍스트도 없으면 캡션 없음");
  const pw = proportionalWords("안녕하세요 반갑습니다 테스트입니다.", 3000);
  assert.equal(pw.length, 3);
  assert.equal(pw[0].startMs, 0);
  assert.ok(pw[2].endMs <= 3000);
});

test("toSrt/parseSrt 왕복", () => {
  const caps = [
    { index: 1, startMs: 0, endMs: 1500, text: "안녕하세요" },
    { index: 2, startMs: 1540, endMs: 3000, text: "두 줄\n자막" },
  ];
  const srt = toSrt(caps);
  assert.match(srt, /^1\n00:00:00,000 --> 00:00:01,500\n안녕하세요\n\n2\n/);
  assert.deepEqual(parseSrt(srt), caps);
});
