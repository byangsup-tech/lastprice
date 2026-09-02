import { promises as fs } from "fs";
import path from "path";
import { TtsError, type SceneSynthesizer, type SynthesisRequest, type SynthesisResult } from "./tts";

/**
 * OpenAI TTS 공급자 (fetch, SDK 없음)
 * POST https://api.openai.com/v1/audio/speech
 * { model: "gpt-4o-mini-tts", voice, input, response_format: "mp3" } → mp3 바이너리
 * 단어 타이밍을 주지 않으므로 words: [] → tts.ts가 비례 타이밍으로 채운다.
 */

export const OPENAI_TTS_URL = "https://api.openai.com/v1/audio/speech";
export const OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
export const OPENAI_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
] as const;
export type OpenAiVoice = (typeof OPENAI_VOICES)[number];

function isOpenAiVoice(v: string): v is OpenAiVoice {
  return (OPENAI_VOICES as readonly string[]).includes(v);
}

/** YT_TTS_VOICE가 allowlist에 있을 때만 사용, 아니면 "alloy" (Edge 보이스 이름 등은 무시) */
export function resolveOpenAiVoice(requested?: string): OpenAiVoice {
  const v = requested?.trim().toLowerCase();
  return v && isOpenAiVoice(v) ? v : "alloy";
}

export interface OpenAiRequestInput {
  apiKey: string;
  voice: string;
  text: string;
}

export function buildOpenAiRequest(input: OpenAiRequestInput): { url: string; init: RequestInit } {
  return {
    url: OPENAI_TTS_URL,
    init: {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_TTS_MODEL,
        voice: input.voice,
        input: input.text,
        response_format: "mp3",
      }),
    },
  };
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface OpenAiOptions {
  apiKey: string;
  voice: string;
  /** 캐시 키 일치용 — OpenAI 요청 본문에는 쓰지 않음 */
  rate: string;
  fetchImpl?: FetchLike;
}

/** HTTP 응답 오류 → TtsError (429/5xx는 재시도, 그 외는 즉시 실패) */
export async function httpError(label: string, res: Response): Promise<TtsError> {
  const body = await res.text().catch(() => "");
  const snippet = body.replace(/\s+/g, " ").slice(0, 200);
  const retryable = res.status === 429 || res.status >= 500;
  const hint = res.status === 401 ? " — API 키를 확인하세요" : "";
  return new TtsError(`${label} HTTP ${res.status}${hint}${snippet ? `: ${snippet}` : ""}`, {
    retryable,
    status: res.status,
  });
}

export function createOpenAiSynthesizer(opts: OpenAiOptions): SceneSynthesizer {
  const doFetch: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  return {
    provider: "openai",
    voice: opts.voice,
    rate: opts.rate,
    async synthesize(req: SynthesisRequest): Promise<SynthesisResult> {
      const { url, init } = buildOpenAiRequest({ apiKey: opts.apiKey, voice: opts.voice, text: req.text });
      let res: Response;
      try {
        res = await doFetch(url, { ...init, signal: req.signal });
      } catch (err) {
        throw new TtsError(`OpenAI TTS 네트워크 오류: ${err instanceof Error ? err.message : String(err)}`, {
          retryable: true,
          cause: err,
        });
      }
      if (!res.ok) throw await httpError("OpenAI TTS", res);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new TtsError("OpenAI TTS: 빈 응답", { retryable: true });
      await fs.mkdir(path.dirname(req.outFile), { recursive: true });
      await fs.writeFile(req.outFile, buf);
      return { words: [], timed: false };
    },
  };
}
