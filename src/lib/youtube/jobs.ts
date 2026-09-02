import { promises as fs } from "fs";
import path from "path";
import {
  JOBS_ROOT,
  USED_TOPICS_FILE,
  isValidJobId,
  jobPaths,
  type JobPaths,
} from "./paths";
import {
  STAGES,
  type ChannelProfile,
  type Job,
  type JobOptions,
  type JobSummary,
  type Script,
  type StageKey,
  type StageState,
  type Timeline,
  type Topic,
  type VideoMetadata,
} from "./types";
import { hashId, kstStamp, normalizeKey } from "./util";

/** job.json CRUD + 단계 상태 전이 + 잠금 + 로그 */

export async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFile(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    const st = await fs.stat(file);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

function emptyStages(): Record<StageKey, StageState> {
  return Object.fromEntries(STAGES.map((s) => [s, { status: "pending" as const }])) as Record<
    StageKey,
    StageState
  >;
}

export function newJobId(title: string, now = new Date()): string {
  return `${kstStamp(now)}-${hashId(normalizeKey(title) + now.getTime()).slice(0, 6)}`;
}

export interface CreateJobInput {
  topic: Topic;
  profile: ChannelProfile;
  options?: Partial<JobOptions>;
  demo?: boolean;
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  const now = new Date();
  const id = newJobId(input.topic.title, now);
  const job: Job = {
    id,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    topic: input.topic,
    profile: input.profile,
    stages: emptyStages(),
    outputs: {},
    options: {
      upload: input.options?.upload ?? false,
      privacy: input.options?.privacy ?? "private",
      publishAt: input.options?.publishAt,
      visualMode: input.options?.visualMode,
    },
    demo: input.demo || undefined,
  };
  // 기존 작업이면 리서치 단계는 이미 끝난 것으로 표시
  job.stages.research = { status: "done", finishedAt: now.toISOString(), note: "주제 확정" };
  const p = jobPaths(id);
  await fs.mkdir(p.logsDir, { recursive: true });
  await writeJsonFile(p.jobFile, job);
  return job;
}

export async function loadJob(jobId: string): Promise<Job | null> {
  if (!isValidJobId(jobId)) return null;
  return readJsonFile<Job>(jobPaths(jobId).jobFile);
}

export async function saveJob(job: Job): Promise<Job> {
  job.updatedAt = new Date().toISOString();
  await writeJsonFile(jobPaths(job.id).jobFile, job);
  return job;
}

export async function listJobs(): Promise<Job[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(JOBS_ROOT);
  } catch {
    return [];
  }
  const jobs = await Promise.all(
    entries.filter(isValidJobId).map((id) => loadJob(id)),
  );
  return jobs
    .filter((j): j is Job => !!j)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

export async function deleteJob(jobId: string): Promise<void> {
  const p = jobPaths(jobId);
  await fs.rm(p.root, { recursive: true, force: true });
}

// ── 단계 상태 ────────────────────────────────────────────────

export async function setStage(
  job: Job,
  stage: StageKey,
  patch: Partial<StageState> & { status: StageState["status"] },
): Promise<Job> {
  const prev = job.stages[stage] ?? { status: "pending" };
  const now = new Date().toISOString();
  const next: StageState = { ...prev, ...patch };
  if (patch.status === "running") {
    next.startedAt = now;
    delete next.finishedAt;
    delete next.error;
  }
  if (patch.status === "done" || patch.status === "failed" || patch.status === "skipped") {
    next.finishedAt = now;
  }
  job.stages[stage] = next;
  return saveJob(job);
}

/** 이후 단계의 산출물이 무효화됐을 때 (예: 대본 재생성) 뒤 단계를 pending으로 되돌린다 */
export async function resetStagesAfter(job: Job, stage: StageKey): Promise<Job> {
  const idx = STAGES.indexOf(stage);
  for (const s of STAGES.slice(idx + 1)) {
    job.stages[s] = { status: "pending" };
  }
  return saveJob(job);
}

// ── 산출물 로드 ──────────────────────────────────────────────

export async function loadScript(jobId: string): Promise<Script | null> {
  return readJsonFile<Script>(jobPaths(jobId).scriptFile);
}

export async function loadMetadata(jobId: string): Promise<VideoMetadata | null> {
  return readJsonFile<VideoMetadata>(jobPaths(jobId).metadataFile);
}

export async function loadTimeline(jobId: string): Promise<Timeline | null> {
  return readJsonFile<Timeline>(jobPaths(jobId).timelineFile);
}

// ── 잠금 (동시 실행 방지) ─────────────────────────────────────

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** 실행 중인 다른 프로세스가 있으면 그 pid를, 아니면 null */
export async function lockHolder(jobId: string): Promise<number | null> {
  const p = jobPaths(jobId);
  const raw = await fs.readFile(p.lockFile, "utf-8").catch(() => null);
  if (!raw) return null;
  const pid = Number(raw.trim());
  if (Number.isFinite(pid) && pid > 0 && pidAlive(pid)) return pid;
  await fs.rm(p.lockFile, { force: true }); // 죽은 프로세스의 잠금은 제거
  return null;
}

export async function acquireLock(jobId: string): Promise<() => Promise<void>> {
  const holder = await lockHolder(jobId);
  if (holder) throw new Error(`작업 ${jobId}은(는) 이미 실행 중입니다 (pid ${holder})`);
  const p = jobPaths(jobId);
  await fs.mkdir(p.root, { recursive: true });
  await fs.writeFile(p.lockFile, String(process.pid), { flag: "wx" }).catch(async (err) => {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`작업 ${jobId}은(는) 이미 실행 중입니다`);
    }
    throw err;
  });
  return async () => {
    await fs.rm(p.lockFile, { force: true });
  };
}

export async function isRunning(jobId: string): Promise<boolean> {
  return (await lockHolder(jobId)) !== null;
}

// ── 로그 ─────────────────────────────────────────────────────

export function makeLogger(p: JobPaths, echo = true) {
  return async (line: string): Promise<void> => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    if (echo) console.log(stamped);
    try {
      await fs.mkdir(p.logsDir, { recursive: true });
      await fs.appendFile(p.pipelineLog, stamped + "\n");
    } catch {
      // 로그 실패는 무시
    }
  };
}

export async function readLogTail(jobId: string, lines = 60): Promise<string[]> {
  const p = jobPaths(jobId);
  const raw = await fs.readFile(p.pipelineLog, "utf-8").catch(() => "");
  const all = raw.split("\n").filter(Boolean);
  return all.slice(-lines);
}

// ── 요약 ─────────────────────────────────────────────────────

export async function summarizeJob(job: Job): Promise<JobSummary> {
  const p = jobPaths(job.id);
  const script = await loadScript(job.id);
  const [hasVideo, hasThumbnail, running] = await Promise.all([
    fileExists(p.finalVideo),
    fileExists(p.thumbnailPng).then((ok) => ok || fileExists(p.thumbnailJpg)),
    isRunning(job.id),
  ]);
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    title: script?.title ?? job.topic.title,
    stages: Object.fromEntries(STAGES.map((s) => [s, job.stages[s]?.status ?? "pending"])) as Record<
      StageKey,
      StageState["status"]
    >,
    hasVideo,
    hasThumbnail,
    youtubeUrl: job.outputs.youtubeUrl,
    demo: job.demo,
    running,
  };
}

// ── 자동 선정 중복 방지 ───────────────────────────────────────

export async function loadUsedTopics(): Promise<string[]> {
  return (await readJsonFile<string[]>(USED_TOPICS_FILE)) ?? [];
}

export async function markTopicUsed(title: string): Promise<void> {
  const used = await loadUsedTopics();
  const key = normalizeKey(title);
  if (!used.includes(key)) {
    used.push(key);
    await writeJsonFile(USED_TOPICS_FILE, used.slice(-500));
  }
}

export function isTopicUsed(used: string[], title: string): boolean {
  return used.includes(normalizeKey(title));
}
