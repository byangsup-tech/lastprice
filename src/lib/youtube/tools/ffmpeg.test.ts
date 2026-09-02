import test from "node:test";
import assert from "node:assert/strict";
import {
  concatListLine,
  escapeFilterPath,
  parseDurationMs,
  parseTimestampMs,
} from "./ffmpeg";

test("parseTimestampMs", () => {
  assert.equal(parseTimestampMs("00:00:05.85"), 5850);
  assert.equal(parseTimestampMs("01:02:03.5"), 3_723_500);
  assert.equal(parseTimestampMs("garbage"), null);
});

test("parseDurationMs — Duration 우선, 없으면 마지막 time=", () => {
  const stderr = `Input #0, mp3, from 'x.mp3':\n  Duration: 00:00:05.85, start: 0.025057, bitrate: 96 kb/s\nsize=N/A time=00:00:05.82 bitrate=N/A`;
  assert.equal(parseDurationMs(stderr), 5850);
  assert.equal(parseDurationMs("size=N/A time=00:00:01.00 x\nsize=N/A time=00:00:02.50"), 2500);
  assert.equal(parseDurationMs("nothing"), null);
});

test("escapeFilterPath — 콜론·따옴표·쉼표 이스케이프", () => {
  assert.equal(escapeFilterPath("/a/b c.srt"), "/a/b c.srt");
  assert.equal(escapeFilterPath("C:\\x\\y.srt"), "C\\:/x/y.srt");
  assert.equal(escapeFilterPath("a,b[1].srt"), "a\\,b\\[1\\].srt");
});

test("concatListLine — 작은따옴표 처리", () => {
  assert.equal(concatListLine("/x/a.mp4"), "file '/x/a.mp4'");
  assert.equal(concatListLine("/x/it's.mp4"), "file '/x/it'\\''s.mp4'");
});
