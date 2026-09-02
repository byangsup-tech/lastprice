import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../config";
import type { Topic } from "../types";
import { LIMITS, SCRIPT_JSON_SCHEMA, ScriptValidationError, scenesByChapter, validateScript } from "./schema";
import { buildTemplateOutput, demoScript, templateScript } from "./template";

const topic: Topic = {
  title: "실손보험 개편",
  keywords: ["insurance", "health"],
  sourceUrls: ["https://example.com/a"],
  news: [
    { title: "실손보험 5세대 출시 임박 - 한국경제", url: "https://example.com/n1" },
    { title: "비급여 관리 강화, 보험료 오르나 - 연합뉴스", url: "https://example.com/n2" },
  ],
};

function walk(schema: unknown, path: string, errors: string[]) {
  if (!schema || typeof schema !== "object") return;
  const s = schema as Record<string, unknown>;
  if (s.type === "object") {
    if (s.additionalProperties !== false) errors.push(`${path}: additionalProperties:false 누락`);
    const props = (s.properties ?? {}) as Record<string, unknown>;
    const required = (s.required ?? []) as string[];
    for (const k of Object.keys(props)) {
      if (!required.includes(k)) errors.push(`${path}.${k}: required 누락`);
      walk(props[k], `${path}.${k}`, errors);
    }
  }
  for (const key of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems", "pattern"]) {
    if (key in s) errors.push(`${path}: 지원되지 않는 제약 ${key}`);
  }
  if (Array.isArray(s.anyOf)) s.anyOf.forEach((x, i) => walk(x, `${path}.anyOf[${i}]`, errors));
  if (s.items) walk(s.items, `${path}[]`, errors);
}

test("SCRIPT_JSON_SCHEMA — Anthropic 구조화 출력 제약 준수", () => {
  const errors: string[] = [];
  walk(SCRIPT_JSON_SCHEMA, "$", errors);
  assert.deepEqual(errors, []);
});

test("템플릿 대본이 검증을 통과하고 구조가 올바르다", () => {
  const script = templateScript({ topic, profile: DEFAULT_PROFILE });
  assert.equal(script.generator, "template");
  assert.equal(script.scenes[0].layout, "title");
  assert.equal(script.scenes[script.scenes.length - 1].layout, "outro");
  assert.equal(script.chapters.length, 3);
  assert.ok(script.scenes.length >= 8);
  // 각 챕터의 첫 장면은 chapter 카드 + 챕터 제목
  const firstOfChapter = script.scenes.filter((s) => s.layout === "chapter");
  assert.deepEqual(firstOfChapter.map((s) => s.heading), script.chapters.map((c) => c.title));
  // id/index 연속
  script.scenes.forEach((s, i) => {
    assert.equal(s.index, i);
    assert.equal(s.id, `s${String(i + 1).padStart(2, "0")}`);
    assert.ok(s.narration.length >= LIMITS.narrationMin);
    assert.ok(s.narration.length <= LIMITS.narrationMax);
    assert.ok(s.visualKeywords.length >= 1);
  });
  assert.ok(script.estimatedMinutes > 0.5);
  assert.ok(script.sources.includes("https://example.com/a"));
  assert.ok(script.tags.length <= LIMITS.tagsMax);
  const groups = scenesByChapter(script);
  assert.equal(groups[0].title, "인트로");
  assert.equal(groups[groups.length - 1].title, "아웃트로");
});

test("데모 대본 — 6장면 이상, 약 1분", () => {
  const script = demoScript(DEFAULT_PROFILE);
  assert.ok(script.scenes.length >= 6);
  assert.ok(script.estimatedMinutes >= 0.6 && script.estimatedMinutes <= 2.5, String(script.estimatedMinutes));
});

test("validateScript — 정규화: 긴 나레이션 분할, 태그 제한, 레이아웃 강등, 꺾쇠 제거", () => {
  const out = buildTemplateOutput({ topic, profile: DEFAULT_PROFILE });
  const longNarration = Array.from({ length: 24 }, (_, i) => `이것은 ${i + 1}번째 문장으로 길이를 늘리기 위한 문장입니다.`).join(" ");
  out.chapters[0].scenes.push({
    layout: "bullets",
    narration: longNarration,
    heading: "제목<b>",
    bullets: [],
    stat: null,
    quote: null,
    visualKeywords: [],
  });
  out.tags = Array.from({ length: 30 }, (_, i) => `태그${i}`);
  out.title = "제목 <script>";
  const script = validateScript(out, { topic, profile: DEFAULT_PROFILE, generator: "template" });
  const split = script.scenes.filter((s) => s.heading === "제목<b>");
  assert.ok(split.length >= 2, "긴 나레이션은 여러 장면으로");
  assert.ok(split.every((s) => s.layout === "plain"), "bullets 없으면 plain으로 강등");
  assert.ok(split.every((s) => s.visualKeywords.includes("insurance")), "키워드 폴백");
  assert.equal(script.tags.length, LIMITS.tagsMax);
  assert.equal(script.title, "제목 script");
});

test("validateScript — 치명적 오류는 예외", () => {
  assert.throws(
    () => validateScript({ title: "x" }, { topic, profile: DEFAULT_PROFILE, generator: "template" }),
    (err: unknown) => err instanceof ScriptValidationError && err.reasons.some((r) => /장면 수 부족|챕터 없음/.test(r)),
  );
});
