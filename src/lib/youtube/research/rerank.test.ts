import test from "node:test";
import assert from "node:assert/strict";
import type { Message, MessageStreamParams } from "@anthropic-ai/sdk/resources/messages/messages";
import { DEFAULT_PROFILE } from "../config";
import type { LlmClient } from "../script/llm";
import type { TopicCandidate } from "../types";
import { hashId, normalizeKey } from "../util";
import { GATE_REASON, mergeRerank, pickRerankInput, rerankCandidates, rerankStatusWithoutLlm } from "./rerank";
import { llmFitOf, scoreAll } from "./score";

const profile = DEFAULT_PROFILE;

function cand(title: string, patch: Partial<TopicCandidate> = {}): TopicCandidate {
  return {
    id: hashId(normalizeKey(title)),
    title,
    keywords: [],
    sources: [{ source: "google-news", label: "테스트" }],
    news: [],
    signals: { demand: 0.6, competition: 0.5, fit: 0, freshness: 1 },
    score: 0,
    reasons: [],
    ...patch,
  };
}

function fakeMessage(parsed: unknown): Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-test",
    content: [{ type: "text", text: JSON.stringify(parsed), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: { input_tokens: 10, output_tokens: 5 },
    parsed_output: parsed,
  } as unknown as Message;
}

function fakeClient(reply: unknown | Error): LlmClient & { calls: MessageStreamParams[] } {
  const calls: MessageStreamParams[] = [];
  return {
    calls,
    messages: {
      stream(params: MessageStreamParams) {
        calls.push(params);
        return {
          async finalMessage(): Promise<Message> {
            if (reply instanceof Error) throw reply;
            return fakeMessage(reply);
          },
        };
      },
    },
  };
}

function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T): T {
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("pickRerankInput: 점수 > 0 우선, 키워드 게이트 후보로 채움, 제외 키워드 후보는 제외", () => {
  const scored = scoreAll(
    [cand("실손보험 개편"), cand("서희제"), cand("보험 정치 논란"), cand("금리 인하", { signals: { demand: 0.9, competition: 0.5, fit: 0, freshness: 1 } })],
    profile,
  );
  const input = pickRerankInput(scored, 3);
  assert.deepEqual(
    input.map((c) => c.title),
    ["금리 인하", "실손보험 개편", "서희제"],
  );
  assert.equal(scored.find((c) => c.title === "서희제")?.reasons[0], GATE_REASON);
  assert.equal(pickRerankInput(scored).some((c) => c.title === "보험 정치 논란"), false);
});

test("mergeRerank: fit/angle/suggestedTitle 병합 + 재채점 + 정렬", () => {
  const scored = scoreAll([cand("실손보험 개편"), cand("퇴직 후 생활비")], profile);
  const gated = scored.find((c) => c.title === "퇴직 후 생활비")!;
  assert.equal(gated.score, 0);
  const { candidates, merged } = mergeRerank(
    scored,
    [
      { id: gated.id, fit: 1, angle: "퇴직 후 월 생활비 계산법", suggestedTitle: "퇴직 후 생활비, 월 300만원의 진실", reason: "재테크 직결" },
      { id: "unknown", fit: 0.9, angle: "", suggestedTitle: "", reason: "" },
    ],
    profile,
  );
  assert.equal(merged, 1);
  const rescued = candidates.find((c) => c.title === "퇴직 후 생활비")!;
  assert.equal(rescued.angle, "퇴직 후 월 생활비 계산법");
  assert.equal(rescued.suggestedTitle, "퇴직 후 생활비, 월 300만원의 진실");
  assert.equal(llmFitOf(rescued), 1);
  assert.equal(rescued.signals.fit, 0.5); // 키워드 0 × 0.5 + LLM 1 × 0.5
  assert.ok(rescued.score > 0);
  assert.ok(rescued.reasons.some((r) => r.includes("LLM 적합도 1.00")));
  // 두 번 병합해도 llm-rerank evidence는 하나
  const again = mergeRerank(candidates, [{ id: gated.id, fit: 0.6, angle: "a", suggestedTitle: "b", reason: "c" }], profile);
  assert.equal(again.candidates.find((c) => c.title === "퇴직 후 생활비")!.sources.filter((s) => s.source === "llm-rerank").length, 1);
  assert.ok(candidates[0].score >= candidates[1].score);
});

test("rerankCandidates: 가짜 클라이언트로 on 상태 + 병합", async () => {
  const scored = scoreAll([cand("실손보험 개편"), cand("연금 개혁")], profile);
  const client = fakeClient({
    results: scored.map((c) => ({ id: c.id, fit: 0.8, angle: `${c.title} 앵글`, suggestedTitle: `${c.title} 제목`, reason: "ok" })),
  });
  const logs: string[] = [];
  const res = await rerankCandidates(scored, profile, { client, log: (l) => logs.push(l) });
  assert.equal(res.status, "on");
  assert.equal(res.merged, 2);
  assert.equal(res.model, "claude-test");
  assert.equal(client.calls.length, 1);
  assert.ok(client.calls[0].messages[0].content.toString().includes("실손보험 개편"));
  assert.ok(res.candidates.every((c) => c.suggestedTitle?.endsWith("제목")));
  assert.ok(logs.some((l) => l.includes("LLM 재정렬 완료")));
});

test("rerankCandidates: 호출 실패는 error 상태, 후보는 그대로", async () => {
  const scored = scoreAll([cand("실손보험 개편")], profile);
  const res = await rerankCandidates(scored, profile, { client: fakeClient(new Error("boom")) });
  assert.equal(res.status, "error");
  assert.equal(res.error, "boom");
  assert.deepEqual(res.candidates, scored);
});

test("rerankCandidates: LLM 없으면 no-key, 템플릿 강제면 off", async () => {
  const scored = scoreAll([cand("실손보험 개편")], profile);
  await withEnv({ ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, YT_LLM_PROVIDER: undefined }, async () => {
    assert.equal(rerankStatusWithoutLlm(), "no-key");
    const res = await rerankCandidates(scored, profile);
    assert.equal(res.status, "no-key");
    assert.equal(res.candidates, scored);
  });
  await withEnv({ ANTHROPIC_API_KEY: undefined, ANTHROPIC_AUTH_TOKEN: undefined, YT_LLM_PROVIDER: "template" }, async () => {
    assert.equal((await rerankCandidates(scored, profile)).status, "off");
  });
  await withEnv({ ANTHROPIC_API_KEY: "sk-test", YT_LLM_PROVIDER: "template" }, async () => {
    assert.equal((await rerankCandidates(scored, profile)).status, "off");
  });
});
