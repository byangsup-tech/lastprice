import { NextResponse } from "next/server";
import { collectStats } from "@/lib/insurance/stats/collect";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const stats = await collectStats();
  return NextResponse.json(stats, {
    headers: {
      // 연간 통계 — 엣지에서 1시간 캐시
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
