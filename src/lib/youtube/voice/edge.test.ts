import test from "node:test";
import assert from "node:assert/strict";
import { escapeSsml, parseEdgeMetadata, scanJsonObjects } from "./edge";

const item = (text: string, offset: number, duration: number, type = "WordBoundary") =>
  JSON.stringify({
    Type: type,
    Data: { Offset: offset, Duration: duration, text: { Text: text, Length: text.length, BoundaryType: type } },
  });

test("escapeSsml — & < > \" 만 이스케이프", () => {
  assert.equal(escapeSsml(`A & B <c> "d" 'e'`), `A &amp; B &lt;c&gt; &quot;d&quot; 'e'`);
  assert.equal(escapeSsml("한글 그대로."), "한글 그대로.");
});

test("parseEdgeMetadata — 단일 JSON 객체 (msedge-tts toFile 형식)", () => {
  const raw = `{ "Metadata": [ ${item("첫", 1_000_000, 2_500_000)}, ${item("번째", 4_000_000, 3_000_000)} ] }`;
  const words = parseEdgeMetadata(raw);
  assert.deepEqual(words, [
    { text: "첫", startMs: 100, endMs: 350 },
    { text: "번째", startMs: 400, endMs: 700 },
  ]);
});

test("parseEdgeMetadata — SentenceBoundary는 제외, 빈 텍스트 제외", () => {
  const raw = `{ "Metadata": [ ${item("문장.", 0, 9_000_000, "SentenceBoundary")}, ${item("단어", 500_000, 1_000_000)}, ${item("  ", 700_000, 1_000_000)} ] }`;
  const words = parseEdgeMetadata(raw);
  assert.deepEqual(words, [{ text: "단어", startMs: 50, endMs: 150 }]);
});

test("parseEdgeMetadata — 여러 JSON 객체가 이어진 스트림(줄바꿈/공백 구분)도 파싱", () => {
  const raw =
    `{"Metadata":[${item("하나", 0, 1_000_000)}]}\n` +
    `{"Metadata":[${item("둘", 2_000_000, 1_000_000)}]}` +
    `{"Metadata":[${item("셋", 4_000_000, 1_000_000)}]}`;
  const words = parseEdgeMetadata(raw);
  assert.deepEqual(
    words.map((w) => w.text),
    ["하나", "둘", "셋"],
  );
  assert.equal(words[2].startMs, 400);
});

test("parseEdgeMetadata — 손상된 조각은 건너뛰고 나머지는 살린다 / 빈 입력은 []", () => {
  const raw = `{"Metadata":[${item("하나", 0, 1_000_000)}]}\n{"Metadata":[{"Type":"WordBoundary","Data":{"Offset":` +
    `\n{"Metadata":[${item("둘", 2_000_000, 1_000_000)}]}`;
  const words = parseEdgeMetadata(raw);
  assert.deepEqual(
    words.map((w) => w.text),
    ["하나", "둘"],
  );
  assert.deepEqual(parseEdgeMetadata(""), []);
  assert.deepEqual(parseEdgeMetadata("   \n"), []);
});

test("scanJsonObjects — 문자열 안의 중괄호는 무시", () => {
  const objs = scanJsonObjects(`{"a":"}{"} {"b":"\\"{"}`);
  assert.deepEqual(objs, [{ a: "}{" }, { b: '"{' }]);
});
