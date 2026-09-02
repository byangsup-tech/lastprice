import { NextResponse, type NextRequest } from "next/server";
import { loadProfile } from "@/lib/youtube/config";
import { loadLatestReport, runResearch } from "@/lib/youtube/research/collect";
import type { ResearchReport } from "@/lib/youtube/types";
import { isServerless, jsonError, requireDashboardToken, SERVERLESS_WRITE_ERROR } from "../_shared/http";

export const runtime = "nodejs";
// 키 없는 소스 5~6개를 병렬 수집 (소스별 10초 타임아웃) — 콜드 스타트 여유
export const maxDuration = 60;

type ResearchResponse = ResearchReport & { cacheStatus: "live" | "stale" };

function parseLimit(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

/**
 * 캐시 리포트(runResearch 내부 getCached → data 언랩 + cacheStatus)와
 * CLI가 저장한 research-latest.json 중 generatedAt이 더 최신인 쪽을 서빙한다.
 */
async function preferNewer(report: ResearchResponse): Promise<ResearchResponse> {
  const latest = await loadLatestReport().catch(() => null);
  if (latest && Date.parse(latest.generatedAt) > Date.parse(report.generatedAt)) {
    return { ...latest, cacheStatus: report.cacheStatus };
  }
  return report;
}

export async function GET(req: NextRequest) {
  const limit = parseLimit(req.nextUrl.searchParams.get("limit"));
  const profile = await loadProfile();
  try {
    const report = await runResearch(profile, { limit });
    return NextResponse.json(await preferNewer(report), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    // 수집 전체 실패 — 마지막으로 저장된 리포트라도 있으면 stale로 서빙
    const latest = await loadLatestReport().catch(() => null);
    if (latest) {
      return NextResponse.json({ ...latest, cacheStatus: "stale" } satisfies ResearchResponse, {
        headers: { "cache-control": "no-store" },
      });
    }
    return jsonError(err instanceof Error ? err.message : "리서치 수집 실패", 502);
  }
}

/** { refresh: true, limit? } — 캐시 무시하고 재수집 */
export async function POST(req: NextRequest) {
  if (isServerless()) return jsonError(SERVERLESS_WRITE_ERROR, 403);
  const denied = requireDashboardToken(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { refresh?: unknown; limit?: unknown };
  const refresh = body.refresh !== false;
  const limit = parseLimit(typeof body.limit === "number" || typeof body.limit === "string" ? String(body.limit) : null);
  const profile = await loadProfile();
  try {
    const report = await runResearch(profile, { refresh, limit });
    return NextResponse.json(report, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "리서치 수집 실패", 502);
  }
}
