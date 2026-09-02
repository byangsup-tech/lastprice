/**
 * 유튜브 롱폼 자동화 CLI
 *
 *   npm run yt -- doctor                          환경·도구 점검 (+ 한글 폰트 다운로드)
 *   npm run yt -- research [--refresh] [--limit 25] [--json]
 *   npm run yt -- new --topic "제목" [--angle "…"] [--keywords a,b] [--upload] [--privacy private|unlisted|public] [--publish-at ISO]
 *   npm run yt -- new --candidate <순위|id>
 *   npm run yt -- run --job <id> [--from 단계] [--to 단계] [--force] [--upload] [--privacy …] [--publish-at ISO]
 *   npm run yt -- run --auto [--upload] [--privacy …] [--no-refresh]      리서치 → 자동 선정 → 전체 단계
 *   npm run yt -- script|voice|visuals|render|thumbnail|upload --job <id> [--force]
 *   npm run yt -- status [--job <id>] | list
 *   npm run yt -- demo [--keep]                   오프라인 데모 (키 불필요) — 파이프라인 검증용
 *   npm run yt -- auth                            YouTube 업로드용 OAuth 리프레시 토큰 발급
 *
 * 단계: research → script → voice → visuals → render → thumbnail → upload
 * 종료 코드: 0 성공 · 1 단계 실패 · 2 사용법 오류
 */
import { promises as fs } from "fs";
import path from "path";
import { loadProfile } from "../src/lib/youtube/config";
import { loadDotenvOnce } from "../src/lib/youtube/dotenv";
import { createDemoJob } from "../src/lib/youtube/demo";
import {
  createJob,
  deleteJob,
  isRunning,
  listJobs,
  loadJob,
  loadScript,
  markTopicUsed,
  summarizeJob,
} from "../src/lib/youtube/jobs";
import { jobPaths } from "../src/lib/youtube/paths";
import {
  createAutoJob,
  jobDiskUsage,
  runStages,
  StageError,
  updateJobOptions,
} from "../src/lib/youtube/pipeline";
import { startLocalOAuth } from "../src/lib/youtube/publish/oauth";
import { candidateToTopic, loadLatestReport, runResearch } from "../src/lib/youtube/research/collect";
import { buildEnvStatus, describeEnvStatus } from "../src/lib/youtube/status";
import {
  STAGES,
  STAGE_LABELS,
  type Privacy,
  type ResearchReport,
  type StageKey,
  type Topic,
} from "../src/lib/youtube/types";
import { formatDuration } from "../src/lib/youtube/util";

loadDotenvOnce();

// ── argv 파서 (의존성 없음) ───────────────────────────────────

interface Args {
  command: string;
  flags: Record<string, string | boolean>;
  positional: string[];
}

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positional.push(a);
    }
  }
  return { command: positional.shift() ?? "help", flags, positional };
}

function flagStr(flags: Args["flags"], key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function flagBool(flags: Args["flags"], key: string): boolean {
  const v = flags[key];
  return v === true || v === "true" || v === "1";
}

function usage(exitCode = 2): never {
  const text = `
사용법: npm run yt -- <명령> [옵션]

  doctor                                     환경·도구 점검 (한글 폰트 다운로드 포함)
  research [--refresh] [--limit N] [--json]  주제 리서치 (구글 트렌드·뉴스·자동완성·위키 + 선택 키)
  new --topic "제목" [--angle "…"] [--keywords a,b] [--upload] [--privacy P] [--publish-at ISO]
  new --candidate <순위|id>                  최근 리서치 후보로 작업 생성
  run --job <id> [--from S] [--to S] [--force] [--upload] [--privacy P] [--publish-at ISO]
  run --auto [--upload] [--privacy P] [--no-refresh] [--min-score 40]
  script|voice|visuals|render|thumbnail|upload --job <id> [--force]
  status [--job <id>] · list · delete --job <id>
  demo [--keep]                              오프라인 데모 (키 불필요)
  auth [--port 8484]                         YouTube OAuth 리프레시 토큰 발급

단계(S): ${STAGES.join(" → ")}
`;
  console.log(text.trim());
  process.exit(exitCode);
}

function parseStage(v: string | undefined, name: string): StageKey | undefined {
  if (v === undefined) return undefined;
  if ((STAGES as string[]).includes(v)) return v as StageKey;
  console.error(`--${name}: 알 수 없는 단계 "${v}" (가능: ${STAGES.join(", ")})`);
  return usage();
}

function parsePrivacy(v: string | undefined): Privacy | undefined {
  if (v === undefined) return undefined;
  if (v === "private" || v === "unlisted" || v === "public") return v;
  console.error(`--privacy: private | unlisted | public 중 하나여야 합니다 (입력: ${v})`);
  return usage();
}

function parsePublishAt(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) {
    console.error(`--publish-at: ISO 8601 형식이어야 합니다 (예: 2026-09-10T09:00:00+09:00)`);
    return usage();
  }
  return new Date(t).toISOString();
}

const log = (line: string) => console.log(line);

// ── 출력 헬퍼 ────────────────────────────────────────────────

function bar(v: number, width = 10): string {
  const n = Math.round(Math.max(0, Math.min(1, v)) * width);
  return "█".repeat(n) + "░".repeat(width - n);
}

function printReport(report: ResearchReport & { cacheStatus?: string }, limit: number): void {
  console.log(`리서치 ${report.generatedAt} (${report.cacheStatus ?? "live"}, LLM 재정렬: ${report.llmRerank})`);
  console.log("소스:");
  for (const s of report.sources) {
    const mark = s.status === "live" ? "✅" : s.status === "stale" ? "🕓" : s.status === "no-key" ? "🔑" : s.status === "skipped" ? "▫️" : "❌";
    console.log(`  ${mark} ${s.name} ${s.count}건${s.error ? ` — ${s.error.slice(0, 80)}` : ""}`);
  }
  console.log("후보:");
  report.candidates.slice(0, limit).forEach((c, i) => {
    const sg = c.signals;
    console.log(
      `${String(i + 1).padStart(2)}. [${String(c.score).padStart(3)}] ${c.title}${c.suggestedTitle ? ` → ${c.suggestedTitle}` : ""}`,
    );
    console.log(
      `     수요 ${bar(sg.demand, 6)} 경쟁여유 ${bar(sg.competition, 6)} 적합 ${bar(sg.fit, 6)} 신선 ${bar(sg.freshness, 6)} · ${c.sources.map((s) => s.source).filter((v, j, a) => a.indexOf(v) === j).join(", ")} · id ${c.id}`,
    );
    if (c.reasons.length) console.log(`     ${c.reasons.slice(0, 3).join(" / ")}`);
    for (const n of c.news.slice(0, 2)) console.log(`     · ${n.title}`);
  });
}

async function printJobStatus(jobId: string): Promise<void> {
  const job = await loadJob(jobId);
  if (!job) {
    console.error(`작업을 찾을 수 없습니다: ${jobId}`);
    process.exit(2);
  }
  const script = await loadScript(jobId);
  const running = await isRunning(jobId);
  console.log(`작업 ${job.id}${job.demo ? " (데모)" : ""}${running ? " — 실행 중" : ""}`);
  console.log(`주제: ${job.topic.title}${job.topic.angle ? ` — ${job.topic.angle}` : ""}`);
  if (script) console.log(`제목: ${script.title} (${script.scenes.length}장면, 예상 ${script.estimatedMinutes}분, ${script.generator})`);
  console.log(`옵션: privacy=${job.options.privacy} upload=${job.options.upload}${job.options.publishAt ? ` publishAt=${job.options.publishAt}` : ""}`);
  for (const s of STAGES) {
    const st = job.stages[s];
    const mark = st.status === "done" ? "✅" : st.status === "running" ? "⏳" : st.status === "failed" ? "❌" : st.status === "skipped" ? "▫️" : "·";
    console.log(`  ${mark} ${STAGE_LABELS[s].padEnd(6)} ${st.status}${st.note ? ` — ${st.note}` : ""}${st.error ? ` — ${st.error.slice(0, 160)}` : ""}`);
  }
  const o = job.outputs;
  if (o.videoPath) console.log(`영상: ${o.videoPath}${o.durationMs ? ` (${formatDuration(o.durationMs)})` : ""}`);
  if (o.thumbnailPath) console.log(`썸네일: ${o.thumbnailPath}`);
  if (o.youtubeUrl) console.log(`유튜브: ${o.youtubeUrl}`);
  console.log(`디스크: ${(await jobDiskUsage(jobId) / 1024 / 1024).toFixed(1)} MB · ${jobPaths(jobId).root}`);
}

// ── 명령 ─────────────────────────────────────────────────────

async function cmdDoctor(): Promise<void> {
  const status = await buildEnvStatus({ ensureFonts: true });
  for (const line of describeEnvStatus(status)) console.log(line);
  const profile = await loadProfile();
  console.log(`채널 프로필: ${profile.name} — ${profile.niche} (목표 ${profile.targetMinutes}분, 보이스 ${profile.voice} ${profile.voiceRate})`);
  if (!status.tools.ffmpeg.ok || !status.tools.chromium.ok) process.exitCode = 1;
}

async function cmdResearch(flags: Args["flags"]): Promise<void> {
  const profile = await loadProfile();
  const limitRaw = Number(flagStr(flags, "limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 ? Math.floor(limitRaw) : 25;
  const report = await runResearch(profile, { refresh: flagBool(flags, "refresh"), limit, log });
  if (flagBool(flags, "json")) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printReport(report, limit);
}

async function resolveCandidateTopic(ref: string): Promise<Topic> {
  const report = await loadLatestReport();
  if (!report) {
    console.error("최근 리서치 결과가 없습니다 — 먼저 `npm run yt -- research`를 실행하세요");
    process.exit(2);
  }
  const rank = Number(ref);
  const candidate =
    Number.isInteger(rank) && rank >= 1 && rank <= report.candidates.length
      ? report.candidates[rank - 1]
      : report.candidates.find((c) => c.id === ref);
  if (!candidate) {
    console.error(`후보를 찾을 수 없습니다: ${ref} (순위 1~${report.candidates.length} 또는 id)`);
    process.exit(2);
  }
  return candidateToTopic(candidate);
}

async function cmdNew(flags: Args["flags"]): Promise<void> {
  const profile = await loadProfile();
  const title = flagStr(flags, "topic");
  const candidateRef = flagStr(flags, "candidate");
  let topic: Topic;
  if (candidateRef) {
    topic = await resolveCandidateTopic(candidateRef);
  } else if (title) {
    if (title.length < 2 || title.length > 120) {
      console.error("--topic: 2~120자");
      usage();
    }
    topic = {
      title,
      angle: flagStr(flags, "angle"),
      keywords: (flagStr(flags, "keywords") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      sourceUrls: [],
    };
  } else {
    console.error("--topic 또는 --candidate가 필요합니다");
    return usage();
  }
  const privacy = parsePrivacy(flagStr(flags, "privacy"));
  const publishAt = parsePublishAt(flagStr(flags, "publish-at"));
  const job = await createJob({
    topic,
    profile,
    options: {
      upload: flagBool(flags, "upload"),
      privacy: publishAt ? "private" : privacy,
      publishAt,
      progressBar: !flagBool(flags, "no-bar"),
    },
  });
  await markTopicUsed(topic.title);
  console.log(`작업 생성: ${job.id} — "${topic.title}"`);
  console.log(`다음: npm run yt -- run --job ${job.id}`);
}

async function runAndReport(jobId: string, opts: Parameters<typeof runStages>[1]): Promise<void> {
  try {
    await runStages(jobId, { ...opts, log });
  } catch (err) {
    if (err instanceof StageError) {
      console.error(`\n[${STAGE_LABELS[err.stage]}] 단계 실패: ${err.message}`);
      console.error(`로그: ${jobPaths(jobId).pipelineLog}`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }
  console.log("");
  await printJobStatus(jobId);
}

async function cmdRun(flags: Args["flags"]): Promise<void> {
  const privacy = parsePrivacy(flagStr(flags, "privacy"));
  const publishAt = parsePublishAt(flagStr(flags, "publish-at"));
  const upload = flagBool(flags, "upload");
  const force = flagBool(flags, "force");
  const from = parseStage(flagStr(flags, "from"), "from");
  const to = parseStage(flagStr(flags, "to"), "to");

  let jobId = flagStr(flags, "job");
  if (flagBool(flags, "auto")) {
    const minScoreRaw = Number(flagStr(flags, "min-score"));
    const minScore = Number.isFinite(minScoreRaw) ? minScoreRaw : 40;
    const { job, report, reason } = await createAutoJob(undefined, {
      refresh: !flagBool(flags, "no-refresh"),
      minScore,
      options: { upload, privacy: publishAt ? "private" : privacy, publishAt, progressBar: !flagBool(flags, "no-bar") },
      log,
    });
    if (!job) {
      printReport(report, 10);
      console.log(`\n${reason} — 작업을 만들지 않았습니다. (--min-score로 기준 조정 가능)`);
      return;
    }
    jobId = job.id;
  }
  if (!jobId) {
    console.error("--job <id> 또는 --auto가 필요합니다");
    return usage();
  }
  if (privacy || publishAt || upload) {
    await updateJobOptions(jobId, {
      ...(privacy ? { privacy } : {}),
      ...(publishAt ? { publishAt, privacy: "private" as const } : {}),
      ...(upload ? { upload: true } : {}),
    });
  }
  await runAndReport(jobId, { from, to, force, upload, privacy, publishAt });
}

async function cmdStage(stage: StageKey, flags: Args["flags"]): Promise<void> {
  const jobId = flagStr(flags, "job");
  if (!jobId) {
    console.error("--job <id>가 필요합니다");
    return usage();
  }
  const privacy = parsePrivacy(flagStr(flags, "privacy"));
  const publishAt = parsePublishAt(flagStr(flags, "publish-at"));
  await runAndReport(jobId, {
    from: stage,
    to: stage,
    force: flagBool(flags, "force"),
    upload: stage === "upload",
    privacy,
    publishAt,
  });
}

async function cmdList(): Promise<void> {
  const jobs = await listJobs();
  if (!jobs.length) {
    console.log("작업이 없습니다. `npm run yt -- new --topic \"…\"` 또는 `npm run yt -- demo`");
    return;
  }
  for (const job of jobs) {
    const s = await summarizeJob(job);
    const dots = STAGES.map((k) => {
      const st = s.stages[k];
      return st === "done" ? "●" : st === "running" ? "◐" : st === "failed" ? "✖" : st === "skipped" ? "◌" : "○";
    }).join("");
    console.log(`${s.id}  ${dots}  ${s.title}${s.demo ? " (데모)" : ""}${s.running ? " ⏳" : ""}${s.youtubeUrl ? `  ${s.youtubeUrl}` : ""}`);
  }
  console.log(`\n단계: ${STAGES.map((k) => STAGE_LABELS[k]).join(" ")} (● 완료 ◐ 실행 중 ✖ 실패 ◌ 건너뜀 ○ 대기)`);
}

async function cmdDemo(flags: Args["flags"]): Promise<void> {
  console.log("오프라인 데모: 템플릿 대본 → Edge TTS → 카드 렌더 → ffmpeg 합성 → 썸네일");
  const status = await buildEnvStatus({ ensureFonts: true });
  if (!status.tools.ffmpeg.ok || !status.tools.chromium.ok) {
    for (const line of describeEnvStatus(status)) console.log(line);
    console.error("\nffmpeg/Chromium이 필요합니다.");
    process.exit(1);
  }
  const job = await createDemoJob();
  console.log(`데모 작업: ${job.id}`);
  await runAndReport(job.id, { to: "thumbnail" });
  if (process.exitCode === 1) return;
  const p = jobPaths(job.id);
  console.log(`\n산출물:\n  ${p.finalVideo}\n  ${p.thumbnailPng}\n  ${p.srtFile}`);
  if (!flagBool(flags, "keep")) {
    console.log(`(--keep 없이 실행되어 작업 디렉터리는 유지하되, 다음 데모 전 정리하려면: npm run yt -- delete --job ${job.id})`);
  }
}

async function cmdDelete(flags: Args["flags"]): Promise<void> {
  const jobId = flagStr(flags, "job");
  if (!jobId) {
    console.error("--job <id>가 필요합니다");
    return usage();
  }
  if (await isRunning(jobId)) {
    console.error("실행 중인 작업은 삭제할 수 없습니다");
    process.exit(1);
  }
  const job = await loadJob(jobId);
  if (!job) {
    console.error(`작업을 찾을 수 없습니다: ${jobId}`);
    process.exit(2);
  }
  await deleteJob(jobId);
  console.log(`삭제됨: ${jobId}`);
}

async function cmdAuth(flags: Args["flags"]): Promise<void> {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    console.error(
      "YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET가 필요합니다.\n" +
        "Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(데스크톱 앱) 생성 후 .env.local에 넣으세요.\n" +
        "YouTube Data API v3를 프로젝트에서 사용 설정하고, OAuth 동의 화면의 테스트 사용자에 본인 계정을 추가하세요.",
    );
    process.exit(2);
  }
  const port = Number(flagStr(flags, "port") ?? 8484) || 8484;
  const { refreshToken } = await startLocalOAuth({ clientId, clientSecret, port, log });
  console.log("\n발급 완료. .env.local에 추가하세요:");
  console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
  console.log("※ OAuth 앱이 '테스트' 상태면 리프레시 토큰이 7일 후 만료됩니다 — 앱을 게시하거나 주기적으로 재발급하세요.");
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (flags.help || command === "help" || command === "--help") usage(0);
  switch (command) {
    case "doctor":
      return cmdDoctor();
    case "research":
      return cmdResearch(flags);
    case "new":
      return cmdNew(flags);
    case "run":
      return cmdRun(flags);
    case "script":
    case "voice":
    case "visuals":
    case "render":
    case "thumbnail":
    case "upload":
      return cmdStage(command, flags);
    case "status": {
      const jobId = flagStr(flags, "job");
      if (jobId) return printJobStatus(jobId);
      return cmdList();
    }
    case "list":
      return cmdList();
    case "delete":
      return cmdDelete(flags);
    case "demo":
      return cmdDemo(flags);
    case "auth":
      return cmdAuth(flags);
    case "open": {
      // 작업 디렉터리 경로 출력 (탐색기 연동용)
      const jobId = flagStr(flags, "job");
      if (!jobId) return usage();
      console.log(path.resolve(jobPaths(jobId).root));
      return;
    }
    default:
      console.error(`알 수 없는 명령: ${command}`);
      return usage();
  }
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  // 로그 디렉터리에 마지막 오류 남기기 (대시보드에서 확인 가능)
  const jobId = flagStr(parseArgs(process.argv.slice(2)).flags, "job");
  if (jobId) {
    try {
      await fs.appendFile(jobPaths(jobId).pipelineLog, `[${new Date().toISOString()}] CLI 오류: ${err instanceof Error ? err.message : String(err)}\n`);
    } catch {
      // 무시
    }
  }
  process.exit(1);
});
