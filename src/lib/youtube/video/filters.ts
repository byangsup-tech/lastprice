import type { KenBurns } from "../types";
import { FPS, SAMPLES_PER_FRAME } from "../timeline";

/**
 * ffmpeg 필터 그래프·인자 빌더 (순수 함수 — 파일 시스템·프로세스 접근 없음).
 *
 * 타이밍 계약(SPEC-ADDENDUM §B·§I):
 * - 장면 클립은 프레임 단위(F): 단일 이미지 입력 + zoompan d=F + `-frames:v F`
 * - 켄 번즈 모션은 클립 길이에 맞춰 스케일: z='1+0.10*on/D' (D = F, 숫자로 치환)
 * - 오디오는 aresample=48000 → atrim → asetpts → apad=whole_len=F*1920 으로 정확히 F프레임
 * - 오디오 그래프 끝은 항상 aformat=sample_rates=48000:channel_layouts=stereo
 * - 필터 안 경로는 상대 경로만 (cwd = jobDir) — 절대 경로·이스케이프 금지
 */

export const OUT_W = 1920;
export const OUT_H = 1080;
/** zoompan 입력 해상도 (1.2배 — 줌 1.0에서도 여유가 있도록) */
export const ZOOM_W = 2304;
export const ZOOM_H = 1296;
export const AUDIO_TAIL = "aformat=sample_rates=48000:channel_layouts=stereo";
export const LOUDNORM = "loudnorm=I=-16:TP=-1.5:LRA=11";
export const FADE_SEC = 0.3;
export const BAR_HEIGHT = 6;
/** BGM 볼륨 — 덕킹 있으면 0.18(압축이 눌러줌), 없으면 0.10 */
export const BGM_VOLUME_DUCKED = 0.18;
export const BGM_VOLUME_PLAIN = 0.1;

const KEN_BURNS_CYCLE: KenBurns[] = ["in", "right", "out", "left"];

/** 장면 순번으로 켄 번즈 방향 순환 (in → right → out → left) */
export function kenBurnsFor(index: number): KenBurns {
  return KEN_BURNS_CYCLE[((index % 4) + 4) % 4];
}

/** 초 단위 문자열 (소수 3자리) */
export function sec(n: number): string {
  return (Math.max(0, n)).toFixed(3);
}

export function framesSec(frames: number): string {
  return sec(frames / FPS);
}

/**
 * zoompan 필터 식 — 모션을 클립 길이(D = frames)에 맞춰 스케일.
 * in:  z='1+0.10*on/D'
 * out: z='1.10-0.10*on/D'
 * left/right: z='1.06', x가 on/D에 비례해 이동
 * 항상 y='ih/2-(ih/zoom/2)', in/out은 x='iw/2-(iw/zoom/2)'
 */
export function zoompanExpr(kenBurns: KenBurns, frames: number): string {
  const D = Math.max(1, Math.round(frames));
  let z: string;
  let x: string;
  switch (kenBurns) {
    case "out":
      z = `1.10-0.10*on/${D}`;
      x = "iw/2-(iw/zoom/2)";
      break;
    case "right":
      z = "1.06";
      x = `(iw-iw/zoom)*on/${D}`;
      break;
    case "left":
      z = "1.06";
      x = `(iw-iw/zoom)*(1-on/${D})`;
      break;
    case "in":
    default:
      z = `1+0.10*on/${D}`;
      x = "iw/2-(iw/zoom/2)";
      break;
  }
  const y = "ih/2-(ih/zoom/2)";
  return `zoompan=z='${z}':x='${x}':y='${y}':d=${D}:s=${OUT_W}x${OUT_H}:fps=${FPS}`;
}

/** 페이드 필터 — title/chapter/outro 장면 시작(in), 챕터 카드 직전 장면 끝(out) */
export function fadeFilters(frames: number, fadeIn: boolean, fadeOut: boolean): string[] {
  const out: string[] = [];
  const total = frames / FPS;
  if (fadeIn) out.push(`fade=t=in:st=0:d=${sec(Math.min(FADE_SEC, total))}`);
  if (fadeOut) {
    const d = Math.min(FADE_SEC, total);
    out.push(`fade=t=out:st=${sec(total - d)}:d=${sec(d)}`);
  }
  return out;
}

const VIDEO_CODEC_ARGS = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"];

export interface ImageClipInput {
  /** PNG/JPG 경로 (-i 인자 — 절대 경로 가능) */
  image: string;
  frames: number;
  kenBurns: KenBurns;
  fadeIn?: boolean;
  fadeOut?: boolean;
  /** 출력 mp4 경로 */
  out: string;
}

/** 단일 이미지 → F프레임 무음 클립 (켄 번즈) */
export function imageClipArgs(i: ImageClipInput): string[] {
  const F = Math.max(1, Math.round(i.frames));
  const chain = [
    `scale=${ZOOM_W}:${ZOOM_H}`,
    zoompanExpr(i.kenBurns, F),
    "setsar=1",
    ...fadeFilters(F, !!i.fadeIn, !!i.fadeOut),
    "format=yuv420p",
  ];
  return [
    "-y",
    "-i",
    i.image,
    "-vf",
    chain.join(","),
    "-frames:v",
    String(F),
    "-r",
    String(FPS),
    ...VIDEO_CODEC_ARGS,
    "-an",
    i.out,
  ];
}

export interface VideoClipInput {
  /** 스톡 영상 mp4 (-stream_loop -1 로 반복) */
  video: string;
  /** 알파 PNG 오버레이 (선택) */
  overlay?: string;
  frames: number;
  fadeIn?: boolean;
  fadeOut?: boolean;
  out: string;
}

/** 스톡 영상 루프 + 카드 오버레이 → F프레임 무음 클립 */
export function videoClipArgs(i: VideoClipInput): string[] {
  const F = Math.max(1, Math.round(i.frames));
  const bg = `[0:v]scale=${OUT_W}:${OUT_H}:force_original_aspect_ratio=increase,crop=${OUT_W}:${OUT_H},fps=${FPS},setsar=1`;
  const tail = [...fadeFilters(F, !!i.fadeIn, !!i.fadeOut), "format=yuv420p"].join(",");
  const graph = i.overlay
    ? `${bg}[bg];[bg][1:v]overlay=0:0:format=auto,${tail}[v]`
    : `${bg},${tail}[v]`;
  const inputs = ["-stream_loop", "-1", "-i", i.video];
  if (i.overlay) inputs.push("-i", i.overlay);
  return [
    "-y",
    ...inputs,
    "-filter_complex",
    graph,
    "-map",
    "[v]",
    "-frames:v",
    String(F),
    "-r",
    String(FPS),
    ...VIDEO_CODEC_ARGS,
    "-an",
    i.out,
  ];
}

/**
 * 장면 mp3 N개 → 정확히 ΣF 프레임 길이의 나레이션.
 * 입력 i: aresample=48000 → 스테레오 → atrim=0:<durationMs/1000> → asetpts → apad=whole_len=<F*1920>
 * 끝: concat=n=N:v=0:a=1 → aformat(48k 스테레오). 출력 라벨 [a].
 */
export function audioConcatFilter(n: number, framesPerScene: number[], durationsMs: number[]): string {
  if (n < 1) throw new Error("오디오 입력이 없습니다");
  if (framesPerScene.length < n || durationsMs.length < n) {
    throw new Error(`framesPerScene/durationsMs 길이가 입력 수(${n})보다 작습니다`);
  }
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const F = Math.max(1, Math.round(framesPerScene[i]));
    // 나레이션이 클립보다 길면(이론상 불가) 클립 길이까지만 사용
    const durSec = Math.min(Math.max(0, durationsMs[i]) / 1000, F / FPS);
    parts.push(
      `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:${sec(durSec)},asetpts=PTS-STARTPTS,apad=whole_len=${F * SAMPLES_PER_FRAME}[a${i}]`,
    );
  }
  const labels = Array.from({ length: n }, (_, i) => `[a${i}]`).join("");
  parts.push(`${labels}concat=n=${n}:v=0:a=1,${AUDIO_TAIL}[a]`);
  return parts.join(";");
}

export interface MixInput {
  /** BGM 입력([1:a])이 있는지 */
  bgm: boolean;
  /** 사이드체인 덕킹 사용 (bgm이 true일 때만 의미) */
  ducking: boolean;
  totalSec: number;
}

/**
 * 나레이션([0:a]) + 선택 BGM([1:a]) → loudnorm → aformat. 출력 라벨 [a].
 * 덕킹: [nar]asplit=2[n1][n2]; [bgm]volume=0.18[b]; [b][n2]sidechaincompress[bd]; [n1][bd]amix
 */
export function mixFilter(o: MixInput): string {
  if (!o.bgm) return `[0:a]${LOUDNORM},${AUDIO_TAIL}[a]`;
  const total = Math.max(0, o.totalSec);
  const fadeD = Math.min(3, total);
  const fadeSt = Math.max(0, total - 3);
  const afade = `afade=t=out:st=${sec(fadeSt)}:d=${sec(fadeD)}`;
  const bgmPrep = `[1:a]aresample=48000,aformat=channel_layouts=stereo`;
  const mix = `amix=inputs=2:duration=first:dropout_transition=0,${LOUDNORM},${AUDIO_TAIL}[a]`;
  if (!o.ducking) {
    return [
      `${bgmPrep},volume=${BGM_VOLUME_PLAIN},${afade}[b]`,
      `[0:a][b]${mix}`,
    ].join(";");
  }
  return [
    `[0:a]asplit=2[n1][n2]`,
    `${bgmPrep},volume=${BGM_VOLUME_DUCKED},${afade}[b]`,
    `[b][n2]sidechaincompress=threshold=0.015:ratio=8:attack=40:release=500:makeup=1[bd]`,
    `[n1][bd]${mix}`,
  ].join(";");
}

/** BGM 입력 인자: -stream_loop -1 -t <totalSec> -i bgm */
export function bgmInputArgs(bgmPath: string, totalSec: number): string[] {
  return ["-stream_loop", "-1", "-t", sec(totalSec), "-i", bgmPath];
}

/** "#14b8a6" → lavfi color 값 "0x14b8a6" (검증 실패 시 teal 기본값) */
export function lavfiColor(hex: string | undefined): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  return `0x${m ? m[1].toLowerCase() : "14b8a6"}`;
}

/** libass force_style — PlayRes 384×288 기준 (FontSize=26 ≈ 1080p에서 자막 한 줄 ≈ 21자) */
export function forceStyle(family: string): string {
  const name = family.replace(/[,'"\\]/g, " ").replace(/\s+/g, " ").trim() || "sans-serif";
  return [
    `FontName=${name}`,
    "FontSize=26",
    "Bold=1",
    "PrimaryColour=&H00FFFFFF",
    "OutlineColour=&H00000000",
    "BackColour=&H80000000",
    "BorderStyle=1",
    "Outline=2",
    "Shadow=0",
    "MarginV=20",
    "MarginL=40",
    "MarginR=40",
    "Alignment=2",
  ].join(",");
}

export interface FinalInput {
  /** 무음 비디오 (concat 결과) — -i 인자 */
  video: string;
  /** 믹스된 오디오 — -i 인자 */
  audio: string;
  /** 자막 SRT — 필터 안에 들어가므로 jobDir 기준 상대 경로 */
  srt: string;
  /** 폰트 디렉터리 — 상대 경로 ('fonts') */
  fontsDir: string;
  family: string;
  progressBar: boolean;
  accent: string;
  totalSec: number;
  /** 총 프레임 수 — 지정 시 -frames:v 로 정확히 자름 */
  totalFrames?: number;
  out: string;
}

/**
 * 최종 패스: [0:v] (+ 진행 바 overlay) → subtitles → libx264 medium crf 20; 오디오는 정확히 총 길이로 trim/pad.
 * 진행 바: -f lavfi -i color=c=<accent>:s=1920x6 를 [2:v]로, overlay x='-1920+1920*t/<totalSec>':y=1074:shortest=1
 */
export function finalArgs(o: FinalInput): string[] {
  const total = Math.max(0.04, o.totalSec);
  const chains: string[] = [];
  let vin = "[0:v]";
  if (o.progressBar) {
    chains.push(`${vin}[2:v]overlay=x='-${OUT_W}+${OUT_W}*t/${sec(total)}':y=${OUT_H - BAR_HEIGHT}:shortest=1[vb]`);
    vin = "[vb]";
  }
  chains.push(`${vin}subtitles=${o.srt}:fontsdir=${o.fontsDir}:force_style='${forceStyle(o.family)}'[v]`);
  const totalSamples = o.totalFrames
    ? o.totalFrames * SAMPLES_PER_FRAME
    : Math.round(total * FPS) * SAMPLES_PER_FRAME;
  chains.push(`[1:a]atrim=0:${sec(total)},asetpts=PTS-STARTPTS,apad=whole_len=${totalSamples},${AUDIO_TAIL}[a]`);
  const args = ["-y", "-i", o.video, "-i", o.audio];
  if (o.progressBar) {
    args.push("-f", "lavfi", "-i", `color=c=${lavfiColor(o.accent)}:s=${OUT_W}x${BAR_HEIGHT}:r=${FPS}`);
  }
  args.push("-filter_complex", chains.join(";"), "-map", "[v]", "-map", "[a]");
  if (o.totalFrames) args.push("-frames:v", String(o.totalFrames));
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    "-shortest",
    o.out,
  );
  return args;
}

/** 단색 프레임 PNG 생성 인자 (plan에 장면이 없을 때 폴백) */
export function solidFrameArgs(hex: string | undefined, out: string): string[] {
  return [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${lavfiColor(hex)}:s=${ZOOM_W}x${ZOOM_H}:r=${FPS}`,
    "-frames:v",
    "1",
    out,
  ];
}
