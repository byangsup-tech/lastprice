import type { Caption, SceneAudio, Timeline, WordTiming } from "../types";
import { formatSrtTime } from "../util";

/**
 * 단어 타이밍 → 자막 캡션.
 * - 문장 종결 부호(. ? ! …)에서 끊고, 한 줄 maxChars(한글 기준 20자) 초과 시 줄바꿈, 최대 2줄
 * - 캡션 길이 minDurationMs~maxDurationMs, 서로 겹치지 않게 (다음 캡션 시작 − 40 ms)
 * - 오프셋 = 장면 startMs + 단어 startMs
 */

export interface CaptionOptions {
  maxChars?: number;
  maxLines?: number;
  maxDurationMs?: number;
  minDurationMs?: number;
  /** 마지막 단어 뒤 여유 */
  tailMs?: number;
}

const DEFAULTS: Required<CaptionOptions> = {
  maxChars: 20,
  maxLines: 2,
  maxDurationMs: 4500,
  minDurationMs: 800,
  tailMs: 120,
};

const SENTENCE_END = /[.?!…]["'”’)\]]?$/;

/** 단어 타이밍이 없을 때 글자 수 비례로 만든다 (OpenAI TTS 등) */
export function proportionalWords(text: string, durationMs: number): WordTiming[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((n, t) => n + t.length, 0) || 1;
  // 단어 사이 짧은 간격을 두고 글자 수에 비례 배분
  let cursor = 0;
  const usable = Math.max(0, durationMs - 150);
  return tokens.map((t) => {
    const len = (t.length / totalChars) * usable;
    const w = { text: t, startMs: Math.round(cursor), endMs: Math.round(cursor + len) };
    cursor += len;
    return w;
  });
}

interface Line {
  words: WordTiming[];
  text: string;
}

function groupLines(words: WordTiming[], maxChars: number): Line[] {
  const lines: Line[] = [];
  let cur: WordTiming[] = [];
  let curText = "";
  const flush = () => {
    if (cur.length) lines.push({ words: cur, text: curText });
    cur = [];
    curText = "";
  };
  for (const w of words) {
    const candidate = curText ? `${curText} ${w.text}` : w.text;
    if (curText && candidate.length > maxChars) flush();
    cur.push(w);
    curText = curText ? `${curText} ${w.text}` : w.text;
    if (SENTENCE_END.test(w.text)) flush();
  }
  flush();
  return lines;
}

/** 한 장면의 단어들 → 캡션 (장면 기준 상대 시간) */
function captionsForScene(words: WordTiming[], o: Required<CaptionOptions>): Omit<Caption, "index">[] {
  if (!words.length) return [];
  const lines = groupLines(words, o.maxChars);
  const out: Omit<Caption, "index">[] = [];
  let i = 0;
  while (i < lines.length) {
    const first = lines[i];
    const block: Line[] = [first];
    // 두 번째 줄은 첫 줄이 문장 끝이 아닐 때만 붙인다 (문장 단위 가독성)
    const firstEndsSentence = SENTENCE_END.test(first.text);
    if (!firstEndsSentence && o.maxLines >= 2 && i + 1 < lines.length) {
      const next = lines[i + 1];
      const span = next.words[next.words.length - 1].endMs - first.words[0].startMs;
      if (span <= o.maxDurationMs) block.push(next);
    }
    const blockWords = block.flatMap((l) => l.words);
    const startMs = blockWords[0].startMs;
    let endMs = blockWords[blockWords.length - 1].endMs + o.tailMs;
    if (endMs - startMs > o.maxDurationMs) endMs = startMs + o.maxDurationMs;
    out.push({ startMs, endMs, text: block.map((l) => l.text).join("\n") });
    i += block.length;
  }
  // 너무 짧은 캡션은 최소 길이까지 늘리되 다음 캡션과 겹치지 않게
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    if (c.endMs - c.startMs < o.minDurationMs) c.endMs = c.startMs + o.minDurationMs;
    const next = out[k + 1];
    if (next && c.endMs > next.startMs - 40) c.endMs = Math.max(c.startMs + 200, next.startMs - 40);
  }
  return out;
}

export function buildCaptions(
  audios: SceneAudio[],
  timeline: Timeline,
  options: CaptionOptions = {},
): Caption[] {
  const o = { ...DEFAULTS, ...options };
  const starts = new Map(timeline.scenes.map((s) => [s.sceneId, s]));
  const all: Caption[] = [];
  for (const a of audios) {
    const slot = starts.get(a.sceneId);
    if (!slot) continue;
    const words = a.words.length ? a.words : proportionalWords(narrationFromWords(a), a.durationMs);
    const local = captionsForScene(words, o);
    for (const c of local) {
      all.push({
        index: all.length + 1,
        startMs: slot.startMs + c.startMs,
        // 장면 경계를 넘지 않게
        endMs: Math.min(slot.startMs + c.endMs, slot.endMs - 40),
        text: c.text,
      });
    }
  }
  // 전역 겹침 방지 (장면 경계에서)
  for (let k = 0; k + 1 < all.length; k++) {
    if (all[k].endMs > all[k + 1].startMs - 40) {
      all[k].endMs = Math.max(all[k].startMs + 200, all[k + 1].startMs - 40);
    }
  }
  return all.filter((c) => c.endMs > c.startMs && c.text.trim());
}

/** SceneAudio에 텍스트가 없고 단어도 없을 때를 위한 보조 (words[]가 비면 빈 문자열) */
function narrationFromWords(a: SceneAudio): string {
  return a.words.map((w) => w.text).join(" ");
}

/** 나레이션 텍스트 + 길이만 있을 때 (타이밍 없는 공급자) */
export function proportionalSceneAudio(a: SceneAudio, narration: string): SceneAudio {
  return { ...a, words: proportionalWords(narration, a.durationMs) };
}

export function toSrt(captions: Caption[]): string {
  return (
    captions
      .map((c) => `${c.index}\n${formatSrtTime(c.startMs)} --> ${formatSrtTime(c.endMs)}\n${c.text}`)
      .join("\n\n") + "\n"
  );
}

/** ms 단위 단어를 SRT 문자열 검증용으로 다시 파싱 (테스트·디버깅) */
export function parseSrt(srt: string): Caption[] {
  const blocks = srt.replace(/\r/g, "").trim().split(/\n\n+/);
  const out: Caption[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const m = /(\d\d):(\d\d):(\d\d),(\d{3}) --> (\d\d):(\d\d):(\d\d),(\d{3})/.exec(lines[1] ?? "");
    if (!m) continue;
    const ms = (h: string, mi: string, s: string, x: string) =>
      ((Number(h) * 60 + Number(mi)) * 60 + Number(s)) * 1000 + Number(x);
    out.push({
      index: Number(lines[0]),
      startMs: ms(m[1], m[2], m[3], m[4]),
      endMs: ms(m[5], m[6], m[7], m[8]),
      text: lines.slice(2).join("\n"),
    });
  }
  return out;
}
