import type {
  ChannelProfile,
  Scene,
  SceneLayout,
  Script,
  Topic,
} from "../types";
import { clampText, cleanNarration, splitSentences } from "../util";

/**
 * 대본 JSON 스키마 + 검증·정규화.
 *
 * - SCRIPT_JSON_SCHEMA: LLM 구조화 출력용. Anthropic 구조화 출력은 min/max·길이 제약을 지원하지 않으므로
 *   여기서는 타입·enum·required·additionalProperties:false만 쓰고, 길이 규칙은 validateScript가 강제한다.
 * - validateScript: LLM/템플릿 출력(LlmScriptOutput) → Script (장면 평탄화, id 부여, 길이 클램프)
 */

/** 한국어 TTS 분당 글자 수 (Edge ko-KR +5% 실측 ≈ 400자/분, 공백 포함) */
export const CHARS_PER_MINUTE = 400;

/** 보이스 속도("+5%")를 반영한 분당 글자 수 */
export function charsPerMinute(rate?: string): number {
  const m = /^([+-]?\d{1,3})%$/.exec((rate ?? "").trim());
  const pct = m ? Number(m[1]) : 5;
  return Math.round(383 * (1 + pct / 100));
}

export const LIMITS = {
  titleMax: 100,
  titleSoft: 60,
  altTitlesMax: 3,
  descriptionMax: 4500,
  tagsMax: 15,
  tagMax: 30,
  tagsTotalMax: 450,
  thumbHeadlineMax: 14,
  thumbSubMax: 18,
  headingMax: 30,
  bulletsMax: 4,
  bulletMax: 32,
  narrationMin: 15,
  narrationMax: 420,
  visualKeywordsMax: 4,
  minScenes: 3,
  maxScenes: 120,
} as const;

export const SCENE_LAYOUTS: SceneLayout[] = [
  "title",
  "chapter",
  "bullets",
  "stat",
  "quote",
  "plain",
  "outro",
];

/** LLM이 반환해야 하는 형태 (Script보다 단순 — 장면 id/index 없음) */
export interface LlmScene {
  layout: SceneLayout;
  narration: string;
  heading?: string | null;
  bullets?: string[] | null;
  stat?: { value: string; label: string } | null;
  quote?: { text: string; by?: string | null } | null;
  visualKeywords: string[];
}

export interface LlmScriptOutput {
  title: string;
  altTitles: string[];
  description: string;
  tags: string[];
  thumbnail: { headline: string; sub?: string | null };
  hook: LlmScene;
  chapters: { title: string; scenes: LlmScene[] }[];
  outro: LlmScene;
  sources: string[];
}

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

const SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    layout: { type: "string", enum: SCENE_LAYOUTS },
    narration: { type: "string", description: "나레이션 2~4문장, 40~160자, 존댓말 구어체" },
    heading: nullable({ type: "string", description: "화면 큰 글씨 ≤24자" }),
    bullets: nullable({ type: "array", items: { type: "string" }, description: "≤4개, 각 ≤28자" }),
    stat: nullable({
      type: "object",
      additionalProperties: false,
      properties: { value: { type: "string" }, label: { type: "string" } },
      required: ["value", "label"],
    }),
    quote: nullable({
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" }, by: nullable({ type: "string" }) },
      required: ["text", "by"],
    }),
    visualKeywords: {
      type: "array",
      items: { type: "string" },
      description: "영문 명사 2~4개 (스톡 이미지 검색어)",
    },
  },
  required: ["layout", "narration", "heading", "bullets", "stat", "quote", "visualKeywords"],
} as const;

export const SCRIPT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", description: "영상 제목 ≤60자, 숫자·구체성" },
    altTitles: { type: "array", items: { type: "string" }, description: "대안 제목 3개" },
    description: { type: "string", description: "설명 600~1200자, 해시태그 3개 포함" },
    tags: { type: "array", items: { type: "string" }, description: "태그 10~15개" },
    thumbnail: {
      type: "object",
      additionalProperties: false,
      properties: {
        headline: { type: "string", description: "썸네일 문구 ≤12자" },
        sub: nullable({ type: "string", description: "보조 문구 ≤16자" }),
      },
      required: ["headline", "sub"],
    },
    hook: SCENE_SCHEMA,
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", description: "챕터 제목 ≤20자" },
          scenes: { type: "array", items: SCENE_SCHEMA },
        },
        required: ["title", "scenes"],
      },
    },
    outro: SCENE_SCHEMA,
    sources: { type: "array", items: { type: "string" } },
  },
  required: ["title", "altTitles", "description", "tags", "thumbnail", "hook", "chapters", "outro", "sources"],
} as const;

export class ScriptValidationError extends Error {
  constructor(public readonly reasons: string[]) {
    super(`대본 검증 실패: ${reasons.join("; ")}`);
    this.name = "ScriptValidationError";
  }
}

// ── 정규화 헬퍼 ─────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strList(v: unknown, max: number, each: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""))
    .filter(Boolean)
    .map((s) => clampText(s, each))
    .slice(0, max);
}

function normalizeKeywords(v: unknown, fallback: string[]): string[] {
  const list = strList(v, LIMITS.visualKeywordsMax, 40).map((k) => k.toLowerCase());
  return list.length ? list : fallback.slice(0, LIMITS.visualKeywordsMax);
}

function normalizeTags(v: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  let total = 0;
  for (const raw of strList(v, 40, LIMITS.tagMax)) {
    const t = raw.replace(/^#/, "").replace(/[<>]/g, "");
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    if (out.length >= LIMITS.tagsMax) break;
    if (total + t.length + 1 > LIMITS.tagsTotalMax) break;
    seen.add(key);
    out.push(t);
    total += t.length + 1;
  }
  return out;
}

/** 긴 나레이션은 문장 단위로 쪼개 여러 장면으로 (장면당 ≤ narrationMax) */
function splitNarration(text: string): string[] {
  if (text.length <= LIMITS.narrationMax) return [text];
  const sentences = splitSentences(text);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && (buf + " " + s).length > LIMITS.narrationMax) {
      chunks.push(buf);
      buf = s;
    } else {
      buf = buf ? `${buf} ${s}` : s;
    }
  }
  if (buf) chunks.push(buf);
  return chunks.length ? chunks : [text.slice(0, LIMITS.narrationMax)];
}

interface Draft {
  layout: SceneLayout;
  narration: string;
  heading?: string;
  bullets?: string[];
  stat?: { value: string; label: string };
  quote?: { text: string; by?: string };
  visualKeywords: string[];
  chapterIndex: number;
  chapterTitle?: string;
}

function draftsFromScene(
  raw: unknown,
  where: string,
  chapterIndex: number,
  chapterTitle: string | undefined,
  fallbackKeywords: string[],
  reasons: string[],
  forcedLayout?: SceneLayout,
): Draft[] {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const narration = cleanNarration(str(s.narration));
  if (narration.length < LIMITS.narrationMin) {
    reasons.push(`${where}: 나레이션이 너무 짧음 (${narration.length}자)`);
    return [];
  }
  let layout = SCENE_LAYOUTS.includes(s.layout as SceneLayout) ? (s.layout as SceneLayout) : "plain";
  if (forcedLayout) layout = forcedLayout;
  const heading = str(s.heading) ? clampText(str(s.heading).replace(/\s+/g, " "), LIMITS.headingMax) : undefined;
  const bullets = strList(s.bullets, LIMITS.bulletsMax, LIMITS.bulletMax);
  const statRaw = (s.stat && typeof s.stat === "object" ? s.stat : null) as Record<string, unknown> | null;
  const stat =
    statRaw && str(statRaw.value) && str(statRaw.label)
      ? { value: clampText(str(statRaw.value), 16), label: clampText(str(statRaw.label), 40) }
      : undefined;
  const quoteRaw = (s.quote && typeof s.quote === "object" ? s.quote : null) as Record<string, unknown> | null;
  const quote =
    quoteRaw && str(quoteRaw.text)
      ? { text: clampText(str(quoteRaw.text), 90), by: str(quoteRaw.by) ? clampText(str(quoteRaw.by), 30) : undefined }
      : undefined;
  // 레이아웃과 데이터의 정합성 — 데이터가 없으면 plain으로 강등
  if (layout === "bullets" && bullets.length === 0) layout = heading ? "plain" : "plain";
  if (layout === "stat" && !stat) layout = "plain";
  if (layout === "quote" && !quote) layout = "plain";
  const visualKeywords = normalizeKeywords(s.visualKeywords, fallbackKeywords);
  const parts = splitNarration(narration);
  return parts.map((part, i) => ({
    // 쪼개진 뒤 장면은 같은 화면을 유지하되 카드형(title/chapter)은 plain으로
    layout: i === 0 ? layout : layout === "title" || layout === "chapter" ? "plain" : layout,
    narration: part,
    heading,
    bullets: bullets.length ? bullets : undefined,
    stat,
    quote,
    visualKeywords,
    chapterIndex,
    chapterTitle,
  }));
}

export interface ValidateContext {
  topic: Topic;
  profile: ChannelProfile;
  generator: Script["generator"];
  model?: string;
}

/** LLM/템플릿 출력 → Script. 실패 시 ScriptValidationError */
export function validateScript(raw: unknown, ctx: ValidateContext): Script {
  const reasons: string[] = [];
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const title = clampText(str(r.title).replace(/[<>]/g, "").replace(/\s+/g, " "), LIMITS.titleMax);
  if (title.length < 2) reasons.push("title 누락");
  const altTitles = strList(r.altTitles, LIMITS.altTitlesMax, LIMITS.titleMax).map((t) => t.replace(/[<>]/g, ""));
  const description = str(r.description).replace(/[<>]/g, "").slice(0, LIMITS.descriptionMax);
  const tags = normalizeTags(r.tags);
  const thumbRaw = (r.thumbnail && typeof r.thumbnail === "object" ? r.thumbnail : {}) as Record<string, unknown>;
  const thumbnail = {
    headline: clampText(str(thumbRaw.headline) || title, LIMITS.thumbHeadlineMax),
    sub: str(thumbRaw.sub) ? clampText(str(thumbRaw.sub), LIMITS.thumbSubMax) : undefined,
  };

  const fallbackKeywords = [
    ...ctx.topic.keywords.filter((k) => /^[\x20-\x7e]+$/.test(k)),
    "korea",
    "business",
    "city",
  ];

  const drafts: Draft[] = [];
  drafts.push(...draftsFromScene(r.hook, "hook", -1, undefined, fallbackKeywords, reasons, "title"));

  const chaptersRaw = Array.isArray(r.chapters) ? r.chapters : [];
  const chapters: { title: string }[] = [];
  chaptersRaw.forEach((c, ci) => {
    const ch = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const chTitle = clampText(str(ch.title).replace(/\s+/g, " ") || `${ci + 1}부`, 24);
    const scenesRaw = Array.isArray(ch.scenes) ? ch.scenes : [];
    const chapterIndex = chapters.length;
    const before = drafts.length;
    scenesRaw.forEach((sc, si) => {
      drafts.push(
        ...draftsFromScene(
          sc,
          `chapter[${ci}].scenes[${si}]`,
          chapterIndex,
          chTitle,
          fallbackKeywords,
          reasons,
          si === 0 ? "chapter" : undefined,
        ),
      );
    });
    if (drafts.length > before) {
      // 챕터의 첫 장면은 챕터 카드 — 제목을 챕터명으로 고정
      drafts[before].layout = "chapter";
      drafts[before].heading = chTitle;
      chapters.push({ title: chTitle });
    } else {
      reasons.push(`chapter[${ci}] "${chTitle}": 유효한 장면 없음`);
    }
  });

  drafts.push(...draftsFromScene(r.outro, "outro", -1, undefined, fallbackKeywords, reasons, "outro"));

  if (drafts.length < LIMITS.minScenes) reasons.push(`장면 수 부족 (${drafts.length} < ${LIMITS.minScenes})`);
  if (drafts.length > LIMITS.maxScenes) reasons.push(`장면 수 초과 (${drafts.length} > ${LIMITS.maxScenes})`);
  if (chapters.length === 0) reasons.push("챕터 없음");
  if (drafts.length && drafts[0].layout !== "title") reasons.push("첫 장면은 hook(title)이어야 함");
  if (drafts.length && drafts[drafts.length - 1].layout !== "outro") reasons.push("마지막 장면은 outro여야 함");

  // 치명적 문제만 예외 — 사소한 것은 정규화로 흡수됨
  const fatal = reasons.filter((x) => !/나레이션이 너무 짧음/.test(x) || drafts.length < LIMITS.minScenes);
  if (fatal.length) throw new ScriptValidationError(fatal);

  const scenes: Scene[] = drafts.map((d, i) => ({
    id: `s${String(i + 1).padStart(2, "0")}`,
    index: i,
    chapterIndex: d.chapterIndex,
    chapterTitle: d.chapterTitle,
    layout: d.layout,
    narration: d.narration,
    heading: d.heading,
    bullets: d.bullets,
    stat: d.stat,
    quote: d.quote,
    visualKeywords: d.visualKeywords,
  }));

  const totalChars = scenes.reduce((n, s) => n + s.narration.length, 0);
  const sources = strList(r.sources, 20, 500).filter((u) => /^https?:\/\//.test(u));
  const uniqueSources = [...new Set([...sources, ...ctx.topic.sourceUrls])].slice(0, 20);

  return {
    version: 1,
    topic: ctx.topic,
    title,
    altTitles,
    description,
    tags,
    thumbnail,
    chapters,
    scenes,
    sources: uniqueSources,
    estimatedMinutes: Math.round((totalChars / CHARS_PER_MINUTE) * 10) / 10,
    generator: ctx.generator,
    model: ctx.model,
  };
}

/** 총 나레이션 글자 수 */
export function scriptChars(script: Script): number {
  return script.scenes.reduce((n, s) => n + s.narration.length, 0);
}

/** 챕터별 장면 그룹 (대시보드·프롬프트용) */
export function scenesByChapter(script: Script): { title: string; scenes: Scene[] }[] {
  const groups: { title: string; scenes: Scene[] }[] = [{ title: "인트로", scenes: [] }];
  for (const c of script.chapters) groups.push({ title: c.title, scenes: [] });
  groups.push({ title: "아웃트로", scenes: [] });
  for (const s of script.scenes) {
    if (s.layout === "title" || (s.chapterIndex === -1 && s.layout !== "outro")) groups[0].scenes.push(s);
    else if (s.layout === "outro") groups[groups.length - 1].scenes.push(s);
    else groups[Math.min(groups.length - 2, s.chapterIndex + 1)].scenes.push(s);
  }
  return groups.filter((g) => g.scenes.length);
}
