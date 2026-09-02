import test from "node:test";
import assert from "node:assert/strict";
import type { Message, MessageStreamParams } from "@anthropic-ai/sdk/resources/messages/messages";
import { DEFAULT_PROFILE } from "../config";
import { createJob, deleteJob, readJsonFile } from "../jobs";
import { jobPaths } from "../paths";
import type { Job, Script, Topic, VideoMetadata } from "../types";
import { buildInitialMetadata, generateScript } from "./generate";
import type { LlmClient } from "./llm";
import { scriptBudget } from "./prompts";
import { charsPerMinute, scriptChars, type LlmScene, type LlmScriptOutput } from "./schema";
import { buildTemplateOutput } from "./template";

const topic: Topic = {
  title: "실손보험 개편",
  keywords: ["insurance"],
  sourceUrls: ["https://example.com/src"],
  news: [{ title: "실손보험 5세대 출시 임박 - 한국경제", url: "https://example.com/n1" }],
};

async function withJob(fn: (job: Job) => Promise<void>, demo = false, profile = DEFAULT_PROFILE): Promise<void> {
  const job = await createJob({ topic, profile, demo });
  try {
    await fn(job);
  } finally {
    await deleteJob(job.id);
  }
}

function jsonReply(value: unknown): Message {
  return {
    id: "msg",
    type: "message",
    role: "assistant",
    model: "claude-fake",
    content: [{ type: "text", text: JSON.stringify(value), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    container: null,
    context_management: null,
    usage: {
      input_tokens: 10,
      output_tokens: 5,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation: null,
      inference_geo: null,
      output_tokens_details: null,
      server_tool_use: null,
      service_tier: null,
      speed: null,
      iterations: null,
    },
  } as unknown as Message;
}

function fakeClient(replies: Array<unknown | Error>): LlmClient & { calls: MessageStreamParams[] } {
  const calls: MessageStreamParams[] = [];
  return {
    calls,
    messages: {
      stream(params) {
        calls.push(params);
        const next = replies.shift();
        return {
          async finalMessage() {
            if (next instanceof Error) throw next;
            return jsonReply(next);
          },
        };
      },
    },
  };
}

function userOf(p: MessageStreamParams): string {
  const c = p.messages[0].content;
  return typeof c === "string" ? c : JSON.stringify(c);
}

/** 템플릿 출력에 본문 장면을 n개씩 더해 글자 수를 늘린 LLM 출력 */
function expandedOutput(base: LlmScriptOutput, perChapter: number): LlmScriptOutput {
  const extra = (i: number): LlmScene => ({
    layout: "plain",
    narration: `추가 장면 ${i}입니다. 실손보험 개편에서 놓치기 쉬운 세부 조건을 하나 더 짚어 보겠습니다. 갱신 주기와 자기부담률이 어떻게 달라지는지 숫자로 확인해 두시면 좋습니다.`,
    heading: `추가 포인트 ${i}`,
    bullets: null,
    stat: null,
    quote: null,
    visualKeywords: ["document", "chart"],
  });
  return {
    ...base,
    chapters: base.chapters.map((c) => ({
      ...c,
      scenes: [...c.scenes, ...Array.from({ length: perChapter }, (_, i) => extra(i + 1))],
    })),
  };
}

test("generateScript — 템플릿 모드: script.json + metadata.json 저장, 메타데이터 초기값", async () => {
  await withJob(async (job) => {
    const logs: string[] = [];
    const script = await generateScript(job, { provider: "template", log: (l) => logs.push(l) });
    const p = jobPaths(job.id);
    assert.equal(script.generator, "template");
    assert.equal(script.topic.title, topic.title);
    assert.ok(script.scenes.length >= 8);
    const saved = await readJsonFile<Script>(p.scriptFile);
    assert.deepEqual(saved, JSON.parse(JSON.stringify(script)));
    const meta = await readJsonFile<VideoMetadata>(p.metadataFile);
    assert.ok(meta);
    assert.equal(meta.title, script.title);
    assert.equal(meta.categoryId, "27");
    assert.equal(meta.language, "ko");
    assert.deepEqual(meta.chapters, []);
    assert.deepEqual(meta.tags, script.tags);
    assert.deepEqual(buildInitialMetadata(script), meta);
    assert.ok(logs.some((l) => l.includes("템플릿 모드")));
    assert.ok(logs.some((l) => l.includes("대본 저장")));
  });
});

test("generateScript — 데모 작업은 provider와 무관하게 데모 대본", async () => {
  await withJob(async (job) => {
    const script = await generateScript(job, { provider: "anthropic" });
    assert.equal(script.generator, "template");
    assert.equal(script.topic.title, "유튜브 롱폼 자동화 파이프라인");
    assert.ok(script.scenes.length >= 6);
    assert.ok(script.estimatedMinutes < 2.5);
  }, true);
});

test("generateScript — 템플릿 모드는 프로필이 엉성해도(짧은 CTA) 던지지 않는다", async () => {
  const broken = { ...DEFAULT_PROFILE, cta: "끝.", keywords: [] as string[] };
  await withJob(
    async (job) => {
      const logs: string[] = [];
      const script = await generateScript(job, { provider: "template", log: (l) => logs.push(l) });
      assert.equal(script.scenes[script.scenes.length - 1].layout, "outro");
      assert.ok(logs.some((l) => l.includes("보정")));
    },
    false,
    broken,
  );
});

test("generateScript — anthropic: 분량 부족이면 확장 패스 1회, 더 긴 결과를 채택", async () => {
  await withJob(async (job) => {
    const base = buildTemplateOutput({ topic, profile: job.profile });
    const client = fakeClient([base, expandedOutput(base, 4)]);
    const logs: string[] = [];
    const script = await generateScript(job, { provider: "anthropic", model: "m-fake", client, log: (l) => logs.push(l) });
    assert.equal(client.calls.length, 2);
    assert.equal(script.generator, "anthropic");
    assert.equal(script.model, "m-fake");
    assert.equal(client.calls[0].model, "m-fake");
    const budget = scriptBudget(job.profile.targetMinutes, charsPerMinute(job.profile.voiceRate));
    assert.ok(userOf(client.calls[0]).includes(`${budget.targetChars}자`), "1차 프롬프트에 목표 글자 수");
    assert.ok(userOf(client.calls[1]).includes("확장 지시"), "2차는 확장 프롬프트");
    assert.ok(userOf(client.calls[1]).includes(JSON.stringify(base)), "확장 프롬프트에 직전 JSON");
    const chapters = base.chapters.length;
    assert.equal(script.scenes.filter((s) => s.heading?.startsWith("추가 포인트")).length, chapters * 4);
    assert.ok(logs.some((l) => l.includes("확장 패스")));
    const saved = await readJsonFile<Script>(jobPaths(job.id).scriptFile);
    assert.equal(saved?.scenes.length, script.scenes.length);
  });
});

test("generateScript — anthropic: 확장이 실패하거나 더 짧으면 1차 대본 유지", async () => {
  await withJob(async (job) => {
    const base = buildTemplateOutput({ topic, profile: job.profile });
    const failing = fakeClient([base, new Error("network down")]);
    const logs: string[] = [];
    const script = await generateScript(job, { provider: "anthropic", client: failing, log: (l) => logs.push(l) });
    assert.equal(failing.calls.length, 2);
    assert.equal(scriptChars(script), scriptChars(await generateScript(job, { provider: "anthropic", client: fakeClient([base, base]) })));
    assert.ok(logs.some((l) => l.includes("확장 패스 실패")));
  });
});

test("generateScript — anthropic: 분량이 충분하면 호출 1회 (targetMinutes 2)", async () => {
  await withJob(async (job) => {
    const base = buildTemplateOutput({ topic, profile: job.profile });
    const client = fakeClient([base]);
    const script = await generateScript(job, { provider: "anthropic", targetMinutes: 2, client });
    assert.equal(client.calls.length, 1);
    assert.ok(userOf(client.calls[0]).includes("목표 길이 2분"));
    assert.ok(scriptChars(script) >= scriptBudget(2, charsPerMinute(job.profile.voiceRate)).minChars);
  });
});
