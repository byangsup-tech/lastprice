import { promises as fs } from "fs";
import {
  bgmPath as resolveBgmPath,
  llmModel,
  llmProvider,
  loadProfile,
  resolveVisualMode,
  ttsProvider,
  ttsVoice,
} from "./config";
import {
  acquireLock,
  canSkipStage,
  clearManifestsFrom,
  createJob,
  fileExists,
  hashInputs,
  loadJob,
  loadScript,
  loadTimeline,
  loadUsedTopics,
  makeLogger,
  markTopicUsed,
  readJsonFile,
  saveJob,
  setStage,
  writeManifest,
} from "./jobs";
import { jobPaths } from "./paths";
import { candidateToTopic, runResearch, selectAutoTopic } from "./research/collect";
import { generateScript } from "./script/generate";
import { fontStatusSync } from "./tools/fonts";
import {
  STAGES,
  type ChannelProfile,
  type FramePlan,
  type Job,
  type JobOptions,
  type Privacy,
  type ResearchReport,
  type Script,
  type StageKey,
  type Timeline,
} from "./types";
import { synthesizeScenes } from "./voice/tts";
import { renderFrames } from "./visuals/render";
import { renderThumbnail } from "./visuals/thumbnail";
import { composeVideo } from "./video/compose";
import { uploadJobVideo } from "./publish/youtube-upload";

/**
 * 파이프라인 오케스트레이터.
 * - 단계 순서: research → script → voice → visuals → render → thumbnail → upload
 * - 각 단계는 입력 해시 매니페스트로 idempotent (입력 동일 + 산출물 존재 → skip), --force로 무시
 * - 작업 잠금(acquireLock)으로 동시 실행 방지, 시그널·예외 시 현재 단계 failed 기록 후 잠금 해제
 */

export interface RunOptions {
  from?: StageKey;
  to?: StageKey;
  force?: boolean;
  /** 업로드 단계 실행 (job.options.upload와 OR) */
  upload?: boolean;
  privacy?: Privacy;
  publishAt?: string;
  log?: (line: string) => void;
}

export class StageError extends Error {
  constructor(
    public readonly stage: StageKey,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "StageError";
  }
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function requireScript(job: Job): Promise<Script> {
  const script = await loadScript(job.id);
  if (!script) throw new Error("script.json이 없습니다 — 대본 단계를 먼저 실행하세요");
  return script;
}

async function requireTimeline(job: Job): Promise<Timeline> {
  const tl = await loadTimeline(job.id);
  if (!tl) throw new Error("audio/timeline.json이 없습니다 — 음성 단계를 먼저 실행하세요");
  return tl;
}

type StageFn = (job: Job, ctx: StageContext) => Promise<Job>;

interface StageContext {
  opts: RunOptions;
  log: (line: string) => Promise<void> | void;
}

const stageImpl: Record<StageKey, StageFn> = {
  async research(job, { log }) {
    // 주제가 이미 확정된 작업 — 리서치는 작업 생성 시(createAutoJob) 수행됨
    await log(`리서치: 주제 확정 "${job.topic.title}" (candidate ${job.topic.candidateId ?? "수동"})`);
    return setStage(job, "research", { status: "done", note: "주제 확정" });
  },

  async script(job, { opts, log }) {
    const p = jobPaths(job.id);
    const provider = job.demo ? "template" : llmProvider();
    const hash = await hashInputs([
      JSON.stringify(job.topic),
      provider,
      llmModel(),
      String(job.profile.targetMinutes),
      job.demo ? "demo" : "",
    ]);
    if (!opts.force && (await canSkipStage(job.id, "script", hash))) {
      await log("대본: skip (입력 동일)");
      return setStage(job, "script", { status: "done", note: "skip (입력 동일)" });
    }
    const script = await generateScript(job, { provider, log: (l) => void log(l) });
    job.outputs.scriptPath = p.scriptFile;
    job.outputs.metadataPath = p.metadataFile;
    await writeManifest(job.id, "script", hash, [p.scriptFile, p.metadataFile]);
    await log(
      `대본: "${script.title}" — 장면 ${script.scenes.length}개, 챕터 ${script.chapters.length}개, 예상 ${script.estimatedMinutes}분 (${script.generator})`,
    );
    return setStage(job, "script", {
      status: "done",
      note: `${script.scenes.length}장면 · 예상 ${script.estimatedMinutes}분 · ${script.generator}${script.model ? ` (${script.model})` : ""}`,
    });
  },

  async voice(job, { opts, log }) {
    const p = jobPaths(job.id);
    const script = await requireScript(job);
    const provider = ttsProvider();
    const voice = ttsVoice(job.profile);
    const rate = job.profile.voiceRate;
    const hash = await hashInputs([{ file: p.scriptFile }, provider, voice, rate]);
    if (!opts.force && (await canSkipStage(job.id, "voice", hash))) {
      await log("음성: skip (입력 동일)");
      return setStage(job, "voice", { status: "done", note: "skip (입력 동일)" });
    }
    const result = await synthesizeScenes(job, script, {
      provider,
      voice,
      rate,
      force: opts.force,
      log: (l) => void log(l),
    });
    job.outputs.audioDir = p.audioDir;
    job.outputs.timelinePath = p.timelineFile;
    job.outputs.srtPath = result.srtPath;
    job.outputs.measuredCharsPerMinute = Math.round(result.measuredCharsPerMinute);
    await writeManifest(job.id, "voice", hash, [p.timelineFile, result.srtPath]);
    const minutes = (result.timeline.totalMs / 60000).toFixed(1);
    await log(`음성: ${result.audios.length}장면, 총 ${minutes}분, 실측 ${Math.round(result.measuredCharsPerMinute)}자/분 (${provider}/${voice})`);
    return setStage(job, "voice", {
      status: "done",
      note: `${result.audios.length}장면 · ${minutes}분 · ${provider}/${voice}`,
    });
  },

  async visuals(job, { opts, log }) {
    const p = jobPaths(job.id);
    const script = await requireScript(job);
    const timeline = await requireTimeline(job);
    const mode = resolveVisualMode(job.options.visualMode, job.profile);
    const hash = await hashInputs([{ file: p.scriptFile }, { file: p.timelineFile }, mode]);
    if (!opts.force && (await canSkipStage(job.id, "visuals", hash))) {
      await log("시각자료: skip (입력 동일)");
      return setStage(job, "visuals", { status: "done", note: "skip (입력 동일)" });
    }
    const plan = await renderFrames(job, script, timeline, { mode, force: opts.force, log: (l) => void log(l) });
    job.outputs.framesDir = p.framesDir;
    await writeManifest(job.id, "visuals", hash, [p.framePlanFile]);
    const stock = plan.scenes.filter((s) => s.credit).length;
    await log(`시각자료: ${plan.scenes.length}장면 (${plan.mode}${stock ? `, 스톡 ${stock}` : ""})`);
    return setStage(job, "visuals", { status: "done", note: `${plan.scenes.length}장면 · ${plan.mode}` });
  },

  async render(job, { opts, log }) {
    const p = jobPaths(job.id);
    const script = await requireScript(job);
    const bgm = resolveBgmPath(job.profile);
    const progressBar = job.options.progressBar !== false;
    const hash = await hashInputs([
      { file: p.timelineFile },
      { file: p.framePlanFile },
      { file: p.srtFile },
      bgm ?? "",
      fontStatusSync().family,
      String(progressBar),
    ]);
    if (!opts.force && (await canSkipStage(job.id, "render", hash))) {
      await log("영상 합성: skip (입력 동일)");
      return setStage(job, "render", { status: "done", note: "skip (입력 동일)" });
    }
    let lastPct = -1;
    const result = await composeVideo(job, script, {
      bgmPath: bgm,
      progressBar,
      force: opts.force,
      log: (l) => void log(l),
      onProgress: (ratio) => {
        const pct = Math.floor(ratio * 10) * 10;
        if (pct !== lastPct) {
          lastPct = pct;
          void log(`영상 합성: ${pct}%`);
        }
      },
    });
    job.outputs.videoPath = result.videoPath;
    job.outputs.durationMs = result.durationMs;
    job.outputs.metadataPath = p.metadataFile;
    await writeManifest(job.id, "render", hash, [result.videoPath, p.metadataFile]);
    await log(`영상 합성: ${result.videoPath} (${(result.durationMs / 1000).toFixed(1)}초, 챕터 ${result.metadata.chapters.length}개)`);
    return setStage(job, "render", {
      status: "done",
      note: `${(result.durationMs / 60000).toFixed(1)}분 · 챕터 ${result.metadata.chapters.length}개`,
    });
  },

  async thumbnail(job, { opts, log }) {
    const p = jobPaths(job.id);
    const script = await requireScript(job);
    const plan = await readJsonFile<FramePlan>(p.framePlanFile);
    // 스톡 사진이 바뀌면 썸네일도 다시 만들도록 credits.json 내용을 해시에 포함
    const hash = await hashInputs([
      JSON.stringify(script.thumbnail),
      script.title,
      { file: p.creditsFile },
      JSON.stringify(job.profile.theme),
    ]);
    if (!opts.force && (await canSkipStage(job.id, "thumbnail", hash))) {
      await log("썸네일: skip (입력 동일)");
      return setStage(job, "thumbnail", { status: "done", note: "skip (입력 동일)" });
    }
    const result = await renderThumbnail(job, script, { plan, log: (l) => void log(l) });
    job.outputs.thumbnailPath = result.path;
    await writeManifest(job.id, "thumbnail", hash, [result.path]);
    await log(`썸네일: ${result.path} (${Math.round(result.bytes / 1024)} KB)`);
    return setStage(job, "thumbnail", { status: "done", note: `${Math.round(result.bytes / 1024)} KB` });
  },

  async upload(job, { opts, log }) {
    const p = jobPaths(job.id);
    if (!(opts.upload || job.options.upload)) {
      await log("업로드: 건너뜀 (--upload 미지정)");
      return setStage(job, "upload", { status: "skipped", note: "--upload 미지정" });
    }
    if (!(await fileExists(p.finalVideo))) throw new Error("final.mp4가 없습니다 — 영상 합성 단계를 먼저 실행하세요");
    const privacy = opts.privacy ?? job.options.privacy;
    const publishAt = opts.publishAt ?? job.options.publishAt;
    const hash = await hashInputs([{ file: p.finalVideo }, { file: p.metadataFile }, privacy, publishAt ?? ""]);
    if (!opts.force && job.outputs.youtubeVideoId && (await canSkipStage(job.id, "upload", hash))) {
      await log(`업로드: skip (이미 업로드됨 ${job.outputs.youtubeUrl})`);
      return setStage(job, "upload", { status: "done", note: `skip (${job.outputs.youtubeUrl})` });
    }
    const result = await uploadJobVideo(job, { privacy, publishAt, log: (l) => void log(l) });
    job.outputs.youtubeVideoId = result.videoId;
    job.outputs.youtubeUrl = result.url;
    await writeManifest(job.id, "upload", hash, [p.finalVideo]);
    await log(`업로드: ${result.url} (${privacy}${publishAt ? `, 예약 ${publishAt}` : ""})${result.notes.length ? ` — ${result.notes.join("; ")}` : ""}`);
    return setStage(job, "upload", {
      status: "done",
      note: [`${privacy}`, ...result.notes].join(" · "),
    });
  },
};

/** 지정 구간의 단계를 순서대로 실행. 실패 시 StageError를 던진다 (job.json에는 failed 기록됨). */
export async function runStages(jobId: string, opts: RunOptions = {}): Promise<Job> {
  const initial = await loadJob(jobId);
  if (!initial) throw new Error(`작업을 찾을 수 없습니다: ${jobId}`);
  const p = jobPaths(jobId);
  const fileLog = makeLogger(p, false);
  const log = async (line: string) => {
    await fileLog(line);
    opts.log?.(line);
  };

  const fromIdx = opts.from ? STAGES.indexOf(opts.from) : 0;
  const toIdx = opts.to ? STAGES.indexOf(opts.to) : STAGES.length - 1;
  if (fromIdx < 0 || toIdx < 0 || fromIdx > toIdx) throw new Error(`잘못된 단계 범위: ${opts.from} → ${opts.to}`);
  const effectiveFrom = Math.max(fromIdx, 1); // research는 작업 생성 시 완료
  if (effectiveFrom > toIdx) {
    await log("실행할 단계 없음 (리서치는 작업 생성 시 완료됨)");
    return initial;
  }

  const release = await acquireLock(jobId);
  let job = initial;
  let current: StageKey | null = null;

  const failCurrent = async (reason: string) => {
    if (!current) return;
    try {
      const fresh = (await loadJob(jobId)) ?? job;
      await setStage(fresh, current, { status: "failed", error: reason });
    } catch {
      // 기록 실패는 무시
    }
  };
  const onSignal = (sig: NodeJS.Signals) => {
    void (async () => {
      await failCurrent(`시그널 ${sig}로 중단됨`);
      await release();
      process.exit(130);
    })();
  };
  const onUncaught = (err: unknown) => {
    void (async () => {
      await log(`치명적 오류: ${errMessage(err)}`);
      await failCurrent(`치명적 오류: ${errMessage(err)}`);
      await release();
      process.exit(1);
    })();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onUncaught);

  try {
    if (opts.force && opts.from) await clearManifestsFrom(jobId, opts.from);
    if (opts.force && !opts.from) await clearManifestsFrom(jobId, "script");
    await log(`실행 시작: ${STAGES[effectiveFrom]} → ${STAGES[toIdx]}${opts.force ? " (force)" : ""}`);
    for (let i = effectiveFrom; i <= toIdx; i++) {
      const stage = STAGES[i];
      current = stage;
      job = await setStage(job, stage, { status: "running" });
      const started = Date.now();
      try {
        job = await stageImpl[stage](job, { opts, log });
        await log(`[${stage}] 완료 (${((Date.now() - started) / 1000).toFixed(1)}초)`);
      } catch (err) {
        const message = errMessage(err);
        await log(`[${stage}] 실패: ${message}`);
        job = await setStage(job, stage, { status: "failed", error: message });
        throw new StageError(stage, message, err);
      }
    }
    current = null;
    return job;
  } finally {
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.off("uncaughtException", onUncaught);
    process.off("unhandledRejection", onUncaught);
    await release();
  }
}

// ── 작업 생성 헬퍼 ────────────────────────────────────────────

export interface AutoJobOptions {
  options?: Partial<JobOptions>;
  refresh?: boolean;
  minScore?: number;
  minFit?: number;
  log?: (line: string) => void;
}

/** 리서치 → 자동 선정 → 작업 생성. 적합한 주제가 없으면 null (작업 생성 안 함). */
export async function createAutoJob(
  profile?: ChannelProfile,
  opts: AutoJobOptions = {},
): Promise<{ job: Job | null; report: ResearchReport; reason?: string }> {
  const prof = profile ?? (await loadProfile());
  const report = await runResearch(prof, { refresh: opts.refresh ?? true, log: opts.log });
  const used = await loadUsedTopics();
  const candidate = selectAutoTopic(report, used, { minScore: opts.minScore, minFit: opts.minFit });
  if (!candidate) {
    return { job: null, report, reason: "적합한 주제 없음 (점수·적합도 기준 미달 또는 이미 사용됨)" };
  }
  const job = await createJob({ topic: candidateToTopic(candidate), profile: prof, options: opts.options });
  await markTopicUsed(candidate.title);
  opts.log?.(`자동 선정: "${candidate.title}" (score ${candidate.score}) → 작업 ${job.id}`);
  return { job, report };
}

/** 작업 옵션 갱신 (privacy/publishAt/upload 등) */
export async function updateJobOptions(jobId: string, patch: Partial<JobOptions>): Promise<Job> {
  const job = await loadJob(jobId);
  if (!job) throw new Error(`작업을 찾을 수 없습니다: ${jobId}`);
  job.options = { ...job.options, ...patch };
  if (job.options.publishAt && job.options.privacy !== "private") job.options.privacy = "private";
  return saveJob(job);
}

/** 작업 디렉터리 산출물 크기 합계 (status 표시용) */
export async function jobDiskUsage(jobId: string): Promise<number> {
  const root = jobPaths(jobId).root;
  let total = 0;
  const walk = async (dir: string) => {
    for (const ent of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = `${dir}/${ent.name}`;
      if (ent.isDirectory()) await walk(full);
      else total += (await fs.stat(full).catch(() => ({ size: 0 }))).size;
    }
  };
  await walk(root);
  return total;
}
