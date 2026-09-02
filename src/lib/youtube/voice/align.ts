import type { WordTiming } from "../types";

/**
 * 단어 타이밍 정렬·정리 (순수 함수 — 공급자와 무관)
 *
 * - Edge WordBoundary 토큰은 구두점이 빠져 있다 → 정리된 나레이션 원문에 커서를 두고 토큰을 찾아
 *   다음 공백 직전까지의 부분 문자열("문장입니다.")을 WordTiming.text로 복원한다.
 * - Edge mp3 끝에는 ~1.1초 무음이 붙는다 → durationMs = min(파일 길이, 마지막 단어 끝 + 250ms).
 * - 분당 글자 수 실측 = 총 글자 수 / (Σ durationMs / 60000).
 */

/** 100 ns 틱(Edge Offset/Duration) → ms */
export function ticksToMs(ticks: number): number {
  return Math.round(ticks / 10_000);
}

/** 마지막 단어 뒤에 남길 여유 (ms) */
export const WORD_TAIL_MS = 250;
/** 단어 타이밍이 없을 때 파일 끝에서 잘라낼 무음 추정치 (ms) */
export const BLIND_TRIM_MS = 600;
/** 잘라낸 뒤 최소 길이 (ms) */
export const MIN_SCENE_MS = 500;

/** 토큰을 원문에서 찾을 때 허용하는 최대 건너뛰기 거리 (문자) — 멀리서 우연히 일치하는 것을 막는다 */
const MAX_SKIP = 40;

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

/**
 * 토큰 배열을 원문에 정렬해 각 토큰이 속한 "공백 단위 단어"(구두점 포함)를 돌려준다.
 *
 * 규칙:
 * 1. cursor 이후에서 indexOf(token) → 못 찾거나 너무 멀면 토큰 그대로, 커서는 그대로.
 * 2. 찾으면 단어 끝 = 다음 공백 직전. 단, 다음 토큰이 정확히 이 토큰 바로 뒤에 이어지면
 *    (Edge가 한 어절을 두 토큰으로 쪼갠 경우) 토큰 끝까지만 취해 중복을 막는다.
 * 3. 커서는 취한 부분 문자열의 끝으로 이동.
 */
export function alignTokensToText(tokens: string[], text: string): string[] {
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) {
      out.push(token);
      continue;
    }
    const at = text.indexOf(token, cursor);
    if (at < 0 || at - cursor > MAX_SKIP) {
      out.push(token);
      continue;
    }
    const tokenEnd = at + token.length;
    let end = tokenEnd;
    const next = tokens[i + 1];
    const nextIsAttached =
      !!next && !isSpace(text[tokenEnd]) && text.startsWith(next, tokenEnd);
    if (!nextIsAttached) {
      while (end < text.length && !isSpace(text[end])) end++;
    }
    out.push(text.slice(at, end));
    cursor = end;
  }
  return out;
}

/** 단어 타이밍 텍스트에 구두점 복원 (타이밍은 그대로) */
export function restorePunctuation(words: WordTiming[], narration: string): WordTiming[] {
  const texts = alignTokensToText(
    words.map((w) => w.text),
    narration,
  );
  return words.map((w, i) => ({ ...w, text: texts[i] }));
}

/**
 * 장면 오디오의 사용 길이.
 * 단어 타이밍이 있으면 min(파일 길이, 마지막 단어 끝 + 250), 없으면 파일 길이 − 600 (하한 500ms, 파일보다 길지 않게).
 */
export function trimmedDurationMs(fileDurationMs: number, words: WordTiming[]): number {
  const file = Math.max(0, Math.round(fileDurationMs));
  const floor = Math.min(file, MIN_SCENE_MS);
  const lastEnd = words.reduce((m, w) => Math.max(m, w.endMs), 0);
  const raw = lastEnd > 0 ? Math.min(file, lastEnd + WORD_TAIL_MS) : file - BLIND_TRIM_MS;
  return Math.max(floor, Math.round(raw));
}

/** 단어 타이밍 정리: 단조 증가·음수 방지·파일 길이 초과 방지 */
export function sanitizeWords(words: WordTiming[], maxMs?: number): WordTiming[] {
  const out: WordTiming[] = [];
  let prevEnd = 0;
  for (const w of words) {
    const text = w.text.trim();
    if (!text) continue;
    let startMs = Math.max(0, Math.round(w.startMs));
    let endMs = Math.max(startMs, Math.round(w.endMs));
    if (startMs < prevEnd) startMs = prevEnd;
    if (endMs < startMs) endMs = startMs;
    if (maxMs !== undefined) {
      startMs = Math.min(startMs, maxMs);
      endMs = Math.min(endMs, maxMs);
    }
    out.push({ text, startMs, endMs });
    prevEnd = endMs;
  }
  return out;
}

/** 실측 분당 글자 수 — totalChars / (Σ durationMs / 60000), 길이 0이면 0 */
export function measuredCharsPerMinute(
  items: { chars: number; durationMs: number }[],
): number {
  const chars = items.reduce((n, i) => n + i.chars, 0);
  const ms = items.reduce((n, i) => n + Math.max(0, i.durationMs), 0);
  if (ms <= 0 || chars <= 0) return 0;
  return Math.round((chars / (ms / 60_000)) * 10) / 10;
}
