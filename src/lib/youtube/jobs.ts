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
  // 같은 프로세스(Next 서버)에서 동시 쓰기가 겹쳐도 충돌하지 않도록 호출마다 고유한 임시 이름
  const tmp = `${file}.tmp-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
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
      progressBar: input.options?.progressBar,
    },
    demo: input.demo || undefined,
  };
  // 주제가 확정된 작업이므로 리서치 단계는 완료로 표시
  job.stages.research = { status: "done", finishedAt: now.toISOString(), note: "주제 확정" };
  // 디렉터리 생성은 비재귀(EEXIST 감지) — 같은 id가 이미 있으면 접미사를 붙여 재시도
  await fs.mkdir(JOBS_ROOT, { recursive: true });
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = attempt === 0 ? id : `${id}-${attempt + 1}`;
    try {
      await fs.mkdir(jobPaths(candidate).root);
      job.id = candidate;
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 4) throw err;
    }
  }
  const p = jobPaths(job.id);
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

/** 잠금이 이 시간보다 오래되면 경고 로그 (프로세스가 살아 있으면 잠금은 유지) */
const LOCK_MAX_AGE_MS = 3 * 60 * 60 * 1000;

interface LockInfo {
  pid: number;
  startedAt: string;
}

function parseLock(raw: string): LockInfo | null {
  try {
    const j = JSON.parse(raw) as Partial<LockInfo>;
    if (typeof j.pid === "number") return { pid: j.pid, startedAt: j.startedAt ?? "" };
  } catch {
    const pid = Number(raw.trim());
    if (Number.isFinite(pid)) return { pid, startedAt: "" };
  }
  return null;
}

/** 비정상 종료된 실행이 남긴 'running' 단계를 failed로 정리 */
async function reconcileStaleRun(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  if (!job) return;
  let changed = false;
  for (const stage of STAGES) {
    if (job.stages[stage]?.status === "running") {
      job.stages[stage] = {
        ...job.stages[stage],
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: "이전 실행이 비정상 종료됨 (프로세스 소멸)",
      };
      changed = true;
    }
  }
  if (changed) await saveJob(job);
}

/** 잠금 파일만 읽어 살아 있는 소유자 pid를 반환 (부수효과 없음 — GET 라우트용) */
export async function peekLock(jobId: string): Promise<{ pid: number; ageMs: number } | null> {
  const p = jobPaths(jobId);
  const raw = await fs.readFile(p.lockFile, "utf-8").catch(() => null);
  if (!raw) return null;
  const info = parseLock(raw);
  if (!info || info.pid <= 0 || !pidAlive(info.pid)) return null;
  const ageMs = info.startedAt ? Math.max(0, Date.now() - Date.parse(info.startedAt)) : 0;
  return { pid: info.pid, ageMs };
}

/**
 * 실행 중인 다른 프로세스가 있으면 그 pid를, 아니면 null.
 * 소유 프로세스가 죽은 잠금은 정리하고 running 단계를 failed로 되돌린다 (쓰기 경로에서만 호출).
 * 살아 있는 프로세스의 잠금은 오래됐어도 유지한다 (긴 렌더·업로드 중 이중 실행 방지).
 */
export async function lockHolder(jobId: string): Promise<number | null> {
  const p = jobPaths(jobId);
  const raw = await fs.readFile(p.lockFile, "utf-8").catch(() => null);
  if (!raw) return null;
  const info = parseLock(raw);
  if (info && info.pid > 0 && pidAlive(info.pid)) {
    const age = info.startedAt ? Date.now() - Date.parse(info.startedAt) : 0;
    if (age >= LOCK_MAX_AGE_MS) console.warn(`[youtube] 작업 ${jobId} 잠금이 ${Math.round(age / 3600000)}시간째 유지 중 (pid ${info.pid})`);
    return info.pid;
  }
  await fs.rm(p.lockFile, { force: true });
  await reconcileStaleRun(jobId);
  return null;
}

/**
 * 원자적 잠금 획득 (O_EXCL). 성공 시 해제 함수 반환.
 * 호출자는 finally·SIGINT·SIGTERM·uncaughtException에서 반드시 해제해야 한다 (pipeline.ts 참고).
 */
export async function acquireLock(jobId: string): Promise<() => Promise<void>> {
  const holder = await lockHolder(jobId);
  if (holder) throw new Error(`작업 ${jobId}은(는) 이미 실행 중입니다 (pid ${holder})`);
  const p = jobPaths(jobId);
  await fs.mkdir(p.root, { recursive: true });
  const info: LockInfo = { pid: process.pid, startedAt: new Date().toISOString() };
  await fs.writeFile(p.lockFile, JSON.stringify(info), { flag: "wx" }).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`작업 ${jobId}은(는) 이미 실행 중입니다`);
    }
    throw err;
  });
  return async () => {
    await fs.rm(p.lockFile, { force: true });
  };
}

/** 읽기 전용 실행 여부 (잠금 정리 없음) */
export async function isRunning(jobId: string): Promise<boolean> {
  return (await peekLock(jobId)) !== null;
}

// ── 단계 입력 해시 매니페스트 (idempotent skip) ───────────────

export interface StageManifest {
  stage: StageKey;
  inputHash: string;
  finishedAt: string;
  outputs: string[];
}

/** 여러 입력(파일 내용·문자열)을 하나의 sha1로 */
export async function hashInputs(parts: Array<string | { file: string }>): Promise<string> {
  const { createHash } = await import("crypto");
  const h = createHash("sha1");
  for (const part of parts) {
    if (typeof part === "string") h.update(part);
    else {
      try {
        h.update(await fs.readFile(part.file));
      } catch {
        h.update(`missing:${part.file}`);
      }
    }
    h.update("\u0000");
  }
  return h.digest("hex");
}

export async function readManifest(jobId: string, stage: StageKey): Promise<StageManifest | null> {
  return readJsonFile<StageManifest>(jobPaths(jobId).manifest(stage));
}

export async function writeManifest(
  jobId: string,
  stage: StageKey,
  inputHash: string,
  outputs: string[],
): Promise<void> {
  await writeJsonFile(jobPaths(jobId).manifest(stage), {
    stage,
    inputHash,
    finishedAt: new Date().toISOString(),
    outputs,
  } satisfies StageManifest);
}

/** 매니페스트가 있고 해시가 같고 산출물이 모두 존재하면 true (→ 단계 건너뜀) */
export async function canSkipStage(jobId: string, stage: StageKey, inputHash: string): Promise<boolean> {
  const m = await readManifest(jobId, stage);
  if (!m || m.inputHash !== inputHash) return false;
  for (const f of m.outputs) if (!(await fileExists(f))) return false;
  return true;
}

/** stage와 그 이후 단계의 매니페스트 제거 (--force) */
export async function clearManifestsFrom(jobId: string, stage: StageKey): Promise<void> {
  const idx = STAGES.indexOf(stage);
  for (const s of STAGES.slice(idx)) {
    await fs.rm(jobPaths(jobId).manifest(s), { force: true });
  }
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
