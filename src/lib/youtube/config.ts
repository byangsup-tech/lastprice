import { promises as fs, readFileSync } from "fs";
import path from "path";
import { CHANNEL_FILE } from "./paths";
import { parseDotenv } from "./util";
import type {
  ChannelProfile,
  LlmProvider,
  TtsProvider,
  VisualMode,
} from "./types";

/**
 * 환경변수·채널 프로필 로딩.
 * - Next 라우트에서는 .env.local이 자동 로드되지만 tsx 스크립트는 아니므로 loadDotenvOnce()로 보강
 * - 프로필은 content/youtube/channel.json — 누락 필드는 기본값으로 채움
 */

export const DEFAULT_LLM_MODEL = "claude-opus-5";
export const DEFAULT_TTS_VOICE = "ko-KR-InJoonNeural";

export const DEFAULT_PROFILE: ChannelProfile = {
  name: "인사이트 채널",
  niche: "보험·재테크·경제 인사이트",
  audience: "30~50대 직장인, 금융·보험 상품에 관심 있는 일반 시청자",
  tone: "차분하고 신뢰감 있는 존댓말, 구체적인 숫자와 사례 중심, 과장 금지",
  language: "ko",
  keywords: ["보험", "실손보험", "연금", "재테크", "금리", "건강보험", "자동차보험", "경제"],
  avoid: ["정치", "선거", "종교", "성인", "도박", "사고 영상", "혐오"],
  targetMinutes: 10,
  voice: DEFAULT_TTS_VOICE,
  voiceRate: "+5%",
  theme: {
    primary: "#0f172a",
    accent: "#14b8a6",
    background: "#0b1220",
    text: "#f8fafc",
  },
  cta: "도움이 되셨다면 구독과 좋아요, 알림 설정 부탁드립니다. 다음 영상에서 더 깊은 이야기로 찾아뵙겠습니다.",
  bgmPath: null,
  visualMode: "auto",
  brand: { watermark: "인사이트 채널" },
};

let dotenvLoaded = false;

/** .env.local → .env 순으로 읽어 미설정 변수만 채운다 (스크립트용, 라우트에서 호출해도 무해) */
export function loadDotenvOnce(cwd = process.cwd()): void {
  if (dotenvLoaded) return;
  dotenvLoaded = true;
  for (const file of [".env.local", ".env"]) {
    try {
      const parsed = parseDotenv(readFileSync(path.join(cwd, file), "utf-8"));
      for (const [k, v] of Object.entries(parsed)) {
        if (process.env[k] === undefined) process.env[k] = v;
      }
    } catch {
      // 파일 없음 — 정상
    }
  }
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

// ── 키 존재 여부 ─────────────────────────────────────────────

export const hasAnthropicKey = () => !!(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN"));
export const hasYoutubeDataKey = () => !!env("YOUTUBE_API_KEY");
export const hasYoutubeUploadKeys = () =>
  !!(env("YOUTUBE_CLIENT_ID") && env("YOUTUBE_CLIENT_SECRET") && env("YOUTUBE_REFRESH_TOKEN"));
export const hasPexelsKey = () => !!env("PEXELS_API_KEY");
export const hasNaverKeys = () => !!(env("NAVER_CLIENT_ID") && env("NAVER_CLIENT_SECRET"));
export const hasOpenAiKey = () => !!env("OPENAI_API_KEY");
export const hasElevenLabsKey = () => !!env("ELEVENLABS_API_KEY");

// ── 공급자 선택 ──────────────────────────────────────────────

export function llmProvider(): LlmProvider {
  const forced = env("YT_LLM_PROVIDER");
  if (forced === "template") return "template";
  if (forced === "anthropic") return "anthropic";
  return hasAnthropicKey() ? "anthropic" : "template";
}

export function llmModel(): string {
  return env("YT_LLM_MODEL") ?? DEFAULT_LLM_MODEL;
}

export function ttsProvider(): TtsProvider {
  const forced = env("YT_TTS_PROVIDER");
  if (forced === "openai" && hasOpenAiKey()) return "openai";
  if (forced === "elevenlabs" && hasElevenLabsKey()) return "elevenlabs";
  return "edge";
}

export function ttsVoice(profile?: ChannelProfile): string {
  return env("YT_TTS_VOICE") ?? profile?.voice ?? DEFAULT_TTS_VOICE;
}

export function resolveVisualMode(
  requested: VisualMode | undefined,
  profile: ChannelProfile,
): Exclude<VisualMode, "auto"> {
  const mode = requested ?? profile.visualMode ?? "auto";
  if (mode === "auto") return hasPexelsKey() ? "photos" : "cards";
  if ((mode === "photos" || mode === "videos") && !hasPexelsKey()) return "cards";
  return mode;
}

/** 대시보드에서 파이프라인 실행(자식 프로세스 spawn)을 허용하는 환경인지 */
export function localRunAllowed(): boolean {
  if (process.env.VERCEL) return false;
  return env("YT_ALLOW_LOCAL_RUN") !== "0";
}

export function bgmPath(profile?: ChannelProfile): string | undefined {
  const p = env("YT_BGM_PATH") ?? profile?.bgmPath ?? undefined;
  return p ? path.resolve(p) : undefined;
}

// ── 채널 프로필 ──────────────────────────────────────────────

function isHex(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

function strArray(v: unknown, fallback: string[]): string[] {
  if (!Array.isArray(v)) return fallback;
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim());
}

/** 부분 객체 → 완전한 프로필 (검증·기본값 병합) */
export function normalizeProfile(raw: unknown): ChannelProfile {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const theme = (r.theme && typeof r.theme === "object" ? r.theme : {}) as Record<string, unknown>;
  const brand = (r.brand && typeof r.brand === "object" ? r.brand : {}) as Record<string, unknown>;
  const minutes = Number(r.targetMinutes);
  const visualMode = r.visualMode;
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name.trim() : DEFAULT_PROFILE.name,
    niche: typeof r.niche === "string" && r.niche.trim() ? r.niche.trim() : DEFAULT_PROFILE.niche,
    audience:
      typeof r.audience === "string" && r.audience.trim() ? r.audience.trim() : DEFAULT_PROFILE.audience,
    tone: typeof r.tone === "string" && r.tone.trim() ? r.tone.trim() : DEFAULT_PROFILE.tone,
    language: "ko",
    keywords: strArray(r.keywords, DEFAULT_PROFILE.keywords),
    avoid: strArray(r.avoid, DEFAULT_PROFILE.avoid),
    targetMinutes: Number.isFinite(minutes) ? Math.min(30, Math.max(3, minutes)) : DEFAULT_PROFILE.targetMinutes,
    voice: typeof r.voice === "string" && r.voice.trim() ? r.voice.trim() : DEFAULT_PROFILE.voice,
    voiceRate:
      typeof r.voiceRate === "string" && /^[+-]\d{1,3}%$/.test(r.voiceRate.trim())
        ? r.voiceRate.trim()
        : DEFAULT_PROFILE.voiceRate,
    theme: {
      primary: isHex(theme.primary) ? theme.primary : DEFAULT_PROFILE.theme.primary,
      accent: isHex(theme.accent) ? theme.accent : DEFAULT_PROFILE.theme.accent,
      background: isHex(theme.background) ? theme.background : DEFAULT_PROFILE.theme.background,
      text: isHex(theme.text) ? theme.text : DEFAULT_PROFILE.theme.text,
      fontFamily: typeof theme.fontFamily === "string" ? theme.fontFamily : undefined,
    },
    cta: typeof r.cta === "string" && r.cta.trim() ? r.cta.trim() : DEFAULT_PROFILE.cta,
    bgmPath: typeof r.bgmPath === "string" && r.bgmPath.trim() ? r.bgmPath.trim() : null,
    visualMode:
      visualMode === "cards" || visualMode === "photos" || visualMode === "videos" || visualMode === "auto"
        ? visualMode
        : "auto",
    brand: { watermark: typeof brand.watermark === "string" ? brand.watermark : undefined },
  };
}

export async function loadProfile(file = CHANNEL_FILE): Promise<ChannelProfile> {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf-8")) as unknown;
    return normalizeProfile(raw);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function loadProfileSync(file = CHANNEL_FILE): ChannelProfile {
  try {
    return normalizeProfile(JSON.parse(readFileSync(file, "utf-8")) as unknown);
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}
