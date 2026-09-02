import { NextResponse } from "next/server";
import type { LlmScene, LlmScriptOutput } from "@/lib/youtube/script/schema";
import {
  STAGES,
  type Privacy,
  type Scene,
  type Script,
  type StageKey,
  type Topic,
  type VisualMode,
} from "@/lib/youtube/types";

/**
 * 유튜브 API 라우트 공용 순수 헬퍼 (fs 없음 — 단위 테스트 대상).
 * - JSON 오류 응답, 서버리스 판별
 * - Range 헤더 파싱 / content-type 매핑 (파일 라우트)
 * - run 라우트 플래그 검증 (검증된 값만 자식 프로세스 인자로)
 * - 대시보드에서 편집한 Script → validateScript 입력(LlmScriptOutput) 변환
 * - 작업 생성 본문 파싱
 */

export function jsonError(message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

/** Vercel 등 서버리스 배포 — 파일 시스템 쓰기·자식 프로세스 불가 */
export function isServerless(): boolean {
  return !!process.env.VERCEL;
}

export const SERVERLESS_WRITE_ERROR =
  "서버리스 환경에서는 작업을 생성할 수 없습니다 — 로컬 CLI를 사용하세요";

// ── Range ────────────────────────────────────────────────────

export type RangeResult = { start: number; end: number } | "invalid" | null;

/**
 * 단일 바이트 범위만 지원. 다중 범위·bytes 이외 단위 → null(전체 응답).
 * 만족 불가(시작이 크기 이상, 접미사 0 등) → "invalid" (416).
 */
export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a, b] = m;
  if (!a && !b) return "invalid";
  if (size <= 0) return "invalid";
  if (!a) {
    // 접미사 범위: 마지막 N바이트
    const suffix = Number(b);
    if (!Number.isFinite(suffix) || suffix <= 0) return "invalid";
    const start = Math.max(0, size - suffix);
    return { start, end: size - 1 };
  }
  const start = Number(a);
  if (!Number.isFinite(start) || start >= size) return "invalid";
  const end = b ? Math.min(Number(b), size - 1) : size - 1;
  if (!Number.isFinite(end) || end < start) return "invalid";
  return { start, end };
}

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  srt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
  mp3: "audio/mpeg",
  log: "text/plain; charset=utf-8",
  out: "text/plain; charset=utf-8",
};

export function contentTypeFor(name: string): string {
  const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

// ── run 플래그 ───────────────────────────────────────────────

export interface RunRequest {
  from?: StageKey;
  to?: StageKey;
  force?: boolean;
  upload?: boolean;
  privacy?: Privacy;
  publishAt?: string;
}

export type RunArgsResult =
  | { ok: true; args: string[]; request: RunRequest }
  | { ok: false; error: string };

function isStage(v: unknown): v is StageKey {
  return typeof v === "string" && (STAGES as string[]).includes(v);
}

export function isPrivacy(v: unknown): v is Privacy {
  return v === "private" || v === "unlisted" || v === "public";
}

/** ISO 8601 → 정규화된 ISO 문자열 (파싱 실패 시 null) */
export function normalizePublishAt(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v.trim());
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

/**
 * POST /run 본문 → CLI 인자. 검증 실패 시 error.
 * 사용자 문자열은 STAGES/privacy 허용 목록 또는 Date.parse를 통과한 값만 인자에 들어간다.
 */
export function buildRunArgs(body: unknown): RunArgsResult {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const request: RunRequest = {};
  const args: string[] = [];

  if (b.from !== undefined) {
    if (!isStage(b.from)) return { ok: false, error: `from: 알 수 없는 단계 (가능: ${STAGES.join(", ")})` };
    request.from = b.from;
  }
  if (b.to !== undefined) {
    if (!isStage(b.to)) return { ok: false, error: `to: 알 수 없는 단계 (가능: ${STAGES.join(", ")})` };
    request.to = b.to;
  }
  if (request.from && request.to && STAGES.indexOf(request.from) > STAGES.indexOf(request.to)) {
    return { ok: false, error: `잘못된 단계 범위: ${request.from} → ${request.to}` };
  }
  if (b.force !== undefined) {
    if (typeof b.force !== "boolean") return { ok: false, error: "force: boolean이어야 합니다" };
    request.force = b.force;
  }
  if (b.upload !== undefined) {
    if (typeof b.upload !== "boolean") return { ok: false, error: "upload: boolean이어야 합니다" };
    request.upload = b.upload;
  }
  if (b.privacy !== undefined) {
    if (!isPrivacy(b.privacy)) return { ok: false, error: "privacy: private | unlisted | public" };
    request.privacy = b.privacy;
  }
  if (b.publishAt !== undefined && b.publishAt !== null && b.publishAt !== "") {
    const iso = normalizePublishAt(b.publishAt);
    if (!iso) return { ok: false, error: "publishAt: ISO 8601 형식이어야 합니다" };
    request.publishAt = iso;
    // 유튜브 규칙: 예약 게시는 private이어야 함
    request.privacy = "private";
  }

  if (request.from) args.push("--from", request.from);
  if (request.to) args.push("--to", request.to);
  if (request.force) args.push("--force");
  if (request.upload) args.push("--upload");
  if (request.privacy) args.push("--privacy", request.privacy);
  if (request.publishAt) args.push("--publish-at", request.publishAt);
  return { ok: true, args, request };
}

// ── Script → LlmScriptOutput ─────────────────────────────────

function toLlmScene(s: Scene): LlmScene {
  return {
    layout: s.layout,
    narration: s.narration,
    heading: s.heading ?? null,
    bullets: s.bullets && s.bullets.length ? s.bullets : null,
    stat: s.stat ?? null,
    quote: s.quote ? { text: s.quote.text, by: s.quote.by ?? null } : null,
    visualKeywords: s.visualKeywords ?? [],
  };
}

/** 본문이 Script(평탄화된 scenes) 형태인지 — 아니면 LlmScriptOutput으로 간주 */
export function looksLikeScript(raw: unknown): raw is Script {
  return !!raw && typeof raw === "object" && Array.isArray((raw as { scenes?: unknown }).scenes);
}

/**
 * 대시보드에서 편집한 Script(평탄 scenes)를 validateScript 입력 형태로 되돌린다.
 * - 첫 장면 → hook, 마지막 장면 → outro, 나머지는 chapterIndex로 챕터에 배분
 * - 챕터 제목은 script.chapters 기준 (범위 밖 chapterIndex는 가장 가까운 챕터로)
 */
export function scriptToLlmOutput(script: Script): LlmScriptOutput {
  const scenes = script.scenes ?? [];
  const chapters = (script.chapters ?? []).map((c) => ({
    title: typeof c.title === "string" ? c.title : "",
    scenes: [] as LlmScene[],
  }));
  const hookScene = scenes[0];
  const outroScene = scenes.length > 1 ? scenes[scenes.length - 1] : undefined;
  const middle = scenes.slice(1, outroScene ? -1 : undefined);
  if (chapters.length === 0 && middle.length) chapters.push({ title: "본문", scenes: [] });
  for (const s of middle) {
    const idx = Math.min(chapters.length - 1, Math.max(0, Number.isInteger(s.chapterIndex) ? s.chapterIndex : 0));
    chapters[idx].scenes.push(toLlmScene(s));
  }
  const empty: LlmScene = { layout: "plain", narration: "", visualKeywords: [] };
  return {
    title: script.title ?? "",
    altTitles: script.altTitles ?? [],
    description: script.description ?? "",
    tags: script.tags ?? [],
    thumbnail: {
      headline: script.thumbnail?.headline ?? "",
      sub: script.thumbnail?.sub ?? null,
    },
    hook: hookScene ? { ...toLlmScene(hookScene), layout: "title" } : empty,
    chapters,
    outro: outroScene ? { ...toLlmScene(outroScene), layout: "outro" } : empty,
    sources: script.sources ?? [],
  };
}

// ── 작업 생성 본문 ───────────────────────────────────────────

export interface CreateJobBody {
  candidateId?: string;
  topic?: Topic;
  options: { upload?: boolean; privacy?: Privacy; publishAt?: string; visualMode?: VisualMode };
}

export type ParseCreateResult = { ok: true; body: CreateJobBody } | { ok: false; error: string };

function strList(v: unknown, max: number, each: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((s) => s.slice(0, each))
    .slice(0, max);
}

export function parseCreateJobBody(raw: unknown): ParseCreateResult {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const optRaw = (b.options && typeof b.options === "object" ? b.options : {}) as Record<string, unknown>;
  const options: CreateJobBody["options"] = {};
  if (optRaw.upload !== undefined) {
    if (typeof optRaw.upload !== "boolean") return { ok: false, error: "options.upload: boolean" };
    options.upload = optRaw.upload;
  }
  if (optRaw.privacy !== undefined) {
    if (!isPrivacy(optRaw.privacy)) return { ok: false, error: "options.privacy: private | unlisted | public" };
    options.privacy = optRaw.privacy;
  }
  if (optRaw.publishAt !== undefined && optRaw.publishAt !== null && optRaw.publishAt !== "") {
    const iso = normalizePublishAt(optRaw.publishAt);
    if (!iso) return { ok: false, error: "options.publishAt: ISO 8601" };
    options.publishAt = iso;
    options.privacy = "private";
  }
  if (optRaw.visualMode !== undefined) {
    const vm = optRaw.visualMode;
    if (vm !== "auto" && vm !== "cards" && vm !== "photos" && vm !== "videos") {
      return { ok: false, error: "options.visualMode: auto | cards | photos | videos" };
    }
    options.visualMode = vm;
  }

  if (typeof b.candidateId === "string" && b.candidateId.trim()) {
    const candidateId = b.candidateId.trim();
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(candidateId)) return { ok: false, error: "candidateId 형식 오류" };
    return { ok: true, body: { candidateId, options } };
  }

  const t = (b.topic && typeof b.topic === "object" ? b.topic : null) as Record<string, unknown> | null;
  if (!t) return { ok: false, error: "topic 또는 candidateId가 필요합니다" };
  const title = typeof t.title === "string" ? t.title.replace(/\s+/g, " ").trim() : "";
  if (title.length < 2 || title.length > 120) return { ok: false, error: "topic.title: 2~120자" };
  const angle = typeof t.angle === "string" && t.angle.trim() ? t.angle.replace(/\s+/g, " ").trim().slice(0, 300) : undefined;
  const keywords = strList(t.keywords, 10, 40);
  const sourceUrls = strList(t.sourceUrls, 10, 500).filter((u) => /^https?:\/\//.test(u));
  return { ok: true, body: { topic: { title, angle, keywords, sourceUrls }, options } };
}
