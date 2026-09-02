import {
  hasAnthropicKey,
  hasElevenLabsKey,
  hasNaverKeys,
  hasOpenAiKey,
  hasPexelsKey,
  hasYoutubeDataKey,
  hasYoutubeUploadKeys,
  llmModel,
  llmProvider,
  loadProfile,
  localRunAllowed,
  resolveVisualMode,
  ttsProvider,
  ttsVoice,
} from "./config";
import { resolveChromium } from "./tools/chromium";
import { resolveFfmpeg } from "./tools/ffmpeg";
import { ensureFonts, fontStatusSync } from "./tools/fonts";
import type { EnvStatus } from "./types";

/** 환경·도구 상태 — 대시보드 상태 스트립과 CLI doctor가 공유 (비밀 값은 절대 포함하지 않음) */
export async function buildEnvStatus(opts: { ensureFonts?: boolean } = {}): Promise<EnvStatus> {
  const profile = await loadProfile();
  const fonts = opts.ensureFonts ? await ensureFonts() : fontStatusSync();
  return {
    keys: {
      anthropic: hasAnthropicKey(),
      youtubeData: hasYoutubeDataKey(),
      youtubeUpload: hasYoutubeUploadKeys(),
      pexels: hasPexelsKey(),
      naver: hasNaverKeys(),
      openaiTts: hasOpenAiKey(),
      elevenlabs: hasElevenLabsKey(),
    },
    tools: {
      ffmpeg: resolveFfmpeg(),
      chromium: resolveChromium(),
      fonts: {
        ok: fonts.ok,
        path: fonts.boldPath ?? fonts.regularPath,
        family: fonts.family,
        dir: fonts.dir,
        error: fonts.error,
      },
    },
    llmProvider: llmProvider(),
    llmModel: llmModel(),
    ttsProvider: ttsProvider(),
    ttsVoice: ttsVoice(profile),
    visualMode: resolveVisualMode(undefined, profile),
    localRunAllowed: localRunAllowed(),
    checkedAt: new Date().toISOString(),
  };
}

/** doctor 출력용 — 사람이 읽는 줄 목록 + 해결 방법 */
export function describeEnvStatus(s: EnvStatus): string[] {
  const ok = (b: boolean) => (b ? "✅" : "▫️");
  const lines: string[] = [];
  lines.push(`도구`);
  lines.push(`  ${s.tools.ffmpeg.ok ? "✅" : "❌"} ffmpeg ${s.tools.ffmpeg.version ?? ""} ${s.tools.ffmpeg.path ?? s.tools.ffmpeg.error ?? ""}`);
  lines.push(`  ${s.tools.chromium.ok ? "✅" : "❌"} Chromium ${s.tools.chromium.path ?? s.tools.chromium.error ?? ""}`);
  lines.push(`  ${s.tools.fonts.ok ? "✅" : "⚠️"} 한글 폰트 ${s.tools.fonts.family ?? ""} ${s.tools.fonts.dir ?? s.tools.fonts.error ?? ""}`);
  lines.push(`공급자`);
  lines.push(`  대본: ${s.llmProvider === "anthropic" ? `Anthropic (${s.llmModel})` : "템플릿 모드 (ANTHROPIC_API_KEY 없음 — 초안 품질)"}`);
  lines.push(`  음성: ${s.ttsProvider} / ${s.ttsVoice}`);
  lines.push(`  시각자료: ${s.visualMode}${s.visualMode === "cards" ? " (PEXELS_API_KEY 설정 시 사진 배경)" : ""}`);
  lines.push(`키`);
  lines.push(`  ${ok(s.keys.anthropic)} ANTHROPIC_API_KEY   ${ok(s.keys.pexels)} PEXELS_API_KEY   ${ok(s.keys.youtubeData)} YOUTUBE_API_KEY`);
  lines.push(`  ${ok(s.keys.naver)} NAVER_CLIENT_ID/SECRET   ${ok(s.keys.youtubeUpload)} YOUTUBE_CLIENT_ID/SECRET/REFRESH_TOKEN (업로드)`);
  lines.push(`  ${ok(s.keys.openaiTts)} OPENAI_API_KEY (TTS 대안)   ${ok(s.keys.elevenlabs)} ELEVENLABS_API_KEY (TTS 대안)`);
  lines.push(`대시보드 로컬 실행: ${s.localRunAllowed ? "가능" : "불가 (서버리스/비활성) — CLI 사용"}`);
  const fixes: string[] = [];
  if (!s.tools.ffmpeg.ok) fixes.push("ffmpeg: `npm i @ffmpeg-installer/ffmpeg` 또는 시스템 설치 후 FFMPEG_PATH 설정");
  if (!s.tools.chromium.ok) fixes.push("Chromium: `npx playwright-core install chromium` 또는 CHROMIUM_PATH 설정");
  if (!s.tools.fonts.ok) fixes.push("폰트: 네트워크 허용 후 `npm run yt -- doctor` 재실행 또는 `apt-get install fonts-noto-cjk` + YT_FONT_DIR=/usr/share/fonts/opentype/noto");
  if (!s.keys.anthropic) fixes.push("대본 품질: ANTHROPIC_API_KEY 설정 (없으면 템플릿 초안)");
  if (!s.keys.youtubeUpload) fixes.push("업로드: `npm run yt -- auth`로 리프레시 토큰 발급 (YOUTUBE_CLIENT_ID/SECRET 필요)");
  if (fixes.length) {
    lines.push("해결 방법");
    for (const f of fixes) lines.push(`  · ${f}`);
  }
  return lines;
}
