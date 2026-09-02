import { promises as fs } from "fs";
import path from "path";
import type { WordTiming } from "../types";
import { httpError, type FetchLike } from "./openai";
import { TtsError, type SceneSynthesizer, type SynthesisRequest, type SynthesisResult } from "./tts";

/**
 * ElevenLabs 공급자 (fetch, SDK 없음)
 * POST https://api.elevenlabs.io/v1/text-to-speech/{voiceId}/with-timestamps?output_format=mp3_44100_128
 * 헤더 xi-api-key, body { text, model_id } →
 * { audio_base64, alignment: { characters[], character_start_times_seconds[], character_end_times_seconds[] } }
 * 문자 타이밍을 공백 기준으로 묶어 단어 타이밍을 만든다.
 */

export const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
export const ELEVENLABS_DEFAULT_MODEL = "eleven_multilingual_v2";
export const ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128";

export interface ElevenLabsAlignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

export interface ElevenLabsResponse {
  audio_base64: string;
  alignment?: ElevenLabsAlignment | null;
  normalized_alignment?: ElevenLabsAlignment | null;
}

/** 문자 단위 타이밍 → 공백 기준 단어 타이밍 (ms) */
export function wordsFromAlignment(a: ElevenLabsAlignment | null | undefined): WordTiming[] {
  if (!a || !Array.isArray(a.characters)) return [];
  const out: WordTiming[] = [];
  let buf = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    if (buf) out.push({ text: buf, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000) });
    buf = "";
  };
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    const s = a.character_start_times_seconds[i];
    const e = a.character_end_times_seconds[i];
    if (typeof ch !== "string" || /\s/.test(ch)) {
      flush();
      continue;
    }
    if (!buf) start = typeof s === "number" ? s : end;
    buf += ch;
    if (typeof e === "number") end = e;
  }
  flush();
  return out;
}

export interface ElevenLabsRequestInput {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  text: string;
}

export function buildElevenLabsRequest(input: ElevenLabsRequestInput): { url: string; init: RequestInit } {
  const url = `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${encodeURIComponent(input.voiceId)}/with-timestamps?output_format=${ELEVENLABS_OUTPUT_FORMAT}`;
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "xi-api-key": input.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        text: input.text,
        model_id: input.modelId || ELEVENLABS_DEFAULT_MODEL,
      }),
    },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** 응답 JSON → mp3 버퍼 + 단어 타이밍 (alignment 우선, 없으면 normalized_alignment) */
export function parseElevenLabsResponse(json: unknown): { audio: Buffer; words: WordTiming[] } {
  if (!isRecord(json) || typeof json.audio_base64 !== "string" || !json.audio_base64) {
    throw new TtsError("ElevenLabs: audio_base64가 없는 응답", { retryable: false });
  }
  const r = json as unknown as ElevenLabsResponse;
  const audio = Buffer.from(r.audio_base64, "base64");
  if (audio.length === 0) throw new TtsError("ElevenLabs: 빈 오디오", { retryable: true });
  const words = wordsFromAlignment(r.alignment ?? r.normalized_alignment ?? null);
  return { audio, words };
}

export interface ElevenLabsOptions {
  apiKey: string;
  voiceId: string;
  modelId?: string;
  /** 캐시 키 일치용 — 요청 본문에는 쓰지 않음 */
  rate: string;
  fetchImpl?: FetchLike;
}

export function createElevenLabsSynthesizer(opts: ElevenLabsOptions): SceneSynthesizer {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    provider: "elevenlabs",
    voice: opts.voiceId,
    rate: opts.rate,
    async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
      const { url, init } = buildElevenLabsRequest({
        apiKey: opts.apiKey,
        voiceId: opts.voiceId,
        modelId: opts.modelId,
        text: req.text,
      });
      let res: Response;
      try {
        res = await doFetch(url, { ...init, signal: req.signal });
      } catch (err) {
        throw new TtsError(`ElevenLabs 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`, {
          retryable: true,
          cause: err,
        });
      }
      if (!res.ok) throw await httpError("ElevenLabs", res);
      let json: unknown;
      try {
        json = await res.json();
      } catch (err) {
        throw new TtsError("ElevenLabs: JSON 응답 파싱 실패", { retryable: true, cause: err });
      }
      const { audio, words } = parseElevenLabsResponse(json);
      await fs.mkdir(path.dirname(req.outFile), { recursive: true });
      await fs.writeFile(req.outFile, audio);
      return { words, timed: words.length > 0 };
    },
  };
}
