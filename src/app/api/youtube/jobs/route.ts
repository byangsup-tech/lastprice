import { NextResponse, type NextRequest } from "next/server";
import { loadProfile } from "@/lib/youtube/config";
import { createJob, listJobs, summarizeJob } from "@/lib/youtube/jobs";
import { candidateToTopic, loadLatestReport } from "@/lib/youtube/research/collect";
import type { JobSummary, Topic } from "@/lib/youtube/types";
import {
  isServerless,
  jsonError,
  parseCreateJobBody,
  readJsonBody,
  requireDashboardToken,
  SERVERLESS_WRITE_ERROR,
} from "../_shared/http";

export const runtime = "nodejs";

/** 작업 목록 — createdAt 내림차순, 단계 요약 포함 */
export async function GET() {
  const jobs = await listJobs();
  const summaries: JobSummary[] = await Promise.all(jobs.map((j) => summarizeJob(j)));
  return NextResponse.json(summaries, { headers: { "cache-control": "no-store" } });
}

/**
 * 작업 생성
 * - { candidateId, options? } → 최근 리서치 리포트에서 후보 조회 (없으면 404)
 * - { topic: { title, angle?, keywords? }, options? }
 */
export async function POST(req: NextRequest) {
  if (isServerless()) return jsonError(SERVERLESS_WRITE_ERROR, 403);
  const denied = requireDashboardToken(req);
  if (denied) return denied;
  const body = await readJsonBody(req, 64 * 1024);
  if (!body.ok) return jsonError(body.error, body.status);
  const parsed = parseCreateJobBody(body.value);
  if (!parsed.ok) return jsonError(parsed.error, 400);

  let topic: Topic;
  if (parsed.body.candidateId) {
    const report = await loadLatestReport().catch(() => null);
    const candidate = report?.candidates.find((c) => c.id === parsed.body.candidateId);
    if (!candidate) {
      return jsonError("후보를 찾을 수 없습니다 — 리서치를 새로고침한 뒤 다시 시도하세요", 404);
    }
    topic = candidateToTopic(candidate);
  } else if (parsed.body.topic) {
    topic = parsed.body.topic;
  } else {
    return jsonError("topic 또는 candidateId가 필요합니다", 400);
  }

  const profile = await loadProfile();
  try {
    const job = await createJob({ topic, profile, options: parsed.body.options });
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "작업 생성 실패", 500);
  }
}
