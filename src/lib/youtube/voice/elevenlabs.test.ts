import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import {
  ELEVENLABS_DEFAULT_MODEL,
  buildElevenLabsRequest,
  createElevenLabsSynthesizer,
  parseElevenLabsResponse,
  wordsFromAlignment,
  type ElevenLabsAlignment,
} from "./elevenlabs";
import { TtsError } from "./tts";

/** "첫 문장. 둘" 을 문자 단위로 0.1초씩 배치 */
function alignment(text: string, step = 0.1): ElevenLabsAlignment {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * step),
    character_end_times_seconds: characters.map((_, i) => (i + 1) * step),
  };
}

test("wordsFromAlignment — 공백 기준 단어 묶기, 구두점 포함, ms 반올림", () => {
  const words = wordsFromAlignment(alignment("첫 문장. 둘"));
  assert.deepEqual(words, [
    { text: "첫", startMs: 0, endMs: 100 },
    { text: "문장.", startMs: 200, endMs: 500 },
    { text: "둘", startMs: 600, endMs: 700 },
  ]);
});

test("wordsFromAlignment — 연속 공백·앞뒤 공백·null 처리", () => {
  assert.deepEqual(wordsFromAlignment(alignment("  a  b ")).map((w) => w.text), ["a", "b"]);
  assert.deepEqual(wordsFromAlignment(null), []);
  assert.deepEqual(wordsFromAlignment(undefined), []);
});

test("buildElevenLabsRequest — 애드엔덤 §C URL·헤더·본문", () => {
  const { url, init } = buildElevenLabsRequest({ apiKey: "xi-test", voiceId: "voice/1", text: "안녕." });
  assert.equal(
    url,
    "https://api.elevenlabs.io/v1/text-to-speech/voice%2F1/with-timestamps?output_format=mp3_44100_128",
  );
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers["xi-api-key"], "xi-test");
  assert.equal(headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(String(init.body)), { text: "안녕.", model_id: ELEVENLABS_DEFAULT_MODEL });
  const custom = buildElevenLabsRequest({ apiKey: "k", voiceId: "v", modelId: "eleven_turbo_v2_5", text: "x" });
  assert.equal(JSON.parse(String(custom.init.body)).model_id, "eleven_turbo_v2_5");
});

test("parseElevenLabsResponse — base64 디코드 + alignment → words", () => {
  const audio = Buffer.from("ID3-fake-audio");
  const { audio: out, words } = parseElevenLabsResponse({
    audio_base64: audio.toString("base64"),
    alignment: alignment("a b"),
  });
  assert.equal(out.toString(), "ID3-fake-audio");
  assert.deepEqual(words.map((w) => w.text), ["a", "b"]);
  // alignment 없고 normalized_alignment만 있을 때
  const alt = parseElevenLabsResponse({
    audio_base64: audio.toString("base64"),
    alignment: null,
    normalized_alignment: alignment("c"),
  });
  assert.deepEqual(alt.words.map((w) => w.text), ["c"]);
  assert.throws(() => parseElevenLabsResponse({ nope: 1 }), (e: unknown) => e instanceof TtsError && !e.retryable);
});

test("createElevenLabsSynthesizer — JSON 응답 → mp3 파일 + 실제 타이밍", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "yt-eleven-"));
  const outFile = path.join(dir, "scene-001.mp3");
  const audio = Buffer.from([1, 2, 3, 4]);
  let seenUrl = "";
  const synth = createElevenLabsSynthesizer({
    apiKey: "xi",
    voiceId: "abc",
    rate: "+5%",
    fetchImpl: async (url) => {
      seenUrl = url;
      return new Response(
        JSON.stringify({ audio_base64: audio.toString("base64"), alignment: alignment("첫 문장.") }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  assert.equal(synth.provider, "elevenlabs");
  assert.equal(synth.voice, "abc");
  const res = await synth.synthesize({
    sceneId: "s01",
    text: "첫 문장.",
    outFile,
    workDir: dir,
    signal: new AbortController().signal,
  });
  assert.match(seenUrl, /\/v1\/text-to-speech\/abc\/with-timestamps/);
  assert.equal(res.timed, true);
  assert.deepEqual(res.words.map((w) => w.text), ["첫", "문장."]);
  assert.deepEqual([...(await fs.readFile(outFile))], [1, 2, 3, 4]);
  await fs.rm(dir, { recursive: true, force: true });
});

test("createElevenLabsSynthesizer — 401 즉시 실패 / 5xx 재시도 가능", async () => {
  const mk = (status: number) =>
    createElevenLabsSynthesizer({
      apiKey: "xi",
      voiceId: "abc",
      rate: "+0%",
      fetchImpl: async () => new Response("{}", { status }),
    });
  const req = {
    sceneId: "s01",
    text: "x.",
    outFile: path.join(os.tmpdir(), "never.mp3"),
    workDir: os.tmpdir(),
    signal: new AbortController().signal,
  };
  await assert.rejects(mk(401).synthesize(req), (e: unknown) => e instanceof TtsError && !e.retryable);
  await assert.rejects(mk(502).synthesize(req), (e: unknown) => e instanceof TtsError && e.retryable);
});
