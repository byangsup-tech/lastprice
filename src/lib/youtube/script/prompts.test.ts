import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PROFILE } from "../config";
import type { Topic, TopicCandidate } from "../types";
import {
  CONTENT_SCENE_MAX,
  CONTENT_SCENE_MIN,
  RERANK_JSON_SCHEMA,
  buildRerankPrompts,
  buildSystemPrompt,
  buildUserPrompt,
  chapterCountFor,
  scriptBudget,
  validateRerank,
} from "./prompts";
import { charsPerMinute } from "./schema";

const topic: Topic = {
  title: "실손보험 개편",
  angle: "5세대 실손 전환, 누가 이득인가",
  keywords: ["실손보험", "insurance"],
  sourceUrls: ["https://example.com/src"],
  news: [
    { title: "실손보험 5세대 출시 임박 - 한국경제", url: "https://example.com/n1", source: "한국경제", publishedAt: "2026-09-01T00:00:00Z" },
    { title: "비급여 관리 강화, 보험료 오르나 - 연합뉴스", url: "https://example.com/n2" },
  ],
};

test("scriptBudget — 10분 × 402자/분 → 4020자, 챕터 5개, 장면 ≈ 37개", () => {
  const cpm = charsPerMinute("+5%");
  assert.equal(cpm, 402);
  const b = scriptBudget(10, cpm);
  assert.equal(b.targetChars, 4020);
  assert.equal(b.minChars, 3216);
  assert.equal(b.chapterCount, 5);
  assert.equal(b.sceneCount, 37);
  assert.equal(b.contentScenesPerChapter, 6);
});

test("chapterCountFor — 8~12분 5개, 12분 초과 6개, 짧으면 3~4개", () => {
  assert.equal(chapterCountFor(8), 5);
  assert.equal(chapterCountFor(12), 5);
  assert.equal(chapterCountFor(13), 6);
  assert.equal(chapterCountFor(15), 6);
  assert.equal(chapterCountFor(6), 4);
  assert.equal(chapterCountFor(3), 3);
});

test("buildSystemPrompt — 채널 정보·CTA·규칙 포함, 날짜 등 가변 내용 없음(캐시 안정)", () => {
  const s = buildSystemPrompt(DEFAULT_PROFILE);
  assert.ok(s.includes(DEFAULT_PROFILE.name));
  assert.ok(s.includes(DEFAULT_PROFILE.niche));
  assert.ok(s.includes(DEFAULT_PROFILE.cta));
  assert.ok(s.includes("존댓말"));
  assert.ok(s.includes("24자"));
  assert.ok(s.includes("JSON"));
  assert.equal(buildSystemPrompt(DEFAULT_PROFILE), s, "동일 프로필 → 동일 프롬프트");
  assert.doesNotMatch(s, /20\d\d-\d\d-\d\d/);
});

test("buildUserPrompt — 계산된 예산(총 글자·최소 글자·챕터·장면 수·장면 길이)과 뉴스·URL이 들어간다", () => {
  const cpm = charsPerMinute(DEFAULT_PROFILE.voiceRate);
  const u = buildUserPrompt({ topic, profile: DEFAULT_PROFILE, targetMinutes: 10, cpm });
  const b = scriptBudget(10, cpm);
  assert.ok(u.includes(`${b.targetChars}자`), "targetChars");
  assert.ok(u.includes(`최소 ${b.minChars}자`), "minChars");
  assert.ok(u.includes(`챕터 ${b.chapterCount}개`), "chapterCount");
  assert.ok(u.includes(`본문 장면 ${b.contentScenesPerChapter}개 이상`), "scenes per chapter");
  assert.ok(u.includes(`약 ${b.sceneCount}개`), "sceneCount");
  assert.ok(u.includes(`${CONTENT_SCENE_MIN}~${CONTENT_SCENE_MAX}자`), "scene length");
  assert.ok(u.includes(`분당 약 ${cpm}자`), "cpm");
  assert.ok(u.includes("10분"));
  assert.ok(u.includes(topic.title));
  assert.ok(u.includes(topic.angle!));
  assert.ok(u.includes("실손보험 5세대 출시 임박"), "헤드라인 (매체 꼬리 제거)");
  assert.ok(!u.includes("임박 - 한국경제"));
  assert.ok(u.includes("(한국경제, 2026-09-01)"));
  assert.ok(u.includes("https://example.com/n2"));
  assert.ok(u.includes("https://example.com/src"));
  assert.ok(!u.includes("확장 지시"));
});

test("buildUserPrompt — 뉴스 override로 절반만 전달, 뉴스 없으면 안내문", () => {
  const cpm = 400;
  const half = buildUserPrompt({ topic, profile: DEFAULT_PROFILE, targetMinutes: 8, cpm, news: topic.news!.slice(0, 1) });
  assert.ok(half.includes("https://example.com/n1"));
  assert.ok(!half.includes("https://example.com/n2"));
  const none = buildUserPrompt({ topic: { ...topic, news: [] }, profile: DEFAULT_PROFILE, targetMinutes: 8, cpm });
  assert.ok(none.includes("제공된 뉴스 없음"));
});

test("buildUserPrompt — 확장 패스: 직전 JSON·현재 글자 수·추가 목표 포함", () => {
  const previous = { title: "이전", chapters: [{ title: "1부", scenes: [] }] };
  const u = buildUserPrompt({ topic, profile: DEFAULT_PROFILE, targetMinutes: 10, cpm: 400, expand: { previous, totalChars: 2000 } });
  const b = scriptBudget(10, 400);
  assert.ok(u.includes("확장 지시"));
  assert.ok(u.includes("2000자"));
  assert.ok(u.includes(`${b.minChars}자 이상`));
  assert.ok(u.includes(`약 ${b.minChars - 2000}자 이상 추가`));
  assert.ok(u.includes("장면을 2개 이상 추가"));
  assert.ok(u.includes(JSON.stringify(previous)));
});

// ── 리랭크 ──────────────────────────────────────────────────

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

const candidates: TopicCandidate[] = [
  {
    id: "c1",
    title: "실손보험 개편",
    keywords: ["실손", "보험"],
    sources: [{ source: "google-news", label: "뉴스 4건", value: "4" }],
    news: [{ title: "실손보험 5세대 출시 임박 - 한국경제", url: "https://example.com/n1" }],
    signals: { demand: 0.7, competition: 0.5, fit: 1, freshness: 0.9 },
    score: 72,
    reasons: [],
  },
  {
    id: "c2",
    title: "아이돌 컴백",
    keywords: [],
    sources: [{ source: "google-trends", label: "급상승", value: "200+" }],
    news: [],
    signals: { demand: 0.9, competition: 0.3, fit: 0, freshness: 1 },
    score: 40,
    reasons: [],
  },
];

test("RERANK_JSON_SCHEMA — 구조화 출력 제약 준수 + 필드 5개", () => {
  const errors: string[] = [];
  walk(RERANK_JSON_SCHEMA, "$", errors);
  assert.deepEqual(errors, []);
  const items = ((RERANK_JSON_SCHEMA.properties as Record<string, unknown>).results as { items: { required: string[] } }).items;
  assert.deepEqual(items.required, ["id", "fit", "angle", "suggestedTitle", "reason"]);
});

test("buildRerankPrompts — 후보 id·제목·신호·프로필 키워드 포함", () => {
  const { system, user, schema } = buildRerankPrompts(candidates, DEFAULT_PROFILE);
  assert.equal(schema, RERANK_JSON_SCHEMA);
  assert.ok(system.includes(DEFAULT_PROFILE.keywords[0]));
  assert.ok(system.includes(DEFAULT_PROFILE.avoid[0]));
  assert.ok(user.includes("id=c1 | 실손보험 개편"));
  assert.ok(user.includes("id=c2 | 아이돌 컴백"));
  assert.ok(user.includes("google-news: 뉴스 4건 (4)"));
  assert.ok(user.includes("실손보험 5세대 출시 임박"));
  assert.ok(user.includes("2개 주제 후보"));
});

test("validateRerank — results 래핑/배열 모두 허용, 모르는 id·중복 제거, fit 클램프", () => {
  const out = validateRerank(
    {
      results: [
        { id: "c1", fit: 0.9, angle: "전환 판단 기준", suggestedTitle: "실손 5세대, 갈아타야 할까", reason: "채널 핵심" },
        { id: "c1", fit: 0.1, angle: "", suggestedTitle: "", reason: "" },
        { id: "c2", fit: 85, angle: "x", suggestedTitle: "y", reason: "z" },
        { id: "zzz", fit: 1, angle: "", suggestedTitle: "", reason: "" },
        { id: "c3", fit: "nan", angle: "", suggestedTitle: "", reason: "" },
      ],
    },
    ["c1", "c2", "c3"],
  );
  assert.deepEqual(out.map((r) => r.id), ["c1", "c2"]);
  assert.equal(out[0].fit, 0.9);
  assert.equal(out[1].fit, 0.85);
  const bare = validateRerank([
    { id: "a", fit: 150, angle: "", suggestedTitle: "", reason: "" },
    { id: "b", fit: -0.5, angle: "", suggestedTitle: "", reason: "" },
  ]);
  assert.equal(bare[0].fit, 1, "100 초과는 1로 클램프");
  assert.equal(bare[1].fit, 0, "음수는 0으로 클램프");
  assert.throws(() => validateRerank({ nope: true }));
  assert.throws(() => validateRerank({ results: [] }));
});
