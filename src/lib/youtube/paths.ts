import path from "path";
import { sceneNo } from "./util";

/**
 * 작업 디렉터리 레이아웃
 *
 * content/youtube/
 * ├── channel.json            채널 프로필 (커밋)
 * ├── research-latest.json    최근 리서치 리포트 (gitignore)
 * ├── used-topics.json        자동 선정 시 중복 방지 (gitignore)
 * └── jobs/<jobId>/           (gitignore)
 *     ├── job.json
 *     ├── script.json · metadata.json
 *     ├── audio/scene-001.mp3 · scene-001.json · timeline.json · narration.m4a
 *     ├── frames/scene-001.png · scene-001-overlay.png · plan.json · credits.json
 *     ├── clips/scene-001.mp4 · list.txt · video-only.mp4
 *     ├── fonts/ (렌더 시 자막 폰트 복사 — 상대 경로로 ffmpeg에 전달)
 *     ├── subtitles.srt · captions.json
 *     ├── final.mp4 · thumbnail.png
 *     └── logs/pipeline.log · render.log
 */

export const CONTENT_ROOT = path.join(process.cwd(), "content", "youtube");
export const JOBS_ROOT = path.join(CONTENT_ROOT, "jobs");
export const CHANNEL_FILE = path.join(CONTENT_ROOT, "channel.json");
export const RESEARCH_LATEST_FILE = path.join(CONTENT_ROOT, "research-latest.json");
export const USED_TOPICS_FILE = path.join(CONTENT_ROOT, "used-topics.json");

/** 런타임 캐시 루트 (폰트·스톡) — .gitignore의 .cache/ */
export const CACHE_ROOT = path.join(process.cwd(), ".cache", "youtube");
export const FONT_CACHE_DIR = path.join(process.cwd(), ".cache", "fonts");
export const STOCK_CACHE_DIR = path.join(CACHE_ROOT, "stock");

export const JOB_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{3,79}$/;

export function isValidJobId(id: string): boolean {
  return JOB_ID_RE.test(id) && !id.includes("..");
}

export function jobDir(jobId: string): string {
  if (!isValidJobId(jobId)) throw new Error(`잘못된 job id: ${jobId}`);
  return path.join(JOBS_ROOT, jobId);
}

export function jobPaths(jobId: string) {
  const root = jobDir(jobId);
  const audioDir = path.join(root, "audio");
  const framesDir = path.join(root, "frames");
  const clipsDir = path.join(root, "clips");
  const logsDir = path.join(root, "logs");
  return {
    root,
    jobFile: path.join(root, "job.json"),
    lockFile: path.join(root, ".lock"),
    scriptFile: path.join(root, "script.json"),
    metadataFile: path.join(root, "metadata.json"),
    audioDir,
    sceneAudio: (index: number) =>
      path.join(audioDir, `scene-${sceneNo(index)}.mp3`),
    sceneAudioMeta: (index: number) =>
      path.join(audioDir, `scene-${sceneNo(index)}.json`),
    timelineFile: path.join(audioDir, "timeline.json"),
    narrationFile: path.join(audioDir, "narration.m4a"),
    mixedAudioFile: path.join(audioDir, "mixed.m4a"),
    framesDir,
    sceneFrame: (index: number) =>
      path.join(framesDir, `scene-${sceneNo(index)}.png`),
    sceneOverlay: (index: number) =>
      path.join(framesDir, `scene-${sceneNo(index)}-overlay.png`),
    framePlanFile: path.join(framesDir, "plan.json"),
    creditsFile: path.join(framesDir, "credits.json"),
    clipsDir,
    sceneClip: (index: number) =>
      path.join(clipsDir, `scene-${sceneNo(index)}.mp4`),
    concatListFile: path.join(clipsDir, "list.txt"),
    videoOnlyFile: path.join(clipsDir, "video-only.mp4"),
    srtFile: path.join(root, "subtitles.srt"),
    captionsFile: path.join(root, "captions.json"),
    finalVideo: path.join(root, "final.mp4"),
    thumbnailPng: path.join(root, "thumbnail.png"),
    thumbnailJpg: path.join(root, "thumbnail.jpg"),
    logsDir,
    pipelineLog: path.join(logsDir, "pipeline.log"),
    renderLog: path.join(logsDir, "render.log"),
    spawnLog: path.join(logsDir, "pipeline.out"),
    fontsDir: path.join(root, "fonts"),
    // 단계별 입력 해시 매니페스트 (idempotent skip 판단)
    manifest: (stage: string) => path.join(root, `.${stage}.manifest.json`),
  };
}

export type JobPaths = ReturnType<typeof jobPaths>;

/**
 * 대시보드 파일 라우트에서 허용하는 산출물 이름 (경로 탈출 방지용 허용 목록).
 * 디렉터리 구분자는 '/'만 허용.
 */
export const SERVABLE_FILE_RE =
  /^(final\.mp4|thumbnail\.(png|jpg)|subtitles\.srt|script\.json|metadata\.json|frames\/scene-\d{3}(-overlay)?\.png|audio\/scene-\d{3}\.mp3|logs\/(pipeline\.log|render\.log|pipeline\.out))$/;

/** 허용 목록 검사 + jobDir 내부 확인 후 절대 경로 반환 (아니면 null) */
export function resolveServableFile(jobId: string, name: string): string | null {
  if (!isValidJobId(jobId) || !SERVABLE_FILE_RE.test(name)) return null;
  const root = jobDir(jobId);
  const resolved = path.resolve(root, name);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
