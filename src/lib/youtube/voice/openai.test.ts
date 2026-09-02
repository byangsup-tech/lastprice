import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  OPENAI_TTS_MODEL,
  OPENAI_TTS_URL,
  buildOpenAiRequest,
  createOpenAiSynthesizer,
  resolveOpenAiVoice,
} from "./openai";
import { TtsError } from "./tts";

test("resolveOpenAiVoice — allowlist만 허용, 아니면 alloy", () => {
  assert.equal(resolveOpenAiVoice("nova"), "nova");
  assert.equal(resolveOpenAiVoice(" Onyx "), "onyx");
  assert.equal(resolveOpenAiVoice("ko-KR-InJoonNeural"), "alloy");
  assert.equal(resolveOpenAiVoice(undefined), "alloy");
  assert.equal(resolveOpenAiVoice(""), "alloy");
});

test("buildOpenAiRequest — 애드엔덤 §C 본문·헤더", () => {
  const { url, init } = buildOpenAiRequest({ apiKey: "sk-test", voice: "alloy", text: "안녕하세요." });
  assert.equal(url, OPENAI_TTS_URL);
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer sk-test");
  assert.equal(headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(String(init.body)), {
    model: OPENAI_TTS_MODEL,
    voice: "alloy",
    input: "안녕하세요.",
    response_format: "mp3",
  });
});

test("createOpenAiSynthesizer — 바이너리 응답을 outFile에 쓰고 words는 비어 있음", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-openai-"));
  const outFile = path.join(dir, "scene-001.mp3");
  const calls: { url: string; init?: RequestInit }[] = [];
  const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);
  const synth = createOpenAiSynthesizer({
    apiKey: "sk-test",
    voice: "alloy",
    rate: "+0%",
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response(bytes, { status: 200 });
    },
  });
  const res = await synth.synthesize({
    sceneId: "s01",
    text: "테스트.",
    outFile,
    workDir: dir,
    signal: new AbortController().signal,
  });
  assert.deepEqual(res, { words: [], timed: false });
  assert.deepEqual([...(await fs.readFile(outFile))], [...bytes]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, OPENAI_TTS_URL);
  assert.ok(calls[0].init?.signal, "abort signal이 fetch에 전달돼야 함");
  await fs.rm(dir, { recursive: true, force: true });
});

test("createOpenAiSynthesizer — 401은 즉시 실패, 429/5xx는 재시도 가능", async () => {
  const mk = (status: number) =>
    createOpenAiSynthesizer({
      apiKey: "sk",
      voice: "alloy",
      rate: "+0%",
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status }),
    });
  const req = {
    sceneId: "s01",
    text: "x.",
    outFile: path.join(os.tmpdir(), "never.mp3"),
    workDir: os.tmpdir(),
    signal: new AbortController().signal,
  };
  for (const [status, retryable] of [
    [401, false],
    [400, false],
    [429, true],
    [503, true],
  ] as const) {
    await assert.rejects(mk(status).synthesize(req), (err: unknown) => {
      assert.ok(err instanceof TtsError);
      assert.equal(err.status, status);
      assert.equal(err.retryable, retryable, `status ${status}`);
      assert.match(err.message, /OpenAI TTS HTTP/);
      return true;
    });
  }
});

test("createOpenAiSynthesizer — fetch 자체 실패는 재시도 가능 오류", async () => {
  const synth = createOpenAiSynthesizer({
    apiKey: "sk",
    voice: "alloy",
    rate: "+0%",
    fetchImpl: async () => {
      throw new Error("fetch failed");
    },
  });
  await assert.rejects(
    synth.synthesize({
      sceneId: "s01",
      text: "x.",
      outFile: path.join(os.tmpdir(), "never.mp3"),
      workDir: os.tmpdir(),
      signal: new AbortController().signal,
    }),
    (err: unknown) => err instanceof TtsError && err.retryable,
  );
});
