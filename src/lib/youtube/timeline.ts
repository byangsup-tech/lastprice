import { SCENE_PAD_MS, type SceneAudio, type Timeline } from "./types";

/**
 * 타임라인 양자화 규칙 — 음성·자막·영상 합성이 모두 같은 프레임 단위를 쓴다.
 *
 * 영상은 25 fps 정수 프레임으로 잘리므로, 장면 길이를 프레임 단위로 먼저 반올림하고
 * (F = round((나레이션 ms + 패드) / 40)), 오디오는 정확히 F × 1920 샘플(48 kHz)로 패딩한다.
 * 이렇게 하면 장면이 50개여도 영상·오디오·자막·챕터 위치가 어긋나지 않는다.
 */

export const FPS = 25;
export const FRAME_MS = 1000 / FPS; // 40
export const AUDIO_RATE = 48_000;
export const SAMPLES_PER_FRAME = AUDIO_RATE / FPS; // 1920

/** 장면 클립 프레임 수 (나레이션 + 패드, 최소 1초) */
export function sceneFrames(narrationMs: number, padMs = SCENE_PAD_MS): number {
  const frames = Math.round((Math.max(0, narrationMs) + padMs) / FRAME_MS);
  return Math.max(FPS, frames);
}

export function framesToMs(frames: number): number {
  return Math.round(frames * FRAME_MS);
}

export function framesToSamples(frames: number): number {
  return frames * SAMPLES_PER_FRAME;
}

/** 초 단위 문자열 (ffmpeg -t 등) */
export function framesToSeconds(frames: number): string {
  return (frames / FPS).toFixed(3);
}

/** 장면 오디오 목록 → 양자화된 타임라인 (scene 순서 = audios 순서) */
export function buildTimeline(audios: SceneAudio[], padMs = SCENE_PAD_MS): Timeline {
  let cursor = 0;
  const scenes = audios.map((a) => {
    const frames = sceneFrames(a.durationMs, padMs);
    const startMs = cursor;
    const endMs = cursor + framesToMs(frames);
    cursor = endMs;
    return { sceneId: a.sceneId, startMs, endMs };
  });
  return { scenes, totalMs: cursor };
}

/** 타임라인 장면 길이 → 프레임 수 (양자화된 값이므로 정확히 나누어떨어진다) */
export function timelineFrames(scene: Timeline["scenes"][number]): number {
  return Math.round((scene.endMs - scene.startMs) / FRAME_MS);
}
