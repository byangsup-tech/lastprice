import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "fs";
import { DEFAULT_PROFILE } from "../config";
import { createJob, deleteJob, readJsonFile } from "../jobs";
import { jobPaths } from "../paths";
import { DEMO_TOPIC, demoScript } from "../script/template";
import type { Caption, Job, Script, Timeline, WordTiming } from "../types";
import { parseSrt } from "./subtitles";
import {
  TtsError,
  isRetryableError,
  runPool,
  synthesizeScenes,
  withRetry,
  type SceneAudioRecord,
  type SceneSynthesizer,
  type SynthesisRequest,
} from "./tts";

test("isRetryableError — TtsError 플래그, 네트워크 계열 메시지", () => {
  assert.equal(isRetryableError(new TtsError("x", { retryable: false })), false);
  assert.equal(isRetryableError(new TtsError("x", { retryable: true })), true);
  assert.equal(isRetryableError(new Error("WebSocket is not open: readyState 3")), true);
  assert.equal(isRetryableError(new Error("read ECONNRESET")), true);
  assert.equal(isRetryableError(new Error("No metadata received")), true);
  assert.equal(isRetryableError(new Error("잘못된 보이스 이름")), false);
});

test("runPool — 동시성 제한·입력 순서 보존·첫 실패 후 새 작업 중단", async () => {
  let active = 0;
  let peak = 0;
  const out = await runPool([1, 2, 3, 4, 5], 2, async (n) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
    return n * 10;
  });
  assert.deepEqual(out, [10, 20, 30, 40, 50]);
  assert.equal(peak, 2);

  const started: number[] = [];
  await assert.rejects(
    runPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n);
      await new Promise((r) => setTimeout(r, 5));
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/,
  );
  assert.ok(started.length < 6, `실패 후 새 작업을 계속 시작하면 안 됨 (started=${started.join(",")})`);
});

test("withRetry — 재시도 가능 오류만 delays 만큼 재시도", async () => {
  let n = 0;
  const v = await withRetry("t", async () => {
    n++;
    if (n < 3) throw new TtsError("flaky", { retryable: true });
    return "ok";
  }, [0, 0, 0]);
  assert.equal(v, "ok");
  assert.equal(n, 3);

  let m = 0;
  await assert.rejects(
    withRetry("t", async () => {
      m++;
      throw new TtsError("fatal", { retryable: false });
    }, [0, 0, 0]),
    /fatal/,
  );
  assert.equal(m, 1);

  let k = 0;
  await assert.rejects(
    withRetry("t", async () => {
      k++;
      throw new TtsError("always", { retryable: true });
    }, [0, 0, 0]),
    /always/,
  );
  assert.equal(k, 4, "초기 1회 + 재시도 3회");
});

// ── synthesizeScenes 통합 (가짜 공급자·가짜 probe, 실제 파일 시스템) ──

/** 글자당 120ms 로 단어 타이밍을 만드는 가짜 공급자 — Edge처럼 구두점 없는 토큰을 준다 */
function fakeSynth(opts: { failFirst?: number; retryable?: boolean; timed?: boolean } = {}): SceneSynthesizer & {
  calls: SynthesisRequest[];
} {
  let failures = opts.failFirst ?? 0;
  const calls: SynthesisRequest[] = [];
  return {
    provider: "edge",
    voice: "ko-KR-InJoonNeural",
    rate: "+5%",
    calls,
    async synthesize(req) {
      calls.push(req);
      if (failures > 0) {
        failures--;
        throw new TtsError("WebSocket closed", { retryable: opts.retryable ?? true });
      }
      await fs.writeFile(req.outFile, Buffer.from("fake-mp3"));
      if (opts.timed === false) return { words: [], timed: false };
      const words: WordTiming[] = [];
      let t = 100;
      for (const tok of req.text.split(/\s+/).filter(Boolean)) {
        const stripped = tok.replace(/[.?!…,]+$/g, "");
        words.push({ text: stripped, startMs: t, endMs: t + stripped.length * 120 });
        t += stripped.length * 120 + 60;
      }
      return { words, timed: true };
    },
  };
}

/** 가짜 probe: 마지막 단어 끝 + 1100ms 꼬리 무음 (Edge 실측과 비슷하게) */
function fakeProbeFor(synth: { calls: SynthesisRequest[] }, wordsByFile: Map<string, number>) {
  return async (file: string): Promise<number> => {
    const lastEnd = wordsByFile.get(file);
    if (lastEnd === undefined) throw new Error(`unknown file ${file}`);
    return lastEnd + 1100;
  };
}

async function withDemoJob(fn: (job: Job, script: Script) => Promise<void>): Promise<void> {
  const job = await createJob({ topic: DEMO_TOPIC, profile: DEFAULT_PROFILE, demo: true });
  try {
    const full = demoScript(DEFAULT_PROFILE);
    const script: Script = { ...full, scenes: full.scenes.slice(0, 3) };
    await fn(job, script);
  } finally {
    await deleteJob(job.id);
  }
}

test("synthesizeScenes — 파일·타임라인·자막 생성, 구두점 복원, 꼬리 무음 제거, 캐시 재사용", async () => {
  await withDemoJob(async (job, script) => {
    const synth = fakeSynth();
    // probe는 공급자가 만든 단어 타이밍을 기준으로 파일 길이를 흉내 낸다
    const lastEnds = new Map<string, number>();
    const wrapped: typeof synth = {
      ...synth,
      async synthesize(req) {
        const r = await synth.synthesize(req);
        lastEnds.set(req.outFile, r.words[r.words.length - 1].endMs);
        return r;
      },
    };
    const logs: string[] = [];
    const res = await synthesizeScenes(job, script, {
      synthesizer: wrapped,
      probe: fakeProbeFor(synth, lastEnds),
      retryDelaysMs: [0, 0, 0],
      log: (l) => logs.push(l),
    });
    const p = jobPaths(job.id);
    assert.equal(res.audios.length, 3);
    assert.equal(synth.calls.length, 3);
    assert.equal(res.srtPath, p.srtFile);

    // 장면 순서·파일명
    assert.deepEqual(
      res.audios.map((a) => a.sceneId),
      script.scenes.map((s) => s.id),
    );
    assert.equal(res.audios[0].file, p.sceneAudio(0));
    for (let i = 0; i < 3; i++) {
      assert.ok((await fs.stat(p.sceneAudio(i))).size > 0);
      const rec = await readJsonFile<SceneAudioRecord>(p.sceneAudioMeta(i));
      assert.ok(rec);
      assert.equal(rec.provider, "edge");
      assert.equal(rec.rate, "+5%");
      assert.equal(typeof rec.narrationHash, "string");
      // 꼬리 무음 제거: durationMs = lastWordEnd + 250 < fileDurationMs
      const lastEnd = rec.words[rec.words.length - 1].endMs;
      assert.equal(rec.durationMs, lastEnd + 250);
      assert.equal(rec.fileDurationMs, lastEnd + 1100);
    }
    // 임시 디렉터리는 남지 않는다
    const leftovers = (await fs.readdir(p.audioDir)).filter((n) => n.startsWith(".tmp-"));
    assert.deepEqual(leftovers, []);

    // 구두점 복원: 문장 끝 단어가 '.'로 끝난다
    const first = res.audios[0].words;
    assert.ok(first.some((w) => w.text.endsWith(".")), `구두점 복원 실패: ${first.map((w) => w.text).join(" ")}`);
    assert.equal(first.map((w) => w.text).join(" "), script.scenes[0].narration.replace(/\s+/g, " ").trim());

    // 타임라인: buildTimeline 규칙 (40ms 양자화, 연속)
    const tl = await readJsonFile<Timeline>(p.timelineFile);
    assert.ok(tl);
    assert.deepEqual(tl, res.timeline);
    assert.equal(tl.scenes[0].startMs, 0);
    assert.equal(tl.scenes[1].startMs, tl.scenes[0].endMs);
    assert.equal(tl.totalMs % 40, 0);

    // 자막
    const srt = await fs.readFile(p.srtFile, "utf-8");
    const cues = parseSrt(srt);
    assert.ok(cues.length >= 3);
    assert.equal(cues[0].startMs, res.audios[0].words[0].startMs);
    for (let i = 0; i + 1 < cues.length; i++) assert.ok(cues[i].endMs <= cues[i + 1].startMs);
    const captions = await readJsonFile<Caption[]>(p.captionsFile);
    assert.equal(captions?.length, cues.length);

    // 실측 분당 글자 수: 총 글자 / 총 사용 길이
    const chars = script.scenes.reduce((n, s) => n + s.narration.length, 0);
    const ms = res.audios.reduce((n, a) => n + a.durationMs, 0);
    assert.equal(res.measuredCharsPerMinute, Math.round((chars / (ms / 60000)) * 10) / 10);
    assert.ok(res.measuredCharsPerMinute > 0);

    // 두 번째 실행: 전부 캐시
    const synth2 = fakeSynth();
    const res2 = await synthesizeScenes(job, script, {
      synthesizer: synth2,
      probe: async () => {
        throw new Error("캐시면 probe를 호출하지 않아야 함");
      },
      retryDelaysMs: [0, 0, 0],
    });
    assert.equal(synth2.calls.length, 0);
    assert.deepEqual(res2.timeline, res.timeline);

    // voice가 다르면 캐시 무효
    const synth3 = { ...fakeSynth(), voice: "ko-KR-SunHiNeural" };
    const lastEnds3 = new Map<string, number>();
    const wrapped3: SceneSynthesizer = {
      ...synth3,
      async synthesize(req) {
        const r = await synth3.synthesize(req);
        lastEnds3.set(req.outFile, r.words[r.words.length - 1].endMs);
        return r;
      },
    };
    await synthesizeScenes(job, script, {
      synthesizer: wrapped3,
      probe: fakeProbeFor(synth3, lastEnds3),
      retryDelaysMs: [0, 0, 0],
    });
    assert.equal(synth3.calls.length, 3);

    // force: 캐시 무시
    const synth4 = { ...fakeSynth(), voice: "ko-KR-SunHiNeural" };
    const lastEnds4 = new Map<string, number>();
    const wrapped4: SceneSynthesizer = {
      ...synth4,
      async synthesize(req) {
        const r = await synth4.synthesize(req);
        lastEnds4.set(req.outFile, r.words[r.words.length - 1].endMs);
        return r;
      },
    };
    await synthesizeScenes(job, script, {
      synthesizer: wrapped4,
      probe: fakeProbeFor(synth4, lastEnds4),
      retryDelaysMs: [0, 0, 0],
      force: true,
    });
    assert.equal(synth4.calls.length, 3);
  });
});

test("synthesizeScenes — 타이밍 없는 공급자는 비례 타이밍 + 파일 길이 − 600", async () => {
  await withDemoJob(async (job, script) => {
    const synth = fakeSynth({ timed: false });
    const res = await synthesizeScenes(job, script, {
      synthesizer: synth,
      probe: async () => 8000,
      retryDelaysMs: [0, 0, 0],
    });
    for (const a of res.audios) {
      assert.equal(a.durationMs, 7400);
      assert.equal(a.fileDurationMs, 8000);
      assert.ok(a.words.length > 3, "비례 타이밍 단어가 있어야 자막이 생긴다");
      assert.ok(a.words[a.words.length - 1].endMs <= 7400);
    }
    const cues = parseSrt(await fs.readFile(jobPaths(job.id).srtFile, "utf-8"));
    assert.ok(cues.length >= 3);
  });
});

test("synthesizeScenes — 재시도 가능 오류는 재시도, 아니면 즉시 실패", async () => {
  await withDemoJob(async (job, script) => {
    const one: Script = { ...script, scenes: script.scenes.slice(0, 1) };
    const flaky = fakeSynth({ failFirst: 2 });
    const res = await synthesizeScenes(job, one, {
      synthesizer: flaky,
      probe: async () => 9000,
      retryDelaysMs: [0, 0, 0],
    });
    assert.equal(flaky.calls.length, 3);
    assert.equal(res.audios.length, 1);

    const fatal = fakeSynth({ failFirst: 1, retryable: false });
    await assert.rejects(
      synthesizeScenes(job, one, {
        synthesizer: fatal,
        probe: async () => 9000,
        retryDelaysMs: [0, 0, 0],
        force: true,
      }),
      /WebSocket closed/,
    );
    assert.equal(fatal.calls.length, 1);
  });
});

test("synthesizeScenes — 장면 타임아웃은 abort 신호를 보내고 재시도한다", async () => {
  await withDemoJob(async (job, script) => {
    const one: Script = { ...script, scenes: script.scenes.slice(0, 1) };
    let aborted = 0;
    let n = 0;
    const slowThenOk: SceneSynthesizer = {
      provider: "edge",
      voice: "v",
      rate: "+0%",
      async synthesize(req) {
        n++;
        if (n === 1) {
          await new Promise<void>((resolve) => {
            req.signal.addEventListener("abort", () => {
              aborted++;
              resolve();
            });
          });
          throw new TtsError("aborted", { retryable: true });
        }
        await fs.writeFile(req.outFile, "x");
        return { words: [], timed: false };
      },
    };
    const res = await synthesizeScenes(job, one, {
      synthesizer: slowThenOk,
      probe: async () => 3000,
      retryDelaysMs: [0, 0, 0],
      sceneTimeoutMs: 30,
    });
    assert.equal(aborted, 1);
    assert.equal(n, 2);
    assert.equal(res.audios[0].durationMs, 2400);
  });
});
