import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import type {
  Message,
  MessageStreamParams,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { llmModel, llmProvider } from "../config";
import { sleep } from "../util";
import { ScriptValidationError } from "./schema";

/**
 * Anthropic 클라이언트 래퍼 — 구조화 JSON 출력 한 번 호출을 안전하게 감싼다.
 *
 * - `client.messages.stream(...)` + `finalMessage()` (긴 출력 대비, max_tokens 32000)
 * - 시스템 프롬프트는 cache_control ephemeral 블록 (같은 프로필이면 캐시 재사용)
 * - `output_config.format`은 SDK 헬퍼 `jsonSchemaOutputFormat` → 응답의 `parsed_output`을 우선 사용,
 *   없으면 텍스트 블록에서 코드 펜스 제거 후 가장 바깥 `{...}`를 추출
 * - stop_reason: end_turn/stop_sequence만 파싱, max_tokens/model_context_window_exceeded는
 *   호출자가 준 `onTruncated`로 프롬프트를 줄여 1회 재시도, refusal은 LlmRefusalError
 * - 검증 실패(ScriptValidationError 등)는 사유를 사용자 메시지에 덧붙여 1회 재시도
 * - RateLimitError는 백오프 2회, AuthenticationError는 "ANTHROPIC_API_KEY 확인", 그 외 APIError는 status 포함 재던짐
 * - 단위 테스트를 위해 최소 인터페이스(LlmClient)의 가짜 클라이언트를 주입할 수 있다
 */

export const DEFAULT_MAX_TOKENS = 32_000;

/** 테스트 주입용 최소 클라이언트 인터페이스 (실제 Anthropic 인스턴스도 이 형태를 만족) */
export interface LlmClient {
  messages: {
    stream(params: MessageStreamParams): { finalMessage(): Promise<Message> };
  };
}

export class LlmRefusalError extends Error {
  category?: string;
  explanation?: string;
  constructor(category?: string | null, explanation?: string | null) {
    super(
      `모델이 요청을 거부했습니다${category ? ` (${category})` : ""}${explanation ? `: ${explanation}` : ""}`,
    );
    this.name = "LlmRefusalError";
    this.category = category ?? undefined;
    this.explanation = explanation ?? undefined;
  }
}

/** 출력이 max_tokens/컨텍스트 한도에 걸려 잘렸고 재시도로도 해결되지 않음 */
export class LlmTruncatedError extends Error {
  constructor(public readonly stopReason: string) {
    super(`모델 출력이 잘렸습니다 (stop_reason=${stopReason}) — 목표 분량이나 입력 자료를 줄여 주세요`);
    this.name = "LlmTruncatedError";
  }
}

/** JSON 파싱 실패 (재시도 후에도) */
export class LlmParseError extends Error {
  constructor(message: string, public readonly text: string) {
    super(message);
    this.name = "LlmParseError";
  }
}

export function hasLlm(): boolean {
  return llmProvider() === "anthropic";
}

let cached: Anthropic | null = null;

/** 기본 클라이언트 (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN 환경변수 사용) */
export function anthropicClient(): Anthropic {
  if (!cached) cached = new Anthropic({ maxRetries: 2 });
  return cached;
}

// ── JSON 추출 ────────────────────────────────────────────────

/** 코드 펜스 제거 */
function stripFences(text: string): string {
  const t = text.trim();
  const m = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/.exec(t);
  return m ? m[1].trim() : t;
}

/** 문자열 리터럴을 인식하는 중괄호 균형 스캐너 — start 위치의 '{'와 짝이 맞는 '}' 인덱스 */
function matchBrace(text: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * 모델 텍스트에서 JSON 객체를 최대한 관대하게 추출한다.
 * 1) 전체가 JSON → 그대로  2) 펜스 제거  3) 첫 '{'부터 마지막 '}'  4) 균형 스캐너로 첫 완전한 객체
 */
export function extractJson(text: string): unknown {
  const candidates: string[] = [];
  const stripped = stripFences(text);
  candidates.push(stripped);
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  if (first >= 0 && last > first) candidates.push(stripped.slice(first, last + 1));
  if (first >= 0) {
    const end = matchBrace(stripped, first);
    if (end > first) candidates.push(stripped.slice(first, end + 1));
  }
  let lastErr: unknown;
  for (const c of candidates) {
    try {
      const v = JSON.parse(c) as unknown;
      if (v && typeof v === "object") return v;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new LlmParseError(
    `응답에서 JSON 객체를 찾지 못했습니다: ${lastErr instanceof Error ? lastErr.message : "형식 오류"}`,
    text.slice(0, 400),
  );
}

function textOf(message: Message): string {
  return message.content
    .filter((b): b is Extract<Message["content"][number], { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

function parsedOutputOf(message: Message): unknown {
  const p = (message as { parsed_output?: unknown }).parsed_output;
  return p && typeof p === "object" ? p : undefined;
}

function usageOf(message: Message): { input: number; output: number } | undefined {
  const u = message.usage;
  if (!u) return undefined;
  return {
    input: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
    output: u.output_tokens ?? 0,
  };
}

// ── 본체 ─────────────────────────────────────────────────────

export interface CompleteJsonOptions<T> {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  validate: (raw: unknown) => T;
  maxTokens?: number;
  model?: string;
  log?: (line: string) => void;
  /** 테스트/커스텀 클라이언트 주입 */
  client?: LlmClient;
  /** 출력이 잘렸을 때 더 짧은 사용자 프롬프트를 돌려주면 1회 재시도, null/undefined면 LlmTruncatedError */
  onTruncated?: (info: { stopReason: string; user: string }) => string | null | undefined;
  /** 레이트리밋 백오프 기준(ms) — 기본 2000 (테스트에서 줄임) */
  backoffMs?: number;
}

export interface CompleteJsonResult<T> {
  value: T;
  model: string;
  usage?: { input: number; output: number };
  /** 검증 전 원본 JSON (확장 패스 등에서 재사용) */
  raw: unknown;
}

const RATE_LIMIT_RETRIES = 2;

function buildParams(
  model: string,
  system: string,
  user: string,
  schema: Record<string, unknown>,
  maxTokens: number,
): MessageStreamParams {
  // SDK 헬퍼: 스키마를 구조화 출력 규격으로 정규화(깊은 복사) + parsed_output 파싱기 부착
  const format = jsonSchemaOutputFormat(schema as unknown as { type: "object" });
  return {
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort: "high", format },
  };
}

/** 레이트리밋 백오프를 포함한 단일 API 호출 */
async function callOnce(
  client: LlmClient,
  params: MessageStreamParams,
  backoffMs: number,
  log: (line: string) => void,
): Promise<Message> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.messages.stream(params).finalMessage();
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) {
        throw new Error("Anthropic 인증 실패 — ANTHROPIC_API_KEY 확인", { cause: err });
      }
      if (err instanceof Anthropic.RateLimitError && attempt < RATE_LIMIT_RETRIES) {
        const wait = backoffMs * 2 ** attempt;
        log(`레이트리밋(429) — ${wait}ms 후 재시도 (${attempt + 1}/${RATE_LIMIT_RETRIES})`);
        await sleep(wait);
        continue;
      }
      if (err instanceof Anthropic.APIError) {
        throw new Error(`Anthropic API 오류${err.status ? ` (${err.status})` : ""}: ${err.message}`, { cause: err });
      }
      throw err;
    }
  }
}

function reasonsOf(err: unknown): string[] {
  if (err instanceof ScriptValidationError) return err.reasons;
  if (err instanceof Error) return [err.message];
  return [String(err)];
}

/**
 * 구조화 JSON 한 번 완성 — 스키마·검증·재시도 포함.
 * 검증 함수는 원본 JSON을 받아 T를 반환하거나 예외(ScriptValidationError 권장)를 던진다.
 */
export async function completeJson<T>(opts: CompleteJsonOptions<T>): Promise<CompleteJsonResult<T>> {
  const log = opts.log ?? (() => {});
  const client = opts.client ?? anthropicClient();
  const model = opts.model ?? llmModel();
  const maxTokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const backoffMs = opts.backoffMs ?? 2000;

  let user = opts.user;
  let truncatedRetried = false;
  let validationRetried = false;

  for (;;) {
    const message = await callOnce(client, buildParams(model, opts.system, user, opts.schema, maxTokens), backoffMs, log);
    const usage = usageOf(message);
    if (usage) log(`LLM 응답 — model=${message.model || model}, 입력 ${usage.input} / 출력 ${usage.output} 토큰, stop=${message.stop_reason}`);

    const stop = message.stop_reason;
    if (stop === "refusal") {
      const details = message.stop_details;
      throw new LlmRefusalError(details?.category ?? undefined, details?.explanation ?? undefined);
    }
    if (stop === "max_tokens" || stop === "model_context_window_exceeded") {
      const shorter = !truncatedRetried && opts.onTruncated ? opts.onTruncated({ stopReason: stop, user }) : null;
      if (shorter) {
        truncatedRetried = true;
        log(`출력 잘림(${stop}) — 분량을 줄여 1회 재시도`);
        user = shorter;
        continue;
      }
      throw new LlmTruncatedError(stop);
    }
    if (stop !== null && stop !== "end_turn" && stop !== "stop_sequence") {
      throw new Error(`예상하지 못한 stop_reason: ${stop}`);
    }

    let raw: unknown;
    let value: T;
    try {
      raw = parsedOutputOf(message) ?? extractJson(textOf(message));
      value = opts.validate(raw);
    } catch (err) {
      if (validationRetried) throw err;
      validationRetried = true;
      const reasons = reasonsOf(err);
      log(`검증 실패 — 사유를 덧붙여 1회 재시도: ${reasons.slice(0, 5).join("; ")}`);
      user =
        `${user}\n\n[재시도 안내] 직전 응답이 다음 이유로 거부되었습니다. 같은 스키마로 전체 JSON을 다시 작성하되 아래 문제를 반드시 고치세요:\n` +
        reasons.map((r) => `- ${r}`).join("\n");
      continue;
    }
    return { value, model: message.model || model, usage, raw };
  }
}
