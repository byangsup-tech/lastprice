import { promises as fs } from "fs";
import path from "path";
import { bgmPath as profileBgmPath } from "../config";
import { fileExists, loadMetadata, readJsonFile, writeJsonFile } from "../jobs";
import { buildInitialMetadata, sanitizeMetadata } from "../metadata";
import { jobPaths, type JobPaths } from "../paths";
import { FPS, timelineFrames } from "../timeline";
import { concatListLine, probeDuration, runFfmpeg } from "../tools/ffmpeg";
import { ensureFonts } from "../tools/fonts";
import type {
  FramePlan,
  FramePlanScene,
  Job,
  KenBurns,
  Scene,
  SceneAudio,
  Script,
  Timeline,
  VideoMetadata,
} from "../types";
import { sceneNo } from "../util";
import { applyChapters, chapterMarkers } from "./chapters";
import {
  audioConcatFilter,
  bgmInputArgs,
  finalArgs,
  imageClipArgs,
  kenBurnsFor,
  mixFilter,
  solidFrameArgs,
  videoClipArgs,
} from "./filters";

/**
 * 영상 합성(render) 단계.
 *
 * 입력: frames/plan.json, audio/timeline.json, audio/scene-XXX.{json,mp3}, subtitles.srt
 * 출력: clips/scene-XXX.mp4 → clips/video-only.mp4 (concat demuxer) → audio/narration.m4a → audio/mixed.m4a
 *       → final.mp4 (진행 바 + 자막 번인) → metadata.json (챕터 타임라인 반영)
 *
 * 모든 ffmpeg 호출은 cwd = jobDir, 필터 안 경로는 상대 경로(subtitles.srt, fonts)만 쓴다.
 * 인자 배열은 logs/render.log에 그대로 기록한다.
 */

export interface ComposeOptions {
  /** BGM mp3 경로 (없으면 프로필/환경변수 → 없으면 BGM 없음) */
  bgmPath?: string;
  /** 하단 진행 바 (기본 true; job.options.progressBar 로도 제어) */
  progressBar?: boolean;
  /** 기존 클립을 무시하고 다시 만든다 */
  force?: boolean;
  log?: (line: string) => void;
  onProgress?: (ratio: number) => void;
}

export interface ComposeResult {
  videoPath: string;
  durationMs: number;
  metadata: VideoMetadata;
}

interface ScenePlan {
  scene: Scene;
  frames: number;
  /** 사용할 나레이션 길이(ms) — 클립 길이 이하 */
  narrationMs: number;
  audioFile: string;
  plan: FramePlanScene | null;
  fadeIn: boolean;
  fadeOut: boolean;
  kenBurns: KenBurns;
}

const FADE_IN_LAYOUTS = new Set<Scene["layout"]>(["title", "chapter", "outro"]);

class RenderLog {
  private queue: Promise<void> = Promise.resolve();
  constructor(private file: string) {}
  line(text: string): void {
    const stamped = `[${new Date().toISOString()}] ${text}\n`;
    this.queue = this.queue.then(() => fs.appendFile(this.file, stamped)).catch(() => undefined);
  }
  args(label: string, args: string[]): void {
    this.line(`${label} ffmpeg ${JSON.stringify(args)}`);
  }
  flush(): Promise<void> {
    return this.queue;
  }
}

async function mtime(file: string): Promise<number> {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return -1;
  }
}

/** 출력이 있고 모든 입력보다 새로우면 true */
async function upToDate(out: string, inputs: string[]): Promise<boolean> {
  const outTime = await mtime(out);
  if (outTime < 0 || !(await fileExists(out))) return false;
  for (const f of inputs) {
    const t = await mtime(f);
    if (t < 0 || t > outTime) return false;
  }
  return true;
}

/** 폰트 TTF를 jobDir/fonts로 복사 (필터에는 상대 경로 'fonts'만 넘긴다) */
async function copyFonts(p: JobPaths, log: (l: string) => void): Promise<{ family: string; dir: string }> {
  await fs.mkdir(p.fontsDir, { recursive: true });
  const fonts = await ensureFonts();
  if (!fonts.ok) {
    log(`경고: 한글 폰트를 확보하지 못해 자막이 깨질 수 있습니다 — ${fonts.error ?? ""}`);
    return { family: fonts.family, dir: p.fontsDir };
  }
  const sources = [...new Set([fonts.regularPath, fonts.boldPath].filter((f): f is string => !!f))];
  for (const src of sources) {
    const dest = path.join(p.fontsDir, path.basename(src));
    if (await upToDate(dest, [src])) continue;
    await fs.copyFile(src, dest);
  }
  log(`폰트: ${fonts.family} (${fonts.source}) → fonts/ ${sources.length}개`);
  return { family: fonts.family, dir: p.fontsDir };
}

/** frames/credits.json 의 여러 형태를 설명문 크레딧 라인으로 정규화 */
export function creditLines(raw: unknown): string[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { credits?: unknown }).credits)
      ? ((raw as { credits: unknown[] }).credits)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    let line: string | null = null;
    if (typeof item === "string") {
      line = item.trim();
    } else if (item && typeof item === "object") {
      const o = item as { by?: unknown; photographer?: unknown; url?: unknown; provider?: unknown };
      const by = typeof o.by === "string" ? o.by : typeof o.photographer === "string" ? o.photographer : "";
      const url = typeof o.url === "string" ? o.url : "";
      if (by || url) {
        const provider = typeof o.provider === "string" && o.provider ? o.provider : "pexels";
        const label = provider.toLowerCase() === "pexels" ? "Pexels" : provider;
        line = `영상 소스: ${label} — ${by || "작자 미상"}${url ? ` (${url})` : ""}`;
      }
    }
    if (line && !seen.has(line)) {
      seen.add(line);
      out.push(line.replace(/[<>]/g, ""));
    }
  }
  return out;
}

/** 장면별 클립 계획 (페이드·켄 번즈·프레임 수 확정) */
export function planScenes(
  script: Script,
  timeline: Timeline,
  plan: FramePlan | null,
  audios: Map<string, { file: string; durationMs: number }>,
): ScenePlan[] {
  const scenes = [...script.scenes].sort((a, b) => a.index - b.index);
  const slots = new Map(timeline.scenes.map((s) => [s.sceneId, s]));
  const planned = new Map((plan?.scenes ?? []).map((s) => [s.sceneId, s]));
  return scenes.map((scene, i) => {
    const slot = slots.get(scene.id);
    if (!slot) throw new Error(`timeline.json에 장면 ${scene.id}이(가) 없습니다 — 음성 단계를 다시 실행하세요`);
    const audio = audios.get(scene.id);
    if (!audio) throw new Error(`audio/scene-${sceneNo(scene.index)}.mp3 이(가) 없습니다 — 음성 단계를 다시 실행하세요`);
    const frames = timelineFrames(slot);
    const next = scenes[i + 1];
    const ps = planned.get(scene.id) ?? null;
    return {
      scene,
      frames,
      narrationMs: Math.min(audio.durationMs, (frames * 1000) / FPS),
      audioFile: audio.file,
      plan: ps,
      fadeIn: FADE_IN_LAYOUTS.has(scene.layout),
      fadeOut: !!next && next.layout === "chapter",
      kenBurns: ps?.kenBurns ?? kenBurnsFor(scene.index),
    };
  });
}

export async function composeVideo(
  job: Job,
  script: Script,
  opts: ComposeOptions = {},
): Promise<ComposeResult> {
  const p = jobPaths(job.id);
  const log = opts.log ?? (() => undefined);
  const onProgress = opts.onProgress ?? (() => undefined);
  await fs.mkdir(p.logsDir, { recursive: true });
  await fs.mkdir(p.clipsDir, { recursive: true });
  const rlog = new RenderLog(p.renderLog);
  rlog.line(`=== render 시작 job=${job.id} force=${!!opts.force}`);

  // ── 입력 로드 ───────────────────────────────────────────────
  const timeline = await readJsonFile<Timeline>(p.timelineFile);
  if (!timeline || !timeline.scenes?.length) {
    throw new Error("audio/timeline.json 이 없습니다 — 음성 단계를 먼저 실행하세요");
  }
  const plan = await readJsonFile<FramePlan>(p.framePlanFile);
  if (!plan) log("경고: frames/plan.json 이 없습니다 — 모든 장면을 단색 배경으로 렌더합니다");
  if (!(await fileExists(p.srtFile))) {
    throw new Error("subtitles.srt 가 없습니다 — 음성 단계를 먼저 실행하세요");
  }

  const audios = new Map<string, { file: string; durationMs: number }>();
  for (const scene of script.scenes) {
    const mp3 = p.sceneAudio(scene.index);
    if (!(await fileExists(mp3))) continue;
    const meta = await readJsonFile<SceneAudio>(p.sceneAudioMeta(scene.index));
    const durationMs =
      meta && Number.isFinite(meta.durationMs) && meta.durationMs > 0 ? meta.durationMs : await probeDuration(mp3);
    audios.set(scene.id, { file: mp3, durationMs });
  }

  const scenes = planScenes(script, timeline, plan, audios);
  const totalFrames = scenes.reduce((n, s) => n + s.frames, 0);
  const totalSec = totalFrames / FPS;
  log(`장면 ${scenes.length}개, 총 ${totalFrames}프레임 (${totalSec.toFixed(1)}초)`);

  const fonts = await copyFonts(p, log);
  const cwd = p.root;
  const rel = (abs: string) => path.relative(cwd, abs) || ".";

  // ── 장면 클립 ───────────────────────────────────────────────
  const clipWeight = 0.55;
  let doneFrames = 0;
  const clipFiles: string[] = [];
  for (const s of scenes) {
    const clip = p.sceneClip(s.scene.index);
    clipFiles.push(clip);
    const label = `scene-${sceneNo(s.scene.index)}`;
    let inputs: string[] = [];
    let args: string[];
    let kindNote: string;
    const ps = s.plan;
    if (ps?.kind === "video" && ps.videoPath && (await fileExists(ps.videoPath))) {
      const overlay = ps.overlayPath && (await fileExists(ps.overlayPath)) ? ps.overlayPath : undefined;
      inputs = [ps.videoPath, ...(overlay ? [overlay] : [])];
      args = videoClipArgs({
        video: ps.videoPath,
        overlay,
        frames: s.frames,
        fadeIn: s.fadeIn,
        fadeOut: s.fadeOut,
        out: rel(clip),
      });
      kindNote = `video${overlay ? "+overlay" : ""}`;
    } else {
      let image = ps?.imagePath;
      if (!image || !(await fileExists(image))) {
        if (ps) log(`경고: ${label} 프레임 파일이 없어 단색 배경으로 대체합니다 (${ps.imagePath ?? ps.videoPath ?? "?"})`);
        else log(`경고: ${label} 이(가) plan.json에 없어 단색 배경으로 대체합니다`);
        image = path.join(p.clipsDir, `${label}-solid.png`);
        if (!(await fileExists(image))) {
          const solidArgs = solidFrameArgs(job.profile.theme.background, rel(image));
          rlog.args(`${label} solid`, solidArgs);
          await runFfmpeg(solidArgs, { cwd, onLog: (l) => rlog.line(l) });
        }
      }
      inputs = [image];
      args = imageClipArgs({
        image,
        frames: s.frames,
        kenBurns: s.kenBurns,
        fadeIn: s.fadeIn,
        fadeOut: s.fadeOut,
        out: rel(clip),
      });
      kindNote = `image ${s.kenBurns}`;
    }
    const fresh = !opts.force && (await upToDate(clip, [...inputs, p.timelineFile]));
    if (fresh) {
      log(`${label}: skip (exists) ${s.frames}f`);
    } else {
      rlog.args(label, args);
      const startFrames = doneFrames;
      await runFfmpeg(args, {
        cwd,
        totalMs: (s.frames * 1000) / FPS,
        timeoutMs: 20 * 60_000,
        onLog: (l) => rlog.line(l),
        onProgress: (r) => onProgress(((startFrames + r * s.frames) / totalFrames) * clipWeight),
      });
      log(`${label}: ${kindNote} ${s.frames}f${s.fadeIn ? " fade-in" : ""}${s.fadeOut ? " fade-out" : ""}`);
    }
    doneFrames += s.frames;
    onProgress((doneFrames / totalFrames) * clipWeight);
  }

  // ── 비디오 concat (demuxer) ─────────────────────────────────
  const listText = clipFiles.map((f) => concatListLine(f)).join("\n") + "\n";
  await fs.writeFile(p.concatListFile, listText);
  const concatArgs = ["-y", "-f", "concat", "-safe", "0", "-i", rel(p.concatListFile), "-c", "copy", rel(p.videoOnlyFile)];
  rlog.args("concat", concatArgs);
  await runFfmpeg(concatArgs, { cwd, onLog: (l) => rlog.line(l), timeoutMs: 10 * 60_000 });
  log(`video-only.mp4: ${clipFiles.length}개 클립 연결`);
  onProgress(0.58);

  // ── 나레이션 concat (프레임 정밀 패딩) ──────────────────────
  const narrationArgs = ["-y"];
  for (const s of scenes) narrationArgs.push("-i", s.audioFile);
  narrationArgs.push(
    "-filter_complex",
    audioConcatFilter(
      scenes.length,
      scenes.map((s) => s.frames),
      scenes.map((s) => s.narrationMs),
    ),
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    rel(p.narrationFile),
  );
  rlog.args("narration", narrationArgs);
  await runFfmpeg(narrationArgs, {
    cwd,
    totalMs: totalSec * 1000,
    timeoutMs: 10 * 60_000,
    onLog: (l) => rlog.line(l),
    onProgress: (r) => onProgress(0.58 + r * 0.05),
  });
  log("narration.m4a 생성");

  // ── BGM 믹스 + loudnorm ─────────────────────────────────────
  let bgm = opts.bgmPath ?? profileBgmPath(job.profile);
  if (bgm && !(await fileExists(bgm))) {
    log(`경고: BGM 파일이 없어 건너뜁니다 — ${bgm}`);
    bgm = undefined;
  }
  const mixArgs = ["-y", "-i", rel(p.narrationFile)];
  if (bgm) mixArgs.push(...bgmInputArgs(bgm, totalSec));
  mixArgs.push(
    "-filter_complex",
    mixFilter({ bgm: !!bgm, ducking: !!bgm, totalSec }),
    "-map",
    "[a]",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    rel(p.mixedAudioFile),
  );
  rlog.args("mix", mixArgs);
  await runFfmpeg(mixArgs, {
    cwd,
    totalMs: totalSec * 1000,
    timeoutMs: 10 * 60_000,
    onLog: (l) => rlog.line(l),
    onProgress: (r) => onProgress(0.63 + r * 0.05),
  });
  log(bgm ? `mixed.m4a 생성 (BGM 덕킹: ${path.basename(bgm)})` : "mixed.m4a 생성 (BGM 없음, loudnorm)");
  onProgress(0.68);

  // ── 최종 패스: 진행 바 + 자막 ──────────────────────────────
  const progressBar = opts.progressBar ?? job.options.progressBar ?? true;
  const fArgs = finalArgs({
    video: rel(p.videoOnlyFile),
    audio: rel(p.mixedAudioFile),
    srt: rel(p.srtFile),
    fontsDir: rel(fonts.dir),
    family: fonts.family,
    progressBar,
    accent: job.profile.theme.accent,
    totalSec,
    totalFrames,
    out: rel(p.finalVideo),
  });
  rlog.args("final", fArgs);
  await runFfmpeg(fArgs, {
    cwd,
    totalMs: totalSec * 1000,
    timeoutMs: 60 * 60_000,
    onLog: (l) => rlog.line(l),
    onProgress: (r) => onProgress(0.68 + r * 0.3),
  });
  onProgress(0.98);

  // ── 검증 + 메타데이터 ───────────────────────────────────────
  const durationMs = await probeDuration(p.finalVideo);
  const drift = durationMs - timeline.totalMs;
  log(`final.mp4: ${(durationMs / 1000).toFixed(2)}초 (타임라인 대비 ${drift >= 0 ? "+" : ""}${drift}ms)${progressBar ? ", 진행 바" : ""}, 자막 번인`);
  if (Math.abs(drift) > 500) log(`경고: 영상 길이가 타임라인과 ${drift}ms 차이 납니다`);

  const base = (await loadMetadata(job.id)) ?? buildInitialMetadata(script);
  const credits = creditLines(await readJsonFile<unknown>(p.creditsFile));
  const markers = chapterMarkers(script, timeline);
  const { meta, notes } = sanitizeMetadata(applyChapters(base, markers, durationMs, credits));
  await writeJsonFile(p.metadataFile, meta);
  log(`metadata.json 갱신: 챕터 ${markers.length}개${credits.length ? `, 크레딧 ${credits.length}줄` : ""}${notes.length ? ` (${notes.join(", ")})` : ""}`);

  rlog.line(`=== render 완료 ${durationMs}ms`);
  await rlog.flush();
  onProgress(1);
  return { videoPath: p.finalVideo, durationMs, metadata: meta };
}
