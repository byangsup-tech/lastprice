import type { CandidateNews, ChannelProfile, Topic, TopicCandidate } from "../types";
import { clampText } from "../util";
import { SCRIPT_JSON_SCHEMA } from "./schema";

/**
 * 대본·리랭크 프롬프트 빌더 (한국어 롱폼).
 *
 * 페이싱 계약(addendum §I):
 * - targetChars = targetMinutes × cpm (cpm = charsPerMinute(profile.voiceRate), Edge +5% ≈ 400자/분)
 * - 장면 수 ≈ targetChars / 110, 본문 장면 90~130자(≈14~19초)
 * - 챕터 5개(8~12분), 12분 초과면 6개 (짧은 영상은 3~4개)
 * - 총 글자 수가 0.8×targetChars 미만이면 generate.ts가 '확장' 패스 1회
 *
 * 시스템 프롬프트는 프로필에만 의존하므로(날짜·주제 없음) 같은 채널의 요청끼리 프롬프트 캐시가 재사용된다.
 */

export const CHARS_PER_SCENE = 110;
export const CONTENT_SCENE_MIN = 90;
export const CONTENT_SCENE_MAX = 130;
export const EXPAND_THRESHOLD = 0.8;
export const MAX_NEWS_ITEMS = 12;

export interface ScriptBudget {
  targetMinutes: number;
  cpm: number;
  /** 목표 총 나레이션 글자 수 */
  targetChars: number;
  /** 이 미만이면 확장 패스 */
  minChars: number;
  /** 훅·챕터 카드·아웃트로 포함 전체 장면 수 */
  sceneCount: number;
  chapterCount: number;
  /** 챕터당 본문 장면 수 (챕터 카드 제외) */
  contentScenesPerChapter: number;
}

export function chapterCountFor(targetMinutes: number): number {
  if (targetMinutes > 12) return 6;
  if (targetMinutes >= 8) return 5;
  if (targetMinutes >= 5) return 4;
  return 3;
}

export function scriptBudget(targetMinutes: number, cpm: number): ScriptBudget {
  const minutes = Math.max(1, targetMinutes);
  const rate = Math.max(100, Math.round(cpm));
  const targetChars = Math.round(minutes * rate);
  const chapterCount = chapterCountFor(minutes);
  const sceneCount = Math.max(chapterCount + 2 + chapterCount * 2, Math.round(targetChars / CHARS_PER_SCENE));
  const contentScenesPerChapter = Math.max(2, Math.round((sceneCount - 2 - chapterCount) / chapterCount));
  return {
    targetMinutes: minutes,
    cpm: rate,
    targetChars,
    minChars: Math.round(targetChars * EXPAND_THRESHOLD),
    sceneCount,
    chapterCount,
    contentScenesPerChapter,
  };
}

// ── 대본 프롬프트 ────────────────────────────────────────────

export function buildSystemPrompt(profile: ChannelProfile): string {
  const avoid = profile.avoid.length ? profile.avoid.join(", ") : "(없음)";
  return [
    `당신은 한국어 유튜브 롱폼(8~15분) 채널의 전속 작가입니다. 시청 유지율이 높은 구조화된 대본을 JSON으로만 작성합니다.`,
    ``,
    `[채널]`,
    `- 이름: ${profile.name}`,
    `- 분야: ${profile.niche}`,
    `- 시청자: ${profile.audience}`,
    `- 톤: ${profile.tone}`,
    `- 다루지 않는 주제: ${avoid}`,
    ``,
    `[대본 구조]`,
    `- hook: layout "title". 첫 문장은 시청자가 계속 봐야 할 이유(손해·이득·궁금증)를 던지는 강한 훅, 이어서 이 영상에서 얻는 것을 한두 문장으로. 12~20초 분량.`,
    `- chapters: 각 챕터는 title과 scenes 배열. scenes[0]은 반드시 layout "chapter"(챕터 카드, 챕터가 다룰 내용을 2문장으로 예고), 그 뒤 본문 장면들.`,
    `- 본문 장면 layout은 내용에 맞게 "bullets"(요점 정리, bullets 필수), "stat"(핵심 숫자, stat 필수), "quote"(인용·한 줄 정리, quote 필수), "plain"(설명) 중에서 고르고 연속으로 같은 layout을 3번 이상 쓰지 마세요.`,
    `- outro: layout "outro". 핵심 요약 한 문장 + 아래 CTA 문장을 자연스럽게 포함.`,
    `  CTA: ${profile.cta}`,
    ``,
    `[나레이션 규칙]`,
    `- 존댓말 구어체(~합니다/~입니다/~해 보세요). 한 장면은 2~4문장, 문장은 짧게. TTS가 읽으므로 마크다운·이모지·괄호 주석·특수기호·URL 금지. 숫자는 아라비아 숫자, 단위는 한글.`,
    `- 구체적 숫자·날짜·사례·비교를 우선하고 과장·추측·단정적 투자 권유는 금지. 제공된 뉴스 자료에 없는 사실은 "알려진 바로는", "보도에 따르면"처럼 출처를 흐리지 말고, 확실하지 않으면 다루지 마세요.`,
    `- 장면마다 새로운 정보가 하나 이상 있어야 하며 앞 장면을 반복하지 마세요. 챕터 사이는 "그렇다면", "여기서 중요한 건" 같은 연결 문장으로 이어 주세요.`,
    ``,
    `[화면 요소 규칙]`,
    `- heading: 화면 큰 글씨, 24자 이하, 명사형. bullets: 최대 4개, 각 28자 이하. stat.value: 12자 이하(예 "3.2%", "1,200만 명"), stat.label: 30자 이하. quote.text: 60자 이하.`,
    `- 쓰지 않는 필드는 null. visualKeywords: 스톡 이미지 검색용 영문 명사 2~4개 (예 ["hospital", "insurance document"]).`,
    ``,
    `[메타데이터 규칙]`,
    `- title: 60자 이하, 숫자·구체성·시청자 이익이 드러나게, 낚시 금지. altTitles: 서로 다른 각도의 대안 제목 3개.`,
    `- description: 600~1200자. 첫 두 줄에 영상 핵심, 이어서 챕터별 요약, 마지막 줄에 해시태그 3개. 타임스탬프는 넣지 마세요(자동 생성).`,
    `- tags: 10~15개, 각 30자 이하, 한국어 검색어 중심. thumbnail.headline: 10자 이하(최대 12자)의 짧고 강한 문구, thumbnail.sub: 16자 이하 보조 문구.`,
    `- sources: 참고한 뉴스·자료 URL만(제공된 것 중에서).`,
    ``,
    `출력은 주어진 JSON 스키마에 맞는 단일 JSON 객체만. 설명 문장이나 코드 펜스를 붙이지 마세요.`,
  ].join("\n");
}

function cleanHeadline(title: string): string {
  return title.replace(/\s+-\s+[^-]+$/, "").replace(/\s+/g, " ").trim();
}

function newsBlock(news: CandidateNews[]): string {
  if (!news.length) return "(제공된 뉴스 없음 — 널리 알려진 사실만 다루고 확실하지 않은 수치는 쓰지 마세요)";
  return news
    .slice(0, MAX_NEWS_ITEMS)
    .map((n, i) => {
      const meta = [n.source, n.publishedAt ? n.publishedAt.slice(0, 10) : ""].filter(Boolean).join(", ");
      return `${i + 1}. ${clampText(cleanHeadline(n.title), 80)}${meta ? ` (${meta})` : ""}\n   ${n.url}`;
    })
    .join("\n");
}

export interface UserPromptInput {
  topic: Topic;
  profile: ChannelProfile;
  targetMinutes: number;
  /** 분당 글자 수 — charsPerMinute(profile.voiceRate) */
  cpm: number;
  /** 근거 뉴스 (기본 topic.news) — 잘림 재시도 시 절반으로 줄여 전달 */
  news?: CandidateNews[];
  /** 확장 패스: 직전 출력(JSON)과 그 총 글자 수 */
  expand?: { previous: unknown; totalChars: number };
}

export function buildUserPrompt(input: UserPromptInput): string {
  const { topic, profile } = input;
  const budget = scriptBudget(input.targetMinutes, input.cpm);
  const news = input.news ?? topic.news ?? [];
  const sourceUrls = [...new Set([...topic.sourceUrls, ...news.map((n) => n.url)])].slice(0, 20);

  const brief = [
    `[주제]`,
    `- 제목/키워드: ${topic.title}`,
    topic.angle ? `- 앵글: ${topic.angle}` : null,
    topic.keywords.length ? `- 관련 키워드: ${topic.keywords.join(", ")}` : null,
    ``,
    `[근거 자료 — 뉴스 헤드라인]`,
    newsBlock(news),
    sourceUrls.length ? `\n[참고 URL]\n${sourceUrls.map((u) => `- ${u}`).join("\n")}` : null,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  const pacing = [
    `[분량 — 반드시 지키세요]`,
    `- 목표 길이 ${budget.targetMinutes}분. 이 채널의 TTS는 분당 약 ${budget.cpm}자를 읽으므로 나레이션 총 글자 수(공백 포함)는 약 ${budget.targetChars}자, 최소 ${budget.minChars}자 이상이어야 합니다.`,
    `- 챕터 ${budget.chapterCount}개. 챕터마다 챕터 카드 장면 1개 + 본문 장면 ${budget.contentScenesPerChapter}개 이상. 전체 장면 수는 훅·아웃트로 포함 약 ${budget.sceneCount}개.`,
    `- 본문 장면 나레이션은 ${CONTENT_SCENE_MIN}~${CONTENT_SCENE_MAX}자(약 14~19초). 훅은 80~130자, 챕터 카드는 60~100자, 아웃트로는 60~120자.`,
    `- 분량이 부족하면 장면을 늘리세요(장면 하나를 길게 쓰지 말 것). 각 장면은 ${CONTENT_SCENE_MAX + 20}자를 넘기지 마세요.`,
  ].join("\n");

  if (input.expand) {
    const previous = JSON.stringify(input.expand.previous);
    const need = Math.max(budget.minChars - input.expand.totalChars, 0);
    return [
      `아래는 방금 작성한 "${topic.title}" 대본 JSON입니다. 총 나레이션이 ${input.expand.totalChars}자로 목표(${budget.targetChars}자, 최소 ${budget.minChars}자)에 미치지 못합니다.`,
      ``,
      `[확장 지시]`,
      `- 기존 제목·설명·태그·훅·챕터 구성과 장면 순서는 유지하고, 각 챕터에 새로운 정보가 담긴 본문 장면을 2개 이상 추가하세요(기존 장면을 늘려 쓰지 말고 장면을 더하세요).`,
      `- 추가 장면도 ${CONTENT_SCENE_MIN}~${CONTENT_SCENE_MAX}자. 추가 후 총 나레이션은 ${budget.minChars}자 이상(약 ${need}자 이상 추가), 가능하면 ${budget.targetChars}자에 가깝게.`,
      `- 같은 스키마의 완전한 JSON(기존 장면 + 추가 장면 전부)을 반환하세요.`,
      ``,
      pacing,
      ``,
      brief,
      ``,
      `[직전 대본 JSON]`,
      previous,
    ].join("\n");
  }

  return [
    `"${topic.title}" 주제로 ${profile.name} 채널의 롱폼 영상 대본을 작성하세요.`,
    ``,
    brief,
    ``,
    pacing,
    ``,
    `[출력]`,
    `스키마에 맞는 JSON 객체 하나만 출력하세요.`,
  ].join("\n");
}

// ── 리서치 리랭크 프롬프트 ───────────────────────────────────

export interface RerankItem {
  id: string;
  /** 채널 적합도 0..1 */
  fit: number;
  angle: string;
  suggestedTitle: string;
  reason: string;
}

/** Anthropic 구조화 출력 호환 (additionalProperties:false, 전부 required, min/max 없음). 최상위는 객체여야 하므로 results로 감싼다 */
export const RERANK_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    results: {
      type: "array",
      description: "후보별 평가 — 입력된 모든 후보를 빠짐없이 포함",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", description: "입력 후보 id 그대로" },
          fit: { type: "number", description: "채널 적합도 0~1 (0.5 미만이면 채널과 무관)" },
          angle: { type: "string", description: "이 채널 시청자에게 맞는 접근 각도 한 문장" },
          suggestedTitle: { type: "string", description: "제안 영상 제목 ≤60자" },
          reason: { type: "string", description: "점수 근거 한두 문장" },
        },
        required: ["id", "fit", "angle", "suggestedTitle", "reason"],
      },
    },
  },
  required: ["results"],
};

export const MAX_RERANK_CANDIDATES = 30;

export function buildRerankPrompts(
  candidates: TopicCandidate[],
  profile: ChannelProfile,
): { system: string; user: string; schema: Record<string, unknown> } {
  const system = [
    `당신은 한국어 유튜브 채널의 편성 담당자입니다. 리서치로 모은 주제 후보를 채널 적합도 기준으로 평가해 JSON으로만 답합니다.`,
    ``,
    `[채널]`,
    `- 이름: ${profile.name}`,
    `- 분야: ${profile.niche}`,
    `- 시청자: ${profile.audience}`,
    `- 관심 키워드: ${profile.keywords.join(", ") || "(없음)"}`,
    `- 제외 주제: ${profile.avoid.join(", ") || "(없음)"}`,
    ``,
    `[평가 기준]`,
    `- fit: 채널 분야·시청자와의 관련성 0~1. 연예·스포츠·사건사고·정치처럼 채널과 무관하거나 제외 주제에 걸리면 0.2 이하.`,
    `- angle: 이 채널 시청자가 얻을 실질적 이익(돈·건강·제도 변화·체크리스트)이 드러나는 접근 각도 한 문장.`,
    `- suggestedTitle: 60자 이하, 숫자·구체성 포함, 낚시 금지.`,
    `- 입력된 후보 id를 모두 포함하고, id는 그대로 복사하세요.`,
    ``,
    `출력은 스키마에 맞는 JSON 객체 하나만.`,
  ].join("\n");

  const list = candidates.slice(0, MAX_RERANK_CANDIDATES).map((c, i) => {
    const evidence = c.sources
      .slice(0, 4)
      .map((s) => `${s.source}: ${s.label}${s.value ? ` (${s.value})` : ""}`)
      .join(" | ");
    const news = c.news
      .slice(0, 3)
      .map((n) => clampText(cleanHeadline(n.title), 60))
      .join(" / ");
    return [
      `${i + 1}. id=${c.id} | ${c.title}`,
      c.keywords.length ? `   키워드: ${c.keywords.slice(0, 6).join(", ")}` : null,
      evidence ? `   신호: ${evidence}` : null,
      news ? `   뉴스: ${news}` : null,
      `   점수: demand ${c.signals.demand.toFixed(2)}, freshness ${c.signals.freshness.toFixed(2)}, 키워드 적합도 ${c.signals.fit.toFixed(2)}`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  });

  const user = [
    `다음 ${list.length}개 주제 후보를 평가하세요. 각 후보에 대해 id, fit, angle, suggestedTitle, reason을 채워 results 배열로 반환합니다.`,
    ``,
    list.join("\n"),
  ].join("\n");

  return { system, user, schema: RERANK_JSON_SCHEMA };
}

/** 리랭크 응답 검증 — {results:[…]} 또는 배열 자체를 받아 정규화 (알 수 없는 id·범위 밖 fit 정리) */
export function validateRerank(raw: unknown, knownIds?: string[]): RerankItem[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { results?: unknown }).results)
      ? ((raw as { results: unknown[] }).results)
      : null;
  if (!arr) throw new Error("리랭크 응답이 results 배열이 아님");
  const known = knownIds ? new Set(knownIds) : null;
  const seen = new Set<string>();
  const out: RerankItem[] = [];
  for (const item of arr) {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const id = typeof r.id === "string" ? r.id.trim() : "";
    if (!id || seen.has(id) || (known && !known.has(id))) continue;
    const fitNum = typeof r.fit === "number" ? r.fit : Number(r.fit);
    if (!Number.isFinite(fitNum)) continue;
    seen.add(id);
    out.push({
      id,
      fit: Math.min(1, Math.max(0, fitNum > 1 && fitNum <= 100 ? fitNum / 100 : fitNum)),
      angle: typeof r.angle === "string" ? clampText(r.angle.trim(), 120) : "",
      suggestedTitle: typeof r.suggestedTitle === "string" ? clampText(r.suggestedTitle.trim(), 100) : "",
      reason: typeof r.reason === "string" ? clampText(r.reason.trim(), 200) : "",
    });
  }
  if (!out.length) throw new Error("리랭크 응답에 유효한 항목이 없음");
  return out;
}

/** 대본 스키마 재수출 (generate.ts·rerank.ts가 프롬프트와 함께 가져다 쓰도록) */
export { SCRIPT_JSON_SCHEMA };
