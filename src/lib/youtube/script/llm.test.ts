import test from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import type { Message, MessageStreamParams } from "@anthropic-ai/sdk/resources/messages/messages";
import {
  LlmParseError,
  LlmRefusalError,
  LlmTruncatedError,
  completeJson,
  extractJson,
  type LlmClient,
} from "./llm";
import { ScriptValidationError } from "./schema";

// ── 가짜 클라이언트 ─────────────────────────────────────────

type Reply = Partial<Message> | Error | { parsed_output: unknown; text?: string };

function fakeMessage(patch: Partial<Message> & { parsed_output?: unknown }): Message {
  const base: Message = {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 20,
      cache_read_input_tokens: 30,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
      iterations: null,
    },
  } as unknown as Message;
  return { ...base, ...patch };
}

function textReply(text: string, stop: Message["stop_reason"] = "end_turn"): Message {
  return fakeMessage({
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
  });
}

/** 순서대로 응답(또는 예외)을 돌려주는 가짜 클라이언트 — 받은 params를 기록 */
function fakeClient(replies: Reply[]): LlmClient & { calls: MessageStreamParams[] } {
  const calls: MessageStreamParams[] = [];
  return {
    calls,
    messages: {
      stream(params: MessageStreamParams) {
        calls.push(params);
        const next = replies.shift();
        return {
          async finalMessage(): Promise<Message> {
            if (next === undefined) throw new Error("가짜 응답 소진");
            if (next instanceof Error) throw next;
            if ("parsed_output" in next && !("id" in next)) {
              return fakeMessage({
                content: [{ type: "text", text: next.text ?? "", citations: null }],
                parsed_output: next.parsed_output,
              });
            }
            return fakeMessage(next as Partial<Message>);
          },
        };
      },
    },
  };
}

const schema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: { title: { type: "string" }, n: { type: "number" } },
  required: ["title", "n"],
};

interface Out {
  title: string;
  n: number;
}

function validate(raw: unknown): Out {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const reasons: string[] = [];
  if (typeof r.title !== "string" || !r.title) reasons.push("title 누락");
  if (typeof r.n !== "number") reasons.push("n은 숫자여야 함");
  if (reasons.length) throw new ScriptValidationError(reasons);
  return { title: r.title as string, n: r.n as number };
}

function userOf(params: MessageStreamParams): string {
  const m = params.messages[0];
  return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
}

// ── extractJson ─────────────────────────────────────────────

test("extractJson — 순수 JSON, 코드 펜스, 앞뒤 설명문, 문자열 안의 중괄호", () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('여기 결과입니다:\n```\n{"a":{"b":[1,2]}}\n```\n끝'), { a: { b: [1, 2] } });
  assert.deepEqual(extractJson('설명 {"s":"중괄호 } 포함"} 뒤 텍스트'), { s: "중괄호 } 포함" });
  assert.throws(() => extractJson("JSON 없음"), (e: unknown) => e instanceof LlmParseError);
});

// ── completeJson ────────────────────────────────────────────

test("completeJson — 유효 JSON 텍스트를 파싱하고 요청 형태(캐시 시스템 블록·구조화 출력)가 올바르다", async () => {
  const client = fakeClient([textReply('{"title":"제목","n":3}')]);
  const res = await completeJson<Out>({ system: "SYS", user: "USER", schema, validate, client, model: "m-test" });
  assert.deepEqual(res.value, { title: "제목", n: 3 });
  assert.equal(res.model, "claude-test");
  assert.deepEqual(res.usage, { input: 150, output: 50 });
  assert.equal(client.calls.length, 1);
  const p = client.calls[0];
  assert.equal(p.model, "m-test");
  assert.equal(p.max_tokens, 32_000);
  assert.deepEqual(p.system, [{ type: "text", text: "SYS", cache_control: { type: "ephemeral" } }]);
  assert.equal(userOf(p), "USER");
  assert.equal(p.output_config?.effort, "high");
  assert.equal(p.output_config?.format?.type, "json_schema");
  const sent = p.output_config?.format?.schema as Record<string, unknown>;
  assert.equal(sent.additionalProperties, false);
  assert.deepEqual(sent.required, ["title", "n"]);
  assert.equal(typeof (p.output_config?.format as { parse?: unknown }).parse, "function", "SDK 헬퍼 parse 부착");
});

test("completeJson — 코드 펜스로 감싼 JSON도 파싱", async () => {
  const client = fakeClient([textReply('```json\n{"title":"펜스","n":1}\n```')]);
  const res = await completeJson<Out>({ system: "S", user: "U", schema, validate, client });
  assert.equal(res.value.title, "펜스");
});

test("completeJson — parsed_output이 있으면 텍스트보다 우선", async () => {
  const client = fakeClient([{ parsed_output: { title: "파싱됨", n: 9 }, text: "not json" }]);
  const res = await completeJson<Out>({ system: "S", user: "U", schema, validate, client });
  assert.deepEqual(res.value, { title: "파싱됨", n: 9 });
});

test("completeJson — 잘못된 JSON 후 재시도에서 성공 (사유가 사용자 메시지에 덧붙음)", async () => {
  const client = fakeClient([textReply("이건 JSON이 아닙니다"), textReply('{"title":"복구","n":2}')]);
  const logs: string[] = [];
  const res = await completeJson<Out>({ system: "S", user: "U", schema, validate, client, log: (l) => logs.push(l) });
  assert.equal(res.value.title, "복구");
  assert.equal(client.calls.length, 2);
  assert.match(userOf(client.calls[1]), /^U\n\n\[재시도 안내\]/);
  assert.match(userOf(client.calls[1]), /JSON 객체를 찾지 못했습니다/);
  assert.ok(logs.some((l) => l.includes("검증 실패")));
});

test("completeJson — ScriptValidationError 사유를 덧붙여 1회 재시도, 두 번째도 실패면 예외", async () => {
  const client = fakeClient([textReply('{"title":"","n":"x"}'), textReply('{"title":"ok","n":1}')]);
  const res = await completeJson<Out>({ system: "S", user: "U", schema, validate, client });
  assert.equal(res.value.n, 1);
  assert.match(userOf(client.calls[1]), /- title 누락\n- n은 숫자여야 함/);

  const failing = fakeClient([textReply('{"title":"","n":1}'), textReply('{"title":"","n":1}')]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client: failing }),
    (e: unknown) => e instanceof ScriptValidationError,
  );
  assert.equal(failing.calls.length, 2);
});

test("completeJson — refusal → LlmRefusalError(category, explanation)", async () => {
  const client = fakeClient([
    fakeMessage({
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: "정책 위반" },
    }),
  ]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client }),
    (e: unknown) => e instanceof LlmRefusalError && e.category === "cyber" && e.explanation === "정책 위반",
  );
});

test("completeJson — max_tokens: onTruncated가 준 짧은 프롬프트로 1회 재시도, 없으면 LlmTruncatedError", async () => {
  const client = fakeClient([textReply('{"title":"잘림', "max_tokens"), textReply('{"title":"짧게","n":5}')]);
  const res = await completeJson<Out>({
    system: "S",
    user: "LONG",
    schema,
    validate,
    client,
    onTruncated: ({ stopReason, user }) => `${user}-SHORT(${stopReason})`,
  });
  assert.equal(res.value.title, "짧게");
  assert.equal(userOf(client.calls[1]), "LONG-SHORT(max_tokens)");

  const noHandler = fakeClient([textReply("{", "model_context_window_exceeded")]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client: noHandler }),
    (e: unknown) => e instanceof LlmTruncatedError && e.stopReason === "model_context_window_exceeded",
  );

  // 두 번 연속 잘리면 더 재시도하지 않는다
  const twice = fakeClient([textReply("{", "max_tokens"), textReply("{", "max_tokens")]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client: twice, onTruncated: () => "again" }),
    (e: unknown) => e instanceof LlmTruncatedError,
  );
  assert.equal(twice.calls.length, 2);
});

test("completeJson — RateLimitError는 백오프 후 2회 재시도, 3번째 실패는 status 포함 예외", async () => {
  const rl = () => new Anthropic.RateLimitError(429, { type: "rate_limit_error" }, "rate limited", new Headers());
  const client = fakeClient([rl(), rl(), textReply('{"title":"통과","n":1}')]);
  const logs: string[] = [];
  const res = await completeJson<Out>({ system: "S", user: "U", schema, validate, client, backoffMs: 1, log: (l) => logs.push(l) });
  assert.equal(res.value.title, "통과");
  assert.equal(client.calls.length, 3);
  assert.equal(logs.filter((l) => l.includes("레이트리밋")).length, 2);

  const exhausted = fakeClient([rl(), rl(), rl()]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client: exhausted, backoffMs: 1 }),
    (e: unknown) => e instanceof Error && /429/.test(e.message) && e.cause instanceof Anthropic.RateLimitError,
  );
  assert.equal(exhausted.calls.length, 3);
});

test("completeJson — AuthenticationError는 키 안내 메시지, 그 외 APIError는 status 포함", async () => {
  const auth = fakeClient([new Anthropic.AuthenticationError(401, { type: "authentication_error" }, "bad key", new Headers())]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client: auth }),
    (e: unknown) => e instanceof Error && /ANTHROPIC_API_KEY/.test(e.message),
  );
  const server = fakeClient([new Anthropic.InternalServerError(500, { type: "api_error" }, "boom", new Headers())]);
  await assert.rejects(
    completeJson<Out>({ system: "S", user: "U", schema, validate, client: server }),
    (e: unknown) => e instanceof Error && /\(500\)/.test(e.message),
  );
});
