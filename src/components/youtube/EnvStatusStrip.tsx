import type { EnvStatus } from "@/lib/youtube/types";
import DashboardTokenButton from "./DashboardTokenButton";

type Tone = "ok" | "warn" | "off" | "bad";

const TONE: Record<Tone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  off: "border-gray-200 bg-gray-50 text-gray-500",
  bad: "border-red-200 bg-red-50 text-red-700",
};

const DOT: Record<Tone, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  off: "bg-gray-400",
  bad: "bg-red-500",
};

interface Chip {
  label: string;
  value: string;
  tone: Tone;
  title?: string;
}

const TTS_NAME = { edge: "Edge", openai: "OpenAI", elevenlabs: "ElevenLabs" } as const;
const VISUAL_NAME = { cards: "카드", photos: "사진", videos: "영상" } as const;

function chips(s: EnvStatus): Chip[] {
  return [
    {
      label: "대본",
      value: s.llmProvider === "anthropic" ? `Anthropic · ${s.llmModel}` : "템플릿 모드",
      tone: s.llmProvider === "anthropic" ? "ok" : "warn",
      title: s.llmProvider === "anthropic" ? undefined : "ANTHROPIC_API_KEY를 설정하면 LLM 대본으로 전환됩니다 (템플릿은 초안 품질)",
    },
    {
      label: "음성",
      value: `${TTS_NAME[s.ttsProvider]} · ${s.ttsVoice}`,
      tone: "ok",
    },
    {
      label: "ffmpeg",
      value: s.tools.ffmpeg.ok ? (s.tools.ffmpeg.version ?? "사용 가능") : "없음",
      tone: s.tools.ffmpeg.ok ? "ok" : "bad",
      title: s.tools.ffmpeg.path ?? s.tools.ffmpeg.error,
    },
    {
      label: "Chromium",
      value: s.tools.chromium.ok ? "사용 가능" : "없음",
      tone: s.tools.chromium.ok ? "ok" : "bad",
      title: s.tools.chromium.path ?? s.tools.chromium.error,
    },
    {
      label: "한글 폰트",
      value: s.tools.fonts.ok ? (s.tools.fonts.family ?? "확보됨") : "미확보",
      tone: s.tools.fonts.ok ? "ok" : "warn",
      title: s.tools.fonts.dir ?? s.tools.fonts.error,
    },
    {
      label: "시각자료",
      value: s.keys.pexels ? `Pexels · ${VISUAL_NAME[s.visualMode]}` : "카드 (Pexels 키 없음)",
      tone: s.keys.pexels ? "ok" : "off",
    },
    {
      label: "YouTube Data",
      value: s.keys.youtubeData ? "키 있음" : "키 없음",
      tone: s.keys.youtubeData ? "ok" : "off",
      title: "리서치 시 유튜브 조회수·경쟁 신호에 사용",
    },
    {
      label: "YouTube 업로드",
      value: s.keys.youtubeUpload ? "OAuth 설정됨" : "미설정",
      tone: s.keys.youtubeUpload ? "ok" : "off",
      title: s.keys.youtubeUpload ? undefined : "npm run yt -- auth 로 리프레시 토큰 발급",
    },
    {
      label: "네이버",
      value: s.keys.naver ? "키 있음" : "키 없음",
      tone: s.keys.naver ? "ok" : "off",
    },
    {
      label: "로컬 실행",
      value: s.localRunAllowed ? "가능" : "불가 (CLI 사용)",
      tone: s.localRunAllowed ? "ok" : "off",
      title: s.localRunAllowed
        ? "대시보드에서 파이프라인을 실행할 수 있습니다"
        : "서버리스이거나 프로덕션 기본값(YT_ALLOW_LOCAL_RUN=1로 허용) 또는 YT_ALLOW_LOCAL_RUN=0",
    },
  ];
}

interface Props {
  status: EnvStatus | null;
  loading?: boolean;
  error?: string | null;
}

/** 환경 상태 스트립 — 공급자·도구·키 상태 칩 (비밀 값 없음) */
export default function EnvStatusStrip({ status, loading, error }: Props) {
  if (!status) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-500">
        {error ? `환경 상태를 불러오지 못했습니다: ${error}` : loading ? "환경 상태 확인 중…" : "환경 상태 없음"}
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap gap-1.5">
        {chips(status).map((c) => (
          <span
            key={c.label}
            title={c.title}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${TONE[c.tone]}`}
          >
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[c.tone]}`} />
            <span className="opacity-70">{c.label}</span>
            <span className="max-w-[180px] truncate">{c.value}</span>
          </span>
        ))}
        <DashboardTokenButton required={status.dashboardTokenRequired} />
      </div>
    </div>
  );
}
