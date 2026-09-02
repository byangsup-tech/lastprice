import type { Script, Timeline, VideoMetadata } from "../types";
import { formatChapterTime } from "../util";

/**
 * 유튜브 챕터(타임스탬프) 생성.
 * 규칙: 첫 챕터는 0:00, 최소 3개, 각 챕터 ≥ 10초 — 위반하면 유튜브가 챕터를 무시하므로 여기서 걸러낸다.
 */

export interface ChapterMarker {
  title: string;
  startMs: number;
}

export const MIN_CHAPTER_MS = 10_000;

export function chapterMarkers(script: Script, timeline: Timeline): ChapterMarker[] {
  const startOf = new Map(timeline.scenes.map((s) => [s.sceneId, s.startMs]));
  const markers: ChapterMarker[] = [{ title: "인트로", startMs: 0 }];
  const seen = new Set<number>();
  for (const scene of script.scenes) {
    if (scene.layout !== "chapter" || scene.chapterIndex < 0 || seen.has(scene.chapterIndex)) continue;
    const start = startOf.get(scene.id);
    if (start === undefined) continue;
    seen.add(scene.chapterIndex);
    markers.push({ title: script.chapters[scene.chapterIndex]?.title ?? scene.heading ?? `${scene.chapterIndex + 1}부`, startMs: start });
  }
  const outro = script.scenes.find((s) => s.layout === "outro");
  if (outro) {
    const start = startOf.get(outro.id);
    if (start !== undefined) markers.push({ title: "마무리", startMs: start });
  }
  // 10초 미만 간격 제거 (앞 챕터 유지)
  const filtered: ChapterMarker[] = [];
  for (const m of markers.sort((a, b) => a.startMs - b.startMs)) {
    const prev = filtered[filtered.length - 1];
    if (prev && m.startMs - prev.startMs < MIN_CHAPTER_MS) continue;
    filtered.push(m);
  }
  // 마지막 챕터도 영상 끝까지 10초 이상이어야 함
  if (filtered.length > 1 && timeline.totalMs - filtered[filtered.length - 1].startMs < MIN_CHAPTER_MS) {
    filtered.pop();
  }
  return filtered.length >= 3 ? filtered : [];
}

export function formatChapterLines(markers: ChapterMarker[]): string {
  return markers.map((m) => `${formatChapterTime(m.startMs)} ${m.title}`).join("\n");
}

/** 설명문 본문 + 타임라인 + 크레딧 합성 (유튜브 제한: 5000자, 꺾쇠 금지) */
export function composeDescription(body: string, markers: ChapterMarker[], credits: string[] = []): string {
  const parts = [body.trim()];
  if (markers.length) parts.push(`타임라인\n${formatChapterLines(markers)}`);
  if (credits.length) parts.push(credits.join("\n"));
  return parts
    .join("\n\n")
    .replace(/[<>]/g, "")
    .slice(0, 5000);
}

export function applyChapters(
  metadata: VideoMetadata,
  markers: ChapterMarker[],
  durationMs: number,
  credits: string[] = [],
): VideoMetadata {
  const baseBody = stripGeneratedSections(metadata.description);
  return {
    ...metadata,
    chapters: markers,
    durationMs,
    credits: credits.length ? credits : metadata.credits,
    description: composeDescription(baseBody, markers, credits.length ? credits : (metadata.credits ?? [])),
  };
}

/** 이전 실행이 붙인 타임라인/크레딧 섹션 제거 (재실행 시 중복 방지) */
export function stripGeneratedSections(description: string): string {
  return description
    .replace(/\n\n타임라인\n(?:\d+:\d\d(?::\d\d)? [^\n]*\n?)+/g, "")
    .replace(/\n\n영상 소스: Pexels[^\n]*(?:\n[^\n]*)*$/g, "")
    .trim();
}
