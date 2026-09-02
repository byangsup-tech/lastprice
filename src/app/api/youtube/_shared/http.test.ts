import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_PROFILE } from "@/lib/youtube/config";
import { validateScript } from "@/lib/youtube/script/schema";
import { templateScript } from "@/lib/youtube/script/template";
import type { Topic } from "@/lib/youtube/types";
import {
  buildRunArgs,
  contentTypeFor,
  looksLikeScript,
  parseCreateJobBody,
  parseRange,
  scriptToLlmOutput,
} from "./http";

describe("parseRange", () => {
  it("헤더 없음 → null (전체 응답)", () => {
    assert.equal(parseRange(null, 100), null);
    assert.equal(parseRange(undefined, 100), null);
    assert.equal(parseRange("", 100), null);
  });
  it("bytes=0-99", () => {
    assert.deepEqual(parseRange("bytes=0-99", 1000), { start: 0, end: 99 });
  });
  it("열린 범위는 끝까지, 끝은 크기로 클램프", () => {
    assert.deepEqual(parseRange("bytes=500-", 1000), { start: 500, end: 999 });
    assert.deepEqual(parseRange("bytes=0-5000", 1000), { start: 0, end: 999 });
  });
  it("접미사 범위 bytes=-100 → 마지막 100바이트", () => {
    assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
    assert.deepEqual(parseRange("bytes=-5000", 1000), { start: 0, end: 999 });
  });
  it("만족 불가 → invalid (416)", () => {
    assert.equal(parseRange("bytes=1000-", 1000), "invalid");
    assert.equal(parseRange("bytes=-", 1000), "invalid");
    assert.equal(parseRange("bytes=-0", 1000), "invalid");
    assert.equal(parseRange("bytes=50-10", 1000), "invalid");
    assert.equal(parseRange("bytes=0-", 0), "invalid");
  });
  it("다중 범위·다른 단위 → null (전체 응답)", () => {
    assert.equal(parseRange("bytes=0-1,5-9", 1000), null);
    assert.equal(parseRange("items=0-1", 1000), null);
  });
});

describe("contentTypeFor", () => {
  it("확장자별 매핑", () => {
    assert.equal(contentTypeFor("final.mp4"), "video/mp4");
    assert.equal(contentTypeFor("thumbnail.png"), "image/png");
    assert.equal(contentTypeFor("thumbnail.jpg"), "image/jpeg");
    assert.equal(contentTypeFor("frames/scene-001.png"), "image/png");
    assert.equal(contentTypeFor("audio/scene-001.mp3"), "audio/mpeg");
    assert.match(contentTypeFor("subtitles.srt"), /^text\/plain/);
    assert.match(contentTypeFor("script.json"), /^application\/json/);
    assert.match(contentTypeFor("logs/pipeline.log"), /^text\/plain/);
    assert.equal(contentTypeFor("weird.bin"), "application/octet-stream");
  });
});

describe("buildRunArgs", () => {
  it("빈 본문 → 인자 없음", () => {
    const r = buildRunArgs({});
    assert.ok(r.ok);
    if (r.ok) assert.deepEqual(r.args, []);
  });
  it("검증된 단계·불리언만 인자로", () => {
    const r = buildRunArgs({ from: "voice", to: "thumbnail", force: true, upload: false });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.args, ["--from", "voice", "--to", "thumbnail", "--force"]);
      assert.deepEqual(r.request, { from: "voice", to: "thumbnail", force: true, upload: false });
    }
  });
  it("알 수 없는 단계·주입 시도 거부", () => {
    assert.equal(buildRunArgs({ from: "voice; rm -rf /" }).ok, false);
    assert.equal(buildRunArgs({ to: "--help" }).ok, false);
    assert.equal(buildRunArgs({ force: "yes" }).ok, false);
    assert.equal(buildRunArgs({ privacy: "secret" }).ok, false);
    assert.equal(buildRunArgs({ publishAt: "내일" }).ok, false);
  });
  it("from > to 는 오류", () => {
    assert.equal(buildRunArgs({ from: "render", to: "script" }).ok, false);
  });
  it("publishAt이 있으면 privacy는 private으로 강제 + ISO 정규화", () => {
    const r = buildRunArgs({ upload: true, privacy: "public", publishAt: "2026-09-10T09:00:00+09:00" });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.args, [
        "--upload",
        "--privacy",
        "private",
        "--publish-at",
        "2026-09-10T00:00:00.000Z",
      ]);
    }
  });
});

describe("scriptToLlmOutput", () => {
  const topic: Topic = {
    title: "실손보험 개편, 무엇이 달라지나",
    keywords: ["실손보험"],
    sourceUrls: ["https://example.com/a"],
    news: [
      { title: "실손보험 개편안 발표 - 매체", url: "https://example.com/1" },
      { title: "보험료 인상 우려 - 매체", url: "https://example.com/2" },
    ],
  };
  const script = templateScript({ topic, profile: DEFAULT_PROFILE });

  it("Script → LlmScriptOutput → validateScript 왕복이 장면 수·챕터를 보존한다", () => {
    const out = scriptToLlmOutput(script);
    assert.equal(out.hook.layout, "title");
    assert.equal(out.outro.layout, "outro");
    assert.equal(out.chapters.length, script.chapters.length);
    const again = validateScript(out, { topic, profile: DEFAULT_PROFILE, generator: "template" });
    assert.equal(again.scenes.length, script.scenes.length);
    assert.deepEqual(
      again.scenes.map((s) => s.layout),
      script.scenes.map((s) => s.layout),
    );
    assert.deepEqual(
      again.chapters.map((c) => c.title),
      script.chapters.map((c) => c.title),
    );
    assert.equal(again.title, script.title);
  });

  it("편집된 나레이션·제목이 반영된다", () => {
    const edited = {
      ...script,
      title: "수정된 제목",
      scenes: script.scenes.map((s, i) =>
        i === 2 ? { ...s, narration: "이 문장은 대시보드에서 수정한 나레이션입니다. 두 번째 문장도 있습니다." } : s,
      ),
    };
    const again = validateScript(scriptToLlmOutput(edited), {
      topic,
      profile: DEFAULT_PROFILE,
      generator: "template",
    });
    assert.equal(again.title, "수정된 제목");
    assert.match(again.scenes[2].narration, /대시보드에서 수정한/);
  });

  it("looksLikeScript는 scenes 배열 유무로 판별", () => {
    assert.equal(looksLikeScript(script), true);
    assert.equal(looksLikeScript(scriptToLlmOutput(script)), false);
    assert.equal(looksLikeScript(null), false);
  });
});

describe("parseCreateJobBody", () => {
  it("topic.title 2~120자 검증", () => {
    assert.equal(parseCreateJobBody({ topic: { title: "a" } }).ok, false);
    assert.equal(parseCreateJobBody({ topic: { title: "x".repeat(121) } }).ok, false);
    assert.equal(parseCreateJobBody({}).ok, false);
    const r = parseCreateJobBody({ topic: { title: "  테스트   주제 ", angle: "각도", keywords: ["a", " b ", 3] } });
    assert.ok(r.ok);
    if (r.ok) {
      assert.deepEqual(r.body.topic, { title: "테스트 주제", angle: "각도", keywords: ["a", "b"], sourceUrls: [] });
    }
  });
  it("candidateId 우선 + 옵션 검증", () => {
    const r = parseCreateJobBody({ candidateId: "abc123", options: { privacy: "unlisted", upload: true } });
    assert.ok(r.ok);
    if (r.ok) {
      assert.equal(r.body.candidateId, "abc123");
      assert.deepEqual(r.body.options, { privacy: "unlisted", upload: true });
    }
    assert.equal(parseCreateJobBody({ candidateId: "../x" }).ok, false);
    assert.equal(parseCreateJobBody({ topic: { title: "주제" }, options: { privacy: "x" } }).ok, false);
    const p = parseCreateJobBody({ topic: { title: "주제" }, options: { privacy: "public", publishAt: "2026-09-10T00:00:00Z" } });
    assert.ok(p.ok);
    if (p.ok) assert.equal(p.body.options.privacy, "private");
  });
});
