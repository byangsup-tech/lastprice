import { promises as fs } from "fs";
import { ttsProvider, ttsVoice } from "../config";
import { fileExists, readJsonFile, writeJsonFile } from "../jobs";
import { jobPaths } from "../paths";
import { buildTimeline } from "../timeline";
import { probeDuration } from "../tools/ffmpeg";
import type {
  Job,
  SceneAudio,
  Scene,
  Script,
  Timeline,
  TtsProvider,
  WordTiming,
} from "../types";
import { cleanNarration, hashId, sleep } from "../util";
import {
  measuredCharsPerMinute,
  restorePunctuation,
  sanitizeWords,
  trimmedDurationMs,
} from "./align";
import { createEdgeSynthesizer } from "./edge";
import { createElevenLabsSynthesizer } from "./elevenlabs";
import { createOpenAiSynthesizer, resolveOpenAiVoice } from "./openai";
import { buildCaptions, proportionalWords, toSrt } from "./subtitles";

/**
 * 음성 단계 — 장면별 나레이션을 TTS로 합성하고 단어 타이밍·타임라인·자막을 만든다.
 *
 * 공급자: edge(기본, 키 불필요) · openai · elevenlabs — 모두 SceneSynthesizer 인터페이스.
 * - 장면별 캐시: audio/scene-XXX.mp3 + scene-XXX.json (narrationHash·provider·voice·rate 일치) 이면 건너뜀
 * - 동시성 기본 2, 재시도 ×3 (1s/2s/4s), 장면당 타임아웃 90초
 * - 길이는 ffmpeg probeDuration, 꼬리 무음은 align.trimmedDurationMs로 제거
 * - 결과: timeline.json, subtitles.srt, captions.json, 실측 분당 글자 수
 */

// ── 공급자 계약 ──────────────────────────────────────────────

export interface SynthesisRequest {
  sceneId: string;
  /** 정리된 나레이션 (SSML 이스케이프 전 원문) */
  text: string;
  /** 최종 mp3 경로 — 공급자가 이 위치에 파일을 써야 한다 */
  outFile: string;
  /** 장면 전용 임시 디렉터리 (호출자가 만들고 지운다) */
  workDir: string;
  /** 타임아웃 시 abort — 공급자는 연결을 닫아야 한다 */
  signal: AbortSignal;
}

export interface SynthesisResult {
  /** 공급자가 준 단어 타이밍 (장면 시작 기준 ms). 없으면 [] */
  words: WordTiming[];
  /** true = 실제 타이밍, false = 비례 배분 필요 */
  timed: boolean;
}

export interface SceneSynthesizer {
  provider: TtsProvider;
  voice: string;
  rate: string;
  synthesize(req: SynthesisRequest): Promise<SynthesisResult>;
}

/** 공급자 오류 — retryable=false면 즉시 실패 (키 없음, 400 등) */
export class TtsError extends Error {
  retryable: boolean;
  status?: number;
  constructor(message: string, opts: { retryable: boolean; status?: number; cause?: unknown } = { retryable: true }) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = "TtsError";
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

const NETWORK_ERROR_RE =
  /websocket|socket hang up|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|EPIPE|premature close|network|timeout|시간 초과|fetch failed|No audio data received|No metadata received|not open|closed before/i;

/** 재시도 가능한 오류인지 — TtsError는 플래그, 나머지는 네트워크 계열 메시지로 판단 */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof TtsError) return err.retryable;
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return NETWORK_ERROR_RE.test(msg);
}

// ── 옵션·상수 ────────────────────────────────────────────────

export interface SynthesizeOptions {
  provider?: TtsProvider;
  voice?: string;
  rate?: string;
  concurrency?: number;
  force?: boolean;
  log?: (line: string) => void;
  /** 테스트용 주입 — 기본은 provider에 맞는 공급자 생성 */
  synthesizer?: SceneSynthesizer;
  /** 테스트용 주입 — 기본 probeDuration */
  probe?: (file: string) => Promise<number>;
  /** 재시도 대기 (ms) — 테스트에서 0으로 */
  retryDelaysMs?: number[];
  /** 장면당 타임아웃 (ms) */
  sceneTimeoutMs?: number;
}

export const DEFAULT_CONCURRENCY = 2;
export const SCENE_TIMEOUT_MS = 90_000;
export const RETRY_DELAYS_MS = [1000, 2000, 4000];

/** scene-XXX.json에 저장하는 레코드 — SceneAudio + 캐시 판정용 필드 */
export interface SceneAudioRecord extends SceneAudio {
  rate?: string;
  /** 정리된 나레이션 글자 수 (분당 글자 수 실측용) */
  chars?: number;
  /** 정리된 나레이션 (디버깅·재정렬용) */
  text?: string;
  timed?: boolean;
}

// ── 공급자 생성 ──────────────────────────────────────────────

export function createSynthesizer(
  provider: TtsProvider,
  profile: Job["profile"],
  opts: { voice?: string; rate?: string } = {},
): SceneSynthesizer {
  const rate = opts.rate ?? profile.voiceRate ?? "+0%";
  if (provider === "openai") {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new TtsError("OPENAI_API_KEY가 없습니다 (openai TTS)", { retryable: false });
    return createOpenAiSynthesizer({
      apiKey,
      voice: resolveOpenAiVoice(opts.voice ?? process.env.YT_TTS_VOICE),
      rate,
    });
  }
  if (provider === "elevenlabs") {
    const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
    if (!apiKey) throw new TtsError("ELEVENLABS_API_KEY가 없습니다 (elevenlabs TTS)", { retryable: false });
    const voiceId = (opts.voice ?? process.env.ELEVENLABS_VOICE_ID)?.trim();
    if (!voiceId) throw new TtsError("ELEVENLABS_VOICE_ID가 없습니다 (elevenlabs TTS)", { retryable: false });
    return createElevenLabsSynthesizer({
      apiKey,
      voiceId,
      modelId: process.env.ELEVENLABS_MODEL_ID?.trim() || undefined,
      rate,
    });
  }
  return createEdgeSynthesizer({ voice: opts.voice ?? ttsVoice(profile), rate });
}

// ── 재시도·타임아웃·풀 ───────────────────────────────────────

function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const ac = new AbortController();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      ac.abort();
      reject(new TtsError(`${label}: 시간 초과 (${Math.round(ms / 1000)}초)`, { retryable: true }));
    }, ms);
    run(ac.signal).then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/** 재시도 래퍼 — 재시도 가능 오류만 delays 만큼 다시 시도 */
export async function withRetry<T>(
  label: string,
  fn: (attempt: number) => Promise<T>,
  delays: number[] = RETRY_DELAYS_MS,
  log?: (line: string) => void,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt >= delays.length || !isRetryableError(err)) {
        throw err instanceof Error ? err : new Error(`${label}: ${msg}`);
      }
      const wait = delays[attempt];
      log?.(`${label}: 실패 (${msg.split("\n")[0]}) → ${wait}ms 후 재시도 ${attempt + 1}/${delays.length}`);
      await sleep(wait);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** 아주 작은 프로미스 풀 — 첫 실패 후 새 작업은 시작하지 않고, 결과는 입력 순서대로 */
export async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let failure: unknown = undefined;
  let failed = false;
  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (!failed) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = await worker(items[i], i);
      } catch (err) {
        if (!failed) {
          failed = true;
          failure = err;
        }
        return;
      }
    }
  });
  await Promise.all(lanes);
  if (failed) throw failure;
  return results;
}

// ── 장면 캐시 ────────────────────────────────────────────────

interface CacheKey {
  narrationHash: string;
  provider: TtsProvider;
  voice: string;
  rate: string;
}

async function loadCached(mp3: string, metaFile: string, key: CacheKey): Promise<SceneAudioRecord | null> {
  if (!(await fileExists(mp3))) return null;
  const rec = await readJsonFile<SceneAudioRecord>(metaFile);
  if (!rec || typeof rec !== "object") return null;
  if (rec.narrationHash !== key.narrationHash) return null;
  if (rec.provider !== key.provider || rec.voice !== key.voice || rec.rate !== key.rate) return null;
  if (typeof rec.durationMs !== "number" || !Array.isArray(rec.words)) return null;
  return { ...rec, file: mp3 };
}

// ── 메인 ─────────────────────────────────────────────────────

export interface SynthesizeScenesResult {
  audios: SceneAudio[];
  timeline: Timeline;
  srtPath: string;
  measuredCharsPerMinute: number;
}

export async function synthesizeScenes(
  job: Job,
  script: Script,
  opts: SynthesizeOptions = {},
): Promise<SynthesizeScenesResult> {
  const log = opts.log ?? (() => {});
  const provider = opts.provider ?? ttsProvider();
  const synth =
    opts.synthesizer ?? createSynthesizer(provider, job.profile, { voice: opts.voice, rate: opts.rate });
  const probe = opts.probe ?? probeDuration;
  const delays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const timeoutMs = opts.sceneTimeoutMs ?? SCENE_TIMEOUT_MS;
  const concurrency = Math.max(1, Math.floor(opts.concurrency ?? DEFAULT_CONCURRENCY));
  const p = jobPaths(job.id);
  await fs.mkdir(p.audioDir, { recursive: true });

  const scenes = [...script.scenes].sort((a, b) => a.index - b.index);
  log(
    `음성 합성 시작: ${scenes.length}장면, provider=${synth.provider}, voice=${synth.voice}, rate=${synth.rate}, 동시성=${concurrency}`,
  );

  let cachedCount = 0;
  const synthesizeOne = async (scene: Scene): Promise<SceneAudioRecord> => {
    const text = cleanNarration(scene.narration);
    const mp3 = p.sceneAudio(scene.index);
    const metaFile = p.sceneAudioMeta(scene.index);
    const key: CacheKey = {
      narrationHash: hashId(scene.narration),
      provider: synth.provider,
      voice: synth.voice,
      rate: synth.rate,
    };
    if (!opts.force) {
      const cached = await loadCached(mp3, metaFile, key);
      if (cached) {
        cachedCount++;
        log(`[${scene.id}] 캐시 사용 (${cached.durationMs}ms)`);
        return cached;
      }
    }
    if (!text) throw new TtsError(`[${scene.id}] 나레이션이 비어 있습니다`, { retryable: false });

    const workDir = `${p.audioDir}/.tmp-${scene.id}`;
    const result = await withRetry(
      `[${scene.id}] 합성`,
      async () => {
        await fs.rm(workDir, { recursive: true, force: true });
        await fs.mkdir(workDir, { recursive: true });
        try {
          return await withTimeout(
            (signal) => synth.synthesize({ sceneId: scene.id, text, outFile: mp3, workDir, signal }),
            timeoutMs,
            `[${scene.id}] 합성`,
          );
        } finally {
          await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
        }
      },
      delays,
      log,
    );
    if (!(await fileExists(mp3))) {
      throw new TtsError(`[${scene.id}] 오디오 파일이 생성되지 않았습니다: ${mp3}`, { retryable: true });
    }

    const fileDurationMs = await probe(mp3);
    const timed = result.timed && result.words.length > 0;
    const timedWords = timed ? sanitizeWords(restorePunctuation(result.words, text), fileDurationMs) : [];
    const durationMs = trimmedDurationMs(fileDurationMs, timedWords);
    const words = timed ? timedWords : proportionalWords(text, durationMs);
    const rec: SceneAudioRecord = {
      sceneId: scene.id,
      file: mp3,
      durationMs,
      fileDurationMs,
      words,
      narrationHash: key.narrationHash,
      provider: synth.provider,
      voice: synth.voice,
      rate: synth.rate,
      chars: text.length,
      text,
      timed,
    };
    await writeJsonFile(metaFile, rec);
    log(
      `[${scene.id}] 완료 ${text.length}자 → 파일 ${fileDurationMs}ms, 사용 ${durationMs}ms, 단어 ${words.length}개${timed ? "" : " (비례 타이밍)"}`,
    );
    return rec;
  };

  const records = await runPool(scenes, concurrency, synthesizeOne);

  const audios: SceneAudio[] = records.map((r) => ({
    sceneId: r.sceneId,
    file: r.file,
    durationMs: r.durationMs,
    fileDurationMs: r.fileDurationMs,
    words: r.words,
    narrationHash: r.narrationHash,
    provider: r.provider,
    voice: r.voice,
  }));
  const timeline = buildTimeline(audios);
  await writeJsonFile(p.timelineFile, timeline);

  const captions = buildCaptions(audios, timeline);
  await fs.writeFile(p.srtFile, toSrt(captions), "utf-8");
  await writeJsonFile(p.captionsFile, captions);

  const cpm = measuredCharsPerMinute(
    records.map((r, i) => ({
      chars: r.chars ?? cleanNarration(scenes[i].narration).length,
      durationMs: r.durationMs,
    })),
  );
  log(
    `음성 합성 완료: 총 ${Math.round(timeline.totalMs / 1000)}초, 자막 ${captions.length}개, 캐시 ${cachedCount}/${scenes.length}, 실측 ${cpm}자/분`,
  );
  return { audios, timeline, srtPath: p.srtFile, measuredCharsPerMinute: cpm };
}
